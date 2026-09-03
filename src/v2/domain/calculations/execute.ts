import { makeEnvelope, type ValueEnvelope } from "../envelope";
import type { ProposedEvent } from "../events";
import { resolveFreshness } from "../freshness-state";
import type { RecomputeRequest, RecomputeRequestKind } from "../recompute";
import {
  FAILURE_ENGINE_THREW,
  UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET,
  UNAVAILABLE_NO_ENGINE_DATA,
  UNAVAILABLE_NO_VALIDATED_OUTCOME,
  type CalculationRejectionReason,
} from "./failure";
import {
  DEFAULT_FORMULA_SET_VERSION,
  findFormulaSet,
  type FormulaFieldDefinition,
  type FormulaSetDefinition,
} from "./formula";
import {
  calculationIdOf,
  ledgerScopeKeyOf,
  outputEnvelopeIdOf,
  proposedAssessmentIdOf,
  requestIdOf,
  slotKey,
  type CalculationId,
} from "./identity";
import {
  makeReferencedOnlyInputSnapshot,
  type CalculationInputReference,
  type CalculationInputSnapshot,
} from "./inputs";
import {
  appendCalculation,
  isCalculationLedger,
  type AppendCalculationResult,
  type CalculationLedger,
} from "./ledger";
import type {
  CalculationOutput,
  CalculationOutputField,
  CalculationRecord,
} from "./record";
import { isCanonicalInstant } from "./record";
import type { EngineEvidence, EnginePort } from "./port";
import {
  isSubjectInScope,
  subjectAssetId,
  subjectIdentityParts,
  REQUIRED_SUBJECT_KIND,
  VALID_TRIGGERS,
  type CalculationSubject,
} from "./subject";
import { computeWorkReadiness } from "./work-readiness";
import { computeTurnaroundLeadTimeFit } from "./turnaround-fit";
import {
  REQUIRED_SPARE_CARDINALITY_POLICY_REFERENCE,
  REQUIRED_SPARE_CARDINALITY_POLICY_VERSION,
} from "./policy/spare-cardinality";

/**
 * Slice 2.1c — governed calculation EXECUTION.
 *
 * This is the only place a recompute request meets an engine, and it does four
 * things and nothing else:
 *
 * 1. decides admissibility BEFORE invoking the port, so a mismatched trigger or
 *    subject can never reach an engine;
 * 2. delegates every number to the existing engines through `EnginePort` —
 *    there is no arithmetic on a governed value in this module;
 * 3. wraps each returned number in a Slice 2.1a `ValueEnvelope` whose
 *    provenance, formula version, freshness class and value status come from
 *    the governed formula registry, not from the caller or the adapter;
 * 4. appends exactly one immutable record — produced, unavailable or failed.
 *
 * It never appends a governed event, never mutates a `LifecycleSnapshot` and
 * never promotes anything. Where a produced calculation implies a governed
 * fact, it returns the EXISTING `ProposedEvent` — which has no event id, no
 * sequence and no actor, and so is structurally unable to enter `appendEvent`.
 * A human or system actor must mint and record the authoritative event.
 *
 * Nothing here reads a clock: every instant comes from `request.asOf`, which the
 * governed event carried.
 */

const KNOWN_KINDS: readonly RecomputeRequestKind[] = Object.freeze([
  "asset_assessment",
  "oee_reconciliation",
  "decision_projected_value",
  "work_readiness",
  "turnaround_lead_time_fit",
  "realised_value",
] as const);

function reject(
  ledger: CalculationLedger,
  reason: CalculationRejectionReason,
  detail: string,
): AppendCalculationResult {
  return { outcome: "rejected", reason, detail, ledger, proposedEvents: Object.freeze([]) };
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

// ---------------------------------------------------------------------------
// Envelope and field construction
// ---------------------------------------------------------------------------

interface EnvelopeContext {
  readonly calculationId: CalculationId;
  readonly asOf: string;
  readonly requestedByEventId: string;
  readonly evidence: EngineEvidence;
}

function availableEnvelope(
  context: EnvelopeContext,
  definition: FormulaFieldDefinition,
  value: number,
): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: outputEnvelopeIdOf(context.calculationId, definition.name),
    value,
    provenance: definition.provenance,
    sourceMode: context.evidence.sourceMode,
    freshness: resolveFreshness({
      sourceKey: context.evidence.sourceKey,
      freshnessClass: definition.freshnessClass,
      capturedAt: context.evidence.capturedAt,
      asOf: context.asOf,
    }),
    formulaVersion: definition.formula.version,
    evidenceIds: context.evidence.evidenceIds,
    asOf: context.asOf,
    capturedAt: context.evidence.capturedAt,
    producedAt: context.asOf,
    createdByEventId: context.requestedByEventId,
  });
}

function unavailableEnvelope(
  context: EnvelopeContext,
  definition: FormulaFieldDefinition,
  reason: string,
): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: outputEnvelopeIdOf(context.calculationId, definition.name),
    value: null,
    unavailableReason: reason,
    provenance: definition.provenance,
    sourceMode: context.evidence.sourceMode,
    freshness: resolveFreshness({
      sourceKey: context.evidence.sourceKey,
      freshnessClass: definition.freshnessClass,
      capturedAt: context.evidence.capturedAt,
      asOf: context.asOf,
    }),
    formulaVersion: definition.formula.version,
    evidenceIds: context.evidence.evidenceIds,
    asOf: context.asOf,
    capturedAt: context.evidence.capturedAt,
    producedAt: context.asOf,
    createdByEventId: context.requestedByEventId,
  });
}

function producedField(
  context: EnvelopeContext,
  definition: FormulaFieldDefinition,
  value: number | null,
  unavailableReason: string,
): CalculationOutputField {
  if (value === null || !Number.isFinite(value)) {
    return Object.freeze({
      name: definition.name,
      formula: definition.formula,
      valueStatus: null,
      envelope: unavailableEnvelope(context, definition, unavailableReason),
    });
  }
  return Object.freeze({
    name: definition.name,
    formula: definition.formula,
    valueStatus: definition.valueStatus,
    envelope: availableEnvelope(context, definition, value),
  });
}

/**
 * An UNAVAILABLE result still records every registered field, each carrying an
 * explicitly unavailable envelope with the governed reason. Absence is stated,
 * never implied, and never rendered as `0`.
 */
function unavailableOutput(
  context: EnvelopeContext,
  set: FormulaSetDefinition,
  reason: string,
): CalculationOutput {
  return Object.freeze({
    outcome: "unavailable" as const,
    unavailableReason: reason,
    fields: Object.freeze(
      set.fields.map((definition) =>
        Object.freeze({
          name: definition.name,
          formula: definition.formula,
          valueStatus: null,
          envelope: unavailableEnvelope(context, definition, reason),
        }),
      ),
    ),
  });
}

/** Evidence stand-in for a calculation that never reached an engine. */
const NO_EVIDENCE: EngineEvidence = Object.freeze({
  sourceKey: "local_seed" as const,
  sourceMode: "local" as const,
  capturedAt: null,
  evidenceIds: Object.freeze([]),
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const DATASET_LIMITATION =
  "The engine consumed the full seeded dataset window (sensor readings, production runs and downtime events); those rows are referenced, not retained in this record.";
const DATASET_REPRODUCTION =
  "Reproduction requires the same seeded dataset at the same seed and anchor, replayed through the referenced engine entry points.";

function referencedInputs(
  references: readonly CalculationInputReference[],
): CalculationInputSnapshot {
  return makeReferencedOnlyInputSnapshot({
    limitation: DATASET_LIMITATION,
    reproductionRequires: DATASET_REPRODUCTION,
    references,
  });
}

/**
 * The input snapshot for one recompute kind. Work readiness additionally
 * attributes the governed required-spare cardinality policy — both as a
 * structured constant reference and as the snapshot's `cardinalityPolicyVersion`
 * — because its result depends on that assumption. No other kind carries it.
 */
function inputsForKind(
  kind: RecomputeRequestKind,
  subject: CalculationSubject,
): CalculationInputSnapshot {
  if (kind === "work_readiness") {
    return makeReferencedOnlyInputSnapshot({
      limitation: DATASET_LIMITATION,
      reproductionRequires: DATASET_REPRODUCTION,
      references: [subjectReference(subject), REQUIRED_SPARE_CARDINALITY_POLICY_REFERENCE],
      cardinalityPolicyVersion: REQUIRED_SPARE_CARDINALITY_POLICY_VERSION,
    });
  }
  return referencedInputs([subjectReference(subject)]);
}

function subjectReference(subject: CalculationSubject): CalculationInputReference {
  switch (subject.kind) {
    case "supervision_case":
      return { kind: "asset", id: subject.assetId, description: "Supervised asset under this case." };
    case "production_line":
      return { kind: "production_line", id: subject.lineId, description: "Production line reconciled." };
    case "recommendation":
      return { kind: "recommendation", id: subject.recommendationId, description: "Recommendation whose projected value was requested." };
    case "work_order":
      return { kind: "work_order", id: subject.workOrderId, description: "Work order whose readiness was requested." };
    case "turnaround_scope":
      return { kind: "turnaround_scope", id: subject.turnaroundScopeId, description: "Turnaround scope whose lead-time fit was requested." };
    case "outcome":
      return { kind: "outcome", id: subject.outcomeId, description: "Outcome whose realised value was requested." };
    case "portfolio":
      return { kind: "portfolio", id: subject.portfolioId, description: "Portfolio under evaluation." };
    default:
      return { kind: "dataset", id: "unknown", description: "Unrecognised subject." };
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

interface EngineOutcome {
  readonly output: CalculationOutput;
  readonly evidence: EngineEvidence;
}

/**
 * Execute one governed recompute request against the calculation ledger.
 *
 * There is deliberately NO separate triggering-event-type argument: the type is
 * carried authoritatively on the request itself (Slice 2.1b.1), so the caller
 * cannot present one event as the justification while naming another.
 */
export function executeRecompute(
  ledger: CalculationLedger,
  request: RecomputeRequest,
  subject: CalculationSubject,
  port: EnginePort,
): AppendCalculationResult {
  if (!isCalculationLedger(ledger)) {
    // Delegated so the ledger owns its own integrity failure, and so the SAME
    // `GovernedIntegrityError` is thrown as everywhere else.
    return appendCalculation(ledger as CalculationLedger, {} as CalculationRecord);
  }

  // --- 1. Request admissibility, all decided before any engine is invoked ---

  if (typeof request !== "object" || request === null) {
    return reject(ledger, "malformed_calculation", "A recompute request must be an object.");
  }
  if (!KNOWN_KINDS.includes(request.kind)) {
    return reject(
      ledger,
      "unknown_calculation_kind",
      `Unknown calculation kind "${String(request.kind)}".`,
    );
  }
  if (!isNonEmpty(request.requestedByEventId)) {
    return reject(
      ledger,
      "malformed_calculation",
      "A recompute request requires a non-empty requestedByEventId.",
    );
  }
  if (!isCanonicalInstant(request.asOf)) {
    return reject(
      ledger,
      "invalid_timestamp",
      `asOf "${String(request.asOf)}" is not a canonical UTC instant.`,
    );
  }
  if (!VALID_TRIGGERS[request.kind].includes(request.requestedByEventType)) {
    return reject(
      ledger,
      "recompute_trigger_mismatch",
      `"${request.kind}" cannot be emitted by "${String(request.requestedByEventType)}".`,
    );
  }
  if (typeof subject !== "object" || subject === null) {
    return reject(ledger, "missing_subject_identity", "A calculation requires a subject.");
  }
  if (REQUIRED_SUBJECT_KIND[request.kind] !== subject.kind) {
    return reject(
      ledger,
      "calculation_subject_kind_mismatch",
      `"${request.kind}" requires a "${REQUIRED_SUBJECT_KIND[request.kind]}" subject; received "${String(subject.kind)}".`,
    );
  }
  if (subjectIdentityParts(subject) === null) {
    return reject(
      ledger,
      "missing_subject_identity",
      "Every calculation subject identity component must be non-empty.",
    );
  }
  const assetOfSubject = subjectAssetId(subject);
  if (assetOfSubject !== null && assetOfSubject !== request.assetId) {
    return reject(
      ledger,
      "request_subject_asset_mismatch",
      `The request names asset "${request.assetId}" but the subject belongs to "${assetOfSubject}".`,
    );
  }
  if (!isSubjectInScope(ledger.scope, subject)) {
    return reject(
      ledger,
      "subject_out_of_ledger_scope",
      `A "${subject.kind}" subject does not belong to this "${ledger.scope.kind}" ledger.`,
    );
  }

  // --- 2. Identity, conflict and duplication, still before the engine --------

  const formulaSetVersion = DEFAULT_FORMULA_SET_VERSION[request.kind];
  const set = findFormulaSet(request.kind, formulaSetVersion);
  if (set === null) {
    return reject(
      ledger,
      "formula_set_not_registered",
      `Formula set "${formulaSetVersion}" is not registered for "${request.kind}".`,
    );
  }
  const requestId = requestIdOf(request.kind, subject, request.requestedByEventId);
  const calculationId = calculationIdOf(requestId, formulaSetVersion);
  const slot = slotKey(request.kind, subject);

  const conflicting = ledger.records.find(
    (r) => r.record.requestId === requestId && r.record.asOf !== request.asOf,
  );
  if (conflicting) {
    return reject(
      ledger,
      "calculation_request_identity_conflict",
      `Request "${requestId}" was already evaluated at "${conflicting.record.asOf}"; "${request.asOf}" conflicts.`,
    );
  }
  if (ledger.records.some((r) => r.record.calculationId === calculationId)) {
    return {
      outcome: "ignored",
      reason: "duplicate_calculation_ignored",
      detail: `Calculation "${calculationId}" has already been accepted.`,
      ledger,
      proposedEvents: Object.freeze([]),
    };
  }

  // --- 3. Engine invocation --------------------------------------------------

  const baseContext = {
    calculationId,
    asOf: request.asOf,
    requestedByEventId: request.requestedByEventId,
  } as const;

  let engineOutcome: EngineOutcome;
  try {
    engineOutcome = runEngine(request, subject, port, set, baseContext);
  } catch (error) {
    engineOutcome = {
      evidence: NO_EVIDENCE,
      output: Object.freeze({
        outcome: "failed" as const,
        failureReason: FAILURE_ENGINE_THREW,
        detail:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : `Engine threw a non-Error value: ${String(error)}`,
      }),
    };
  }

  // --- 4. Record construction and append ------------------------------------

  const produced = engineOutcome.output.outcome === "produced";
  const record: CalculationRecord = {
    calculationId,
    requestId,
    slot,
    ledgerScopeKey: ledgerScopeKeyOf(ledger.scope),
    subject,
    sequence: ledger.records.length + 1,
    kind: request.kind,
    requestedByEventId: request.requestedByEventId,
    requestedByEventType: request.requestedByEventType,
    asOf: request.asOf,
    formulaSetVersion,
    inputs: inputsForKind(request.kind, subject),
    output: engineOutcome.output,
    // An unavailable or failed attempt supersedes nothing: the last genuinely
    // produced value stays the governed head.
    supersedesCalculationId: produced
      ? (ledger.latestProducedBySlot[slot] ?? null)
      : null,
  };

  const result = appendCalculation(ledger, record);
  if (result.outcome !== "accepted") return result;

  return {
    ...result,
    proposedEvents: proposalsFor(ledger, result.record),
  };
}

function runEngine(
  request: RecomputeRequest,
  subject: CalculationSubject,
  port: EnginePort,
  set: FormulaSetDefinition,
  base: { readonly calculationId: CalculationId; readonly asOf: string; readonly requestedByEventId: string },
): EngineOutcome {
  const definition = (name: string): FormulaFieldDefinition =>
    set.fields.find((f) => f.name === name) as FormulaFieldDefinition;

  switch (request.kind) {
    case "asset_assessment": {
      const result = port.assessAsset(request.assetId);
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze([
            producedField(context, definition("healthScore"), result.healthScore, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("riskScore"), result.riskScore, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("timeToCriticalDays"), result.projectedDaysToCritical, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("valueAtStakeUsd"), result.valueAtStakeUsd, UNAVAILABLE_NO_ENGINE_DATA),
          ]),
        }),
      };
    }

    case "oee_reconciliation": {
      const lineId = subject.kind === "production_line" ? subject.lineId : "";
      const result = port.reconcileProductionLine(lineId);
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_ENGINE_DATA),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze([
            producedField(context, definition("oee"), result.oee, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("availability"), result.availability, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("performance"), result.performance, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("quality"), result.quality, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("availabilityLossUnits"), result.availabilityLossUnits, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("performanceLossUnits"), result.performanceLossUnits, UNAVAILABLE_NO_ENGINE_DATA),
            producedField(context, definition("qualityLossUnits"), result.qualityLossUnits, UNAVAILABLE_NO_ENGINE_DATA),
          ]),
        }),
      };
    }

    case "decision_projected_value": {
      const recommendationId =
        subject.kind === "recommendation" ? subject.recommendationId : "";
      const result = port.projectRecommendationValue(recommendationId, request.assetId);
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_ENGINE_DATA),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze([
            producedField(
              context,
              definition("projectedValueEnabledUsd"),
              result.projectedValueEnabledUsd,
              UNAVAILABLE_NO_ENGINE_DATA,
            ),
          ]),
        }),
      };
    }

    case "work_readiness": {
      const workOrderId = subject.kind === "work_order" ? subject.workOrderId : "";
      const result = port.workOrderMaterialsEvidence(workOrderId, request.assetId);
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_ENGINE_DATA),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      const computed = computeWorkReadiness({
        requiredSpareIds: result.requiredSpareIds,
        spareBalances: result.spareBalances,
        capturedAt: result.evidence.capturedAt,
        asOf: base.asOf,
      });
      if (computed.overall.status === "unavailable") {
        return {
          evidence: result.evidence,
          output: unavailableOutput(context, set, computed.overall.reason),
        };
      }
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze(
            computed.fields.map((f) =>
              producedField(context, definition(f.name), f.value, f.unavailableReason),
            ),
          ),
        }),
      };
    }
    case "turnaround_lead_time_fit": {
      const turnaroundScopeId =
        subject.kind === "turnaround_scope" ? subject.turnaroundScopeId : "";
      const workOrderId =
        subject.kind === "turnaround_scope" ? subject.workOrderId : "";
      const result = port.turnaroundLeadTimeEvidence(
        turnaroundScopeId,
        workOrderId,
        request.assetId,
      );
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_ENGINE_DATA),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      const computed = computeTurnaroundLeadTimeFit({
        requiredSpareIds: result.requiredSpareIds,
        spareLeadTimes: result.spareLeadTimes,
        turnaroundStartIso: result.turnaroundStartIso,
        capturedAt: result.evidence.capturedAt,
        asOf: base.asOf,
      });
      if (computed.overall.status === "unavailable") {
        return {
          evidence: result.evidence,
          output: unavailableOutput(context, set, computed.overall.reason),
        };
      }
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze(
            computed.fields.map((f) =>
              producedField(context, definition(f.name), f.value, f.unavailableReason),
            ),
          ),
        }),
      };
    }

    case "realised_value": {
      const outcomeId = subject.kind === "outcome" ? subject.outcomeId : "";
      const result = port.realisedValueForOutcome(outcomeId, request.assetId);
      if (result === null) {
        const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
        return {
          evidence: NO_EVIDENCE,
          output: unavailableOutput(context, set, UNAVAILABLE_NO_VALIDATED_OUTCOME),
        };
      }
      const context: EnvelopeContext = { ...base, evidence: result.evidence };
      // `available` is the governing flag, never the number. A defaulted or
      // portfolio-wide `0` therefore cannot be recorded as an available zero,
      // while a genuinely governed zero is accepted as a real value.
      if (!result.available || result.realisedValueUsd === null) {
        return {
          evidence: result.evidence,
          output: unavailableOutput(
            context,
            set,
            result.unavailableReason ?? UNAVAILABLE_NO_VALIDATED_OUTCOME,
          ),
        };
      }
      return {
        evidence: result.evidence,
        output: Object.freeze({
          outcome: "produced" as const,
          fields: Object.freeze([
            producedField(
              context,
              definition("realisedValueUsd"),
              result.realisedValueUsd,
              UNAVAILABLE_NO_VALIDATED_OUTCOME,
            ),
          ]),
        }),
      };
    }

    default: {
      const context: EnvelopeContext = { ...base, evidence: NO_EVIDENCE };
      return {
        evidence: NO_EVIDENCE,
        output: unavailableOutput(context, set, UNAVAILABLE_NO_ENGINE_DATA),
      };
    }
  }
}

/**
 * Candidate governed events a PRODUCED calculation offers back to the Slice
 * 2.1b append boundary.
 *
 * Only `asset_assessment` and `realised_value` imply a governed fact. OEE
 * reconciliation and projected value produce ledger records and no lifecycle
 * proposal at all — neither is a lifecycle transition.
 *
 * Unavailable and failed outputs return an empty array structurally: there is
 * no branch in which an absent value proposes an event.
 */
function proposalsFor(
  ledger: CalculationLedger,
  record: CalculationRecord,
): readonly ProposedEvent[] {
  if (record.output.outcome !== "produced") return Object.freeze([]);
  if (ledger.scope.kind !== "supervision_case") return Object.freeze([]);

  const aggregateId = ledger.scope.caseId;
  const fieldEnvelope = (name: string): ValueEnvelope<number> | null => {
    if (record.output.outcome !== "produced") return null;
    return record.output.fields.find((f) => f.name === name)?.envelope ?? null;
  };

  if (record.kind === "asset_assessment" && record.subject.kind === "supervision_case") {
    const valueAtStake = fieldEnvelope("valueAtStakeUsd");
    if (valueAtStake === null) return Object.freeze([]);
    return Object.freeze([
      Object.freeze({
        aggregateId,
        occurredAt: record.asOf,
        asOf: record.asOf,
        type: "AssessmentComputed" as const,
        payload: Object.freeze({
          assessmentId: proposedAssessmentIdOf(record.calculationId),
          assetId: record.subject.assetId,
          valueAtStake,
        }),
      }),
    ]);
  }

  if (record.kind === "realised_value" && record.subject.kind === "outcome") {
    const realisedValue = fieldEnvelope("realisedValueUsd");
    if (realisedValue === null || realisedValue.status !== "available") {
      return Object.freeze([]);
    }
    return Object.freeze([
      Object.freeze({
        aggregateId,
        occurredAt: record.asOf,
        asOf: record.asOf,
        type: "RealisedValueRecorded" as const,
        payload: Object.freeze({
          outcomeId: record.subject.outcomeId,
          realisedValue,
        }),
      }),
    ]);
  }

  return Object.freeze([]);
}
