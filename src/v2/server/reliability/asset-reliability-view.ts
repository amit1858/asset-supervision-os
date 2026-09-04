import "server-only";

import { ANCHOR_NOW, LINE } from "@/data/constants";
import { getRepository, type Asset360Model } from "@/data/repository";
import { getPersona, personaCan } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import { ruleForAct } from "@/v2/domain/authority-policy";
import {
  inventoryBufferSelector,
  materialsReadinessSelector,
} from "@/v2/domain/calculations/selectors";
import type {
  CalculationSubject,
  LedgerScope,
} from "@/v2/domain/calculations/subject";
import { turnaroundFitSelector } from "@/v2/domain/calculations/turnaround-fit";
import { executeRecompute } from "@/v2/domain/calculations/execute";
import { createLedger } from "@/v2/domain/calculations/ledger";
import { isAvailable, type ValueEnvelope } from "@/v2/domain/envelope";
import type { GovernedEventType } from "@/v2/domain/events";
import type { LifecyclePhase } from "@/v2/domain/lifecycle";
import { requiresEndorsement } from "@/v2/domain/policy/exposure-threshold";
import type { RecomputeRequest } from "@/v2/domain/recompute";
import { getEngineAdapter } from "@/v2/server/calculations";
import {
  buildK201Projection,
  K201_ASSET_ID,
} from "./lifecycle-projection";
import {
  formatDays,
  formatPercent,
  formatScore,
  formatUsd,
  freshnessLabel,
  trustLabel,
  UNAVAILABLE_DISPLAY,
  type AssetReliabilityView,
  type AuthorityActorView,
  type AuthorityDecisionView,
  type GovernedMetricView,
  type LifecycleProjectionEntryView,
  type WorkReadinessView,
  type TurnaroundFitView,
  type EvidenceLineageRowView,
} from "@/v2/reliability/view-types";

/**
 * September 6–7 Reliability experience — the K-201 Asset 360 + Assessment &
 * Decision READ MODEL (server-only).
 *
 * Every governed number is resolved by executing the SAME governed calculation
 * ledger the rest of the system uses (`executeRecompute` against the real
 * seeded engines) and reading the resulting `ValueEnvelope`s. Nothing here
 * recomputes an operational value, and nothing reads a clock: each calculation
 * is evaluated at an explicit, injected instant.
 *
 * The governed exposure that resolves `exposure-threshold.v1` is the SAME
 * envelope value that feeds the endorsement banner, so the UI can never cite a
 * different figure than the policy evaluated.
 */

const TAG = "K-201";
export const K201_TAG = TAG;

/**
 * The K-201 assessment is evaluated at the evidence-capture instant (06:00Z on
 * the anchor day). At the dataset anchor (midnight) the sensor evidence is
 * future-dated, so its freshness is `unknown`; at 06:00 every assessment field
 * — health 52, risk 68, time-to-critical 17.929…, exposure 1,620,156 — is both
 * the golden value AND `fresh`, which is exactly what a governed, resolvable
 * assessment requires. Materials and turnaround evidence are captured later and
 * are evaluated at noon, matching the existing governed goldens.
 */
export const ASSESSMENT_AS_OF = "2026-07-27T06:00:00.000Z";
export const MATERIALS_AS_OF = "2026-07-27T12:00:00.000Z";
export const TURNAROUND_AS_OF = "2026-07-27T12:00:00.000Z";

const CASE_SUBJECT: CalculationSubject = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: K201_ASSET_ID,
};
const CASE_SCOPE: LedgerScope = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: K201_ASSET_ID,
};
const LINE_SUBJECT: CalculationSubject = { kind: "production_line", lineId: LINE.id };
const LINE_SCOPE: LedgerScope = { kind: "production_line", lineId: LINE.id };

const port = getEngineAdapter();

type MetricFormat = "score" | "percent" | "days" | "usd";

function request(overrides: Partial<RecomputeRequest>): RecomputeRequest {
  return {
    kind: "asset_assessment",
    assetId: K201_ASSET_ID,
    requestedByEventId: "read-model",
    requestedByEventType: "ConditionSignalIngested",
    asOf: ASSESSMENT_AS_OF,
    ...overrides,
  } as RecomputeRequest;
}

/** Run one governed calculation and return its fields as an envelope map. */
function envelopes(
  scope: LedgerScope,
  subject: CalculationSubject,
  overrides: Partial<RecomputeRequest>,
): Map<string, ValueEnvelope<number>> {
  const result = executeRecompute(createLedger(scope), request(overrides), subject, port);
  const map = new Map<string, ValueEnvelope<number>>();
  if (result.outcome !== "accepted") return map;
  const output = result.record.output;
  if (output.outcome === "failed") return map;
  for (const field of output.fields) map.set(field.name, field.envelope);
  return map;
}

function displayFor(format: MetricFormat, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE_DISPLAY;
  switch (format) {
    case "score":
      return formatScore(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return formatDays(value);
    case "usd":
      return formatUsd(value);
  }
}

function toMetric(
  key: string,
  label: string,
  envelope: ValueEnvelope<number> | undefined,
  format: MetricFormat,
): GovernedMetricView {
  if (!envelope) {
    return {
      key,
      label,
      available: false,
      display: UNAVAILABLE_DISPLAY,
      rawValue: null,
      freshness: "missing",
      freshnessLabel: freshnessLabel("missing"),
      trust: "unknown",
      trustLabel: trustLabel("unknown"),
      provenance: "deterministic",
      sourceMode: "local",
      formulaVersion: "n/a",
      asOf: ASSESSMENT_AS_OF,
      evidenceIds: [],
      unavailableReason: "calculation_not_produced",
    };
  }
  const available = isAvailable(envelope);
  const rawValue = available ? envelope.value : null;
  return {
    key,
    label,
    available,
    display: available ? displayFor(format, rawValue) : UNAVAILABLE_DISPLAY,
    rawValue,
    freshness: envelope.freshness,
    freshnessLabel: freshnessLabel(envelope.freshness),
    trust: envelope.trustClassification,
    trustLabel: trustLabel(envelope.trustClassification),
    provenance: envelope.provenance,
    sourceMode: envelope.sourceMode,
    formulaVersion: envelope.formulaVersion,
    asOf: envelope.asOf,
    evidenceIds: envelope.evidenceIds,
    unavailableReason: available ? null : envelope.unavailableReason,
  };
}

const PHASE_LABEL: Record<LifecyclePhase, string> = {
  SIGNAL_DETECTED: "Signal detected",
  RISK_ASSESSED: "Risk assessed",
  DECISION_PROPOSED: "Decision proposed",
  DECISION_RECORDED: "Decision recorded",
  WORK_PLANNED: "Work planned",
  MATERIALS_CHECKED: "Materials checked",
  TURNAROUND_SCOPE_RETAINED: "Turnaround scope retained",
  EXECUTION_OUTCOME_PENDING: "Execution outcome pending",
  VALUE_VALIDATION_PENDING: "Value validation pending",
};

const EVENT_LABEL: Partial<Record<GovernedEventType, string>> = {
  ConditionSignalIngested: "Condition signal ingested",
  ProductionObservationIngested: "Production observation ingested",
  AssessmentComputed: "Assessment computed",
  RecommendationGenerated: "Recommendation generated",
};

function projectionSummary(
  type: GovernedEventType,
  exposureDisplay: string,
): string {
  switch (type) {
    case "ConditionSignalIngested":
      return "Condition evidence ingested for K-201; requests a governed asset assessment.";
    case "ProductionObservationIngested":
      return "Production observation ingested for the HDS-2 line; requests an OEE reconciliation.";
    case "AssessmentComputed":
      return `Governed assessment recorded (exposure ${exposureDisplay}, evidence fresh); advances to Risk assessed.`;
    case "RecommendationGenerated":
      return "Recommendation grounded in the governing assessment; advances to Decision proposed — awaiting a human decision.";
    default:
      return "";
  }
}

function buildAuthority(
  viewerId: PersonaId,
  exposureEnvelope: ValueEnvelope<number> | undefined,
): AuthorityDecisionView {
  // The endorsement requirement is resolved from the SAME governed exposure the
  // banner cites, at the SAME instant the assessment was evaluated.
  const requirement = exposureEnvelope
    ? requiresEndorsement(exposureEnvelope, ASSESSMENT_AS_OF)
    : "undeterminable";
  const bannerValue =
    exposureEnvelope && isAvailable(exposureEnvelope) ? exposureEnvelope.value : null;

  const approveRule = ruleForAct("approve");
  const endorseRule = ruleForAct("endorse");

  const rmEligible =
    personaCan("reliability_manager", approveRule.requiredCapability) &&
    approveRule.allowedPersonaIds.includes("reliability_manager");

  const actors: AuthorityActorView[] = [
    {
      personaId: "reliability_engineer",
      displayName: getPersona("reliability_engineer").displayName,
      role: "Reliability Engineer",
      act: null,
      actLabel: "Review condition & evidence",
      capabilityHeld: personaCan("reliability_engineer", "view_asset_condition"),
      policyPermits: false,
      eligibleNow: false,
      standing:
        "Reviews the governed assessment, evidence and recommendation. Holds no decision authority in this workflow.",
    },
    {
      personaId: "reliability_manager",
      displayName: getPersona("reliability_manager").displayName,
      role: "Reliability Manager",
      act: "approve",
      actLabel: "Approve, decline or return",
      capabilityHeld: personaCan("reliability_manager", approveRule.requiredCapability),
      policyPermits: approveRule.allowedPersonaIds.includes("reliability_manager"),
      eligibleNow: rmEligible,
      standing: rmEligible
        ? "Owns the governed decision now: may approve, decline or return the recommendation."
        : "Does not currently hold the governed decision.",
    },
    {
      personaId: "plant_manager",
      displayName: getPersona("plant_manager").displayName,
      role: "Plant Manager",
      act: "endorse",
      actLabel: "Endorse high-exposure decision",
      capabilityHeld: personaCan("plant_manager", endorseRule.requiredCapability),
      policyPermits: endorseRule.allowedPersonaIds.includes("plant_manager"),
      // Endorsement only becomes actionable AFTER an approval is recorded and
      // the decision enters pending_endorsement — it is not available now.
      eligibleNow: false,
      standing:
        requirement === "required"
          ? `Endorsement required after Reliability Manager approval because exposure ${formatUsd(bannerValue)} is at or above the $1,000,000 threshold. Not yet actionable — no approval is recorded.`
          : "Endorsement is not currently required for this decision.",
    },
  ];

  const nextActPersona = getPersona("reliability_manager");
  const viewer = getPersona(viewerId);
  const viewerOwnsNext = viewerId === "reliability_manager" && rmEligible;
  const viewerReason =
    viewerId === "reliability_manager"
      ? "You hold approval authority for this decision: approve, decline or return."
      : viewerId === "plant_manager"
        ? "Your endorsement will be required after the Reliability Manager approves. No action is available yet."
        : viewerId === "reliability_engineer"
          ? "You can review the governed assessment and evidence. Approval authority belongs to the Reliability Manager."
          : "This decision is owned by the Reliability Manager. You are viewing it read-only.";

  const endorsementBanner =
    requirement === "required"
      ? `Decision exposure ${formatUsd(bannerValue)}. High-exposure governance applies: Plant Manager endorsement is required after Reliability Manager approval.`
      : requirement === "not_required"
        ? `Decision exposure ${formatUsd(bannerValue)} is below the $1,000,000 endorsement threshold; no Plant Manager endorsement is required.`
        : "The endorsement requirement cannot be resolved from the current governed evidence.";

  return {
    phase: "DECISION_PROPOSED",
    phaseLabel: PHASE_LABEL.DECISION_PROPOSED,
    decisionStatus: "proposed",
    decisionStatusLabel: "Proposed — awaiting a human decision",
    nextActLabel: "Reliability Manager approval",
    nextActPersonaId: "reliability_manager",
    nextActPersonaName: nextActPersona.displayName,
    endorsementRequirement: requirement,
    endorsementRequired: requirement === "required",
    endorsementBannerValueUsd: bannerValue,
    endorsementBanner,
    actors,
    viewer: {
      personaId: viewerId,
      displayName: viewer.displayName,
      canActOnNext: viewerOwnsNext,
      reason: viewerReason,
    },
    readOnlyNotice:
      "Read-only governance view. Governed decisions are recorded only through the server-side authority workflow, never from this screen.",
  };
}

function buildWorkReadiness(
  workOrderId: string,
): { view: WorkReadinessView; lineage: EvidenceLineageRowView | null } {
  const map = envelopes(CASE_SCOPE, { kind: "work_order", workOrderId, assetId: K201_ASSET_ID }, {
    kind: "work_readiness",
    requestedByEventType: "MaterialsChecked",
    asOf: MATERIALS_AS_OF,
  });
  const required = map.get("totalRequiredQty");
  const shortage = map.get("totalShortageQty");
  const buffer = map.get("postAllocationBufferToReorderPoint");

  const materials = materialsReadinessSelector({
    totalRequiredQty: required && isAvailable(required) ? required.value : null,
    totalShortageQty: shortage && isAvailable(shortage) ? shortage.value : null,
  });
  const bufferSel = inventoryBufferSelector({
    postAllocationBufferToReorderPoint: buffer && isAvailable(buffer) ? buffer.value : null,
  });

  const anyEnvelope = map.get("totalRequiredQty");
  const freshness = anyEnvelope ? anyEnvelope.freshness : "missing";

  const MATERIALS_DISPLAY: Record<string, string> = {
    ready: "Materials ready",
    blocked: "Materials blocked",
    not_required: "No materials required",
    unavailable: "Materials evidence unavailable",
  };
  const BUFFER_DISPLAY: Record<string, string> = {
    healthy: "Buffer healthy",
    at_reorder_point: "At reorder point",
    below_reorder_point: "Below reorder point",
    unavailable: "Buffer evidence unavailable",
  };

  return {
    view: {
      workOrderId,
      materialsLabel: materials.label,
      materialsDisplay: MATERIALS_DISPLAY[materials.label] ?? materials.label,
      bufferLabel: bufferSel.label,
      bufferDisplay: BUFFER_DISPLAY[bufferSel.label] ?? bufferSel.label,
      metrics: [
        toMetric(`${workOrderId}-required`, "Required quantity", map.get("totalRequiredQty"), "score"),
        toMetric(`${workOrderId}-available`, "Available (unreserved)", map.get("totalAvailableUnreservedQty"), "score"),
        toMetric(`${workOrderId}-shortage`, "Shortage", map.get("totalShortageQty"), "score"),
        toMetric(`${workOrderId}-buffer`, "Buffer to reorder point", map.get("postAllocationBufferToReorderPoint"), "score"),
      ],
      freshness,
      freshnessLabel: freshnessLabel(freshness),
      evaluatedAt: anyEnvelope ? anyEnvelope.asOf : null,
    },
    lineage: lineageRow(
      `${workOrderId}-readiness`,
      `Work readiness · ${workOrderId}`,
      anyEnvelope ?? undefined,
    ),
  };
}

function buildTurnaround(): { view: TurnaroundFitView; lineage: EvidenceLineageRowView | null } {
  const map = envelopes(
    CASE_SCOPE,
    { kind: "turnaround_scope", turnaroundScopeId: "wp-k201", workOrderId: "wo-2", assetId: K201_ASSET_ID },
    { kind: "turnaround_lead_time_fit", requestedByEventType: "TurnaroundScopeRetained", asOf: TURNAROUND_AS_OF },
  );
  const slack = map.get("slackDays");
  const fit = turnaroundFitSelector(slack && isAvailable(slack) ? slack.value : null);
  const epochEnv = map.get("availableDateEpochDay");
  const availableDate =
    epochEnv && isAvailable(epochEnv)
      ? new Date(epochEnv.value * 86_400_000).toISOString().slice(0, 10)
      : null;
  const anchorEnv = map.get("maxLeadTimeDays");
  const freshness = anchorEnv ? anchorEnv.freshness : "missing";

  const FIT_DISPLAY: Record<string, string> = {
    fits: "Fits the turnaround window",
    at_risk: "At risk of missing the window",
    unavailable: "Lead-time evidence unavailable",
  };

  return {
    view: {
      available: Boolean(anchorEnv && isAvailable(anchorEnv)),
      fitLabel: fit.label,
      fitDisplay: FIT_DISPLAY[fit.label] ?? fit.label,
      availableDate,
      metrics: [
        toMetric("ta-maxlead", "Max spare lead time", map.get("maxLeadTimeDays"), "score"),
        toMetric("ta-until", "Days until turnaround", map.get("daysUntilTurnaround"), "score"),
        toMetric("ta-slack", "Slack", map.get("slackDays"), "score"),
      ],
      freshness,
      freshnessLabel: freshnessLabel(freshness),
      evaluatedAt: anchorEnv ? anchorEnv.asOf : null,
    },
    lineage: lineageRow("turnaround-fit", "Turnaround fit", anchorEnv ?? undefined),
  };
}

function lineageRow(
  key: string,
  label: string,
  envelope: ValueEnvelope<number> | undefined,
): EvidenceLineageRowView | null {
  if (!envelope) return null;
  return {
    key,
    label,
    provenance: envelope.provenance,
    trustLabel: trustLabel(envelope.trustClassification),
    formulaVersion: envelope.formulaVersion,
    sourceMode: envelope.sourceMode,
    evidenceIds: envelope.evidenceIds,
    asOf: envelope.asOf,
  };
}

/** Build the complete K-201 Asset 360 + Assessment & Decision view. */
export function getK201ReliabilityView(viewerId: PersonaId): AssetReliabilityView {
  const model: Asset360Model | null = getRepository().getAsset360(TAG);

  const assessment = envelopes(CASE_SCOPE, CASE_SUBJECT, {
    kind: "asset_assessment",
    requestedByEventType: "ConditionSignalIngested",
    asOf: ASSESSMENT_AS_OF,
  });
  const exposureEnvelope = assessment.get("valueAtStakeUsd");

  const oeeMap = envelopes(LINE_SCOPE, LINE_SUBJECT, {
    kind: "oee_reconciliation",
    requestedByEventType: "ProductionObservationIngested",
    asOf: ASSESSMENT_AS_OF,
  });

  const assessmentMetrics: GovernedMetricView[] = [
    toMetric("health", "Health score", assessment.get("healthScore"), "score"),
    toMetric("risk", "Risk score", assessment.get("riskScore"), "score"),
    toMetric("ttc", "Time to critical", assessment.get("timeToCriticalDays"), "days"),
    toMetric("exposure", "Value at stake (exposure)", exposureEnvelope, "usd"),
  ];

  const oee = toMetric("oee", "Overall equipment effectiveness", oeeMap.get("oee"), "percent");
  const oeeBreakdown: GovernedMetricView[] = [
    toMetric("availability", "Availability", oeeMap.get("availability"), "percent"),
    toMetric("performance", "Performance", oeeMap.get("performance"), "percent"),
    toMetric("quality", "Quality", oeeMap.get("quality"), "percent"),
  ];

  // Governed lifecycle projection (read-only) built from the governed exposure.
  const projection = exposureEnvelope
    ? buildK201Projection({
        valueAtStake: exposureEnvelope,
        evaluatedAt: ASSESSMENT_AS_OF,
        signalCapturedAt: exposureEnvelope.capturedAt,
        readingIds: exposureEnvelope.evidenceIds,
        runIds: oeeMap.get("oee")?.evidenceIds ?? [],
      })
    : null;

  const exposureDisplay = assessmentMetrics[3]!.display;
  const lifecycleProjection: LifecycleProjectionEntryView[] = projection
    ? projection.events.map((event, index) => {
        const resultingPhase = projection.stepSnapshots[index]!.phase;
        return {
          sequence: event.sequence,
          eventId: event.eventId,
          type: event.type,
          typeLabel: EVENT_LABEL[event.type] ?? event.type,
          actorLabel: "System · reliability-evidence-projection",
          asOf: event.asOf,
          summary: projectionSummary(event.type, exposureDisplay),
          resultingPhase,
          resultingPhaseLabel: PHASE_LABEL[resultingPhase],
        };
      })
    : [];

  const authority = buildAuthority(viewerId, exposureEnvelope);

  // Display context (identity, sensors, recommendation) — NOT the governed
  // metric source. Governed numbers above come only from the calculation ledger.
  const recommendation = model?.recommendation ?? null;
  const confidenceRaw = recommendation ? recommendation.trendProjectionConfidence : null;

  const signalSensors = (model?.sensors ?? []).map((s) => {
    const readings = s.readings;
    const latest = readings.length > 0 ? readings[readings.length - 1]! : null;
    return {
      key: s.definition.id,
      label: s.definition.label,
      unit: s.definition.unit,
      latestDisplay: latest ? `${latest.value} ${s.definition.unit}` : UNAVAILABLE_DISPLAY,
      points: readings.map((r) => ({ t: r.timestamp, v: r.value })),
    };
  });

  const conditionEvents = (model?.conditionEvents ?? []).map((e) => ({
    at: e.detectedAt,
    label: e.rule,
    detail: e.detail,
  }));

  const wo1 = buildWorkReadiness("wo-1");
  const wo2 = buildWorkReadiness("wo-2");
  const turnaround = buildTurnaround();

  const lineage = [
    lineageRow("exposure", "Value at stake", exposureEnvelope),
    lineageRow("ttc", "Time to critical", assessment.get("timeToCriticalDays")),
    lineageRow("health", "Health score", assessment.get("healthScore")),
    lineageRow("risk", "Risk score", assessment.get("riskScore")),
    lineageRow("oee", "OEE", oeeMap.get("oee")),
    wo1.lineage,
    wo2.lineage,
    turnaround.lineage,
  ].filter((r): r is EvidenceLineageRowView => r !== null);

  return {
    tag: TAG,
    assetName: model?.asset.name ?? "Hydrogen Recycle Compressor",
    evaluatedAt: exposureEnvelope ? exposureEnvelope.asOf : ASSESSMENT_AS_OF,
    assessmentMetrics,
    assessmentContext: {
      label: "Trend-projection confidence",
      display: confidenceRaw === null ? UNAVAILABLE_DISPLAY : confidenceRaw.toFixed(3),
      rawValue: confidenceRaw,
      note: "Deterministic risk-engine trend-projection confidence — assessment context, not a governed calculation envelope.",
    },
    oee,
    oeeBreakdown,
    signal: {
      headline: "K-201 deterioration signal",
      detail:
        "Governed condition and production evidence indicate accelerating deterioration on the hydrogen recycle compressor.",
      sensors: signalSensors,
      conditionEvents,
    },
    recommendation: {
      available: recommendation !== null,
      title: recommendation?.title ?? null,
      summary: recommendation?.summary ?? null,
      interventionType: recommendation?.disposition ?? null,
      statusLabel: "Proposed — awaiting governed decision",
    },
    workReadiness: [wo1.view, wo2.view],
    turnaround: turnaround.view,
    authority,
    lifecycleProjection,
    decisionAudit: {
      entries: [],
      emptyTitle: "No governed human decision recorded",
      emptyDescription:
        "No approval, endorsement, return or validation has been recorded for K-201. The decision audit trail is intentionally empty until a human acts through the governed authority workflow.",
      nextGovernedAction: "Reliability Manager review — approve, decline or return.",
    },
    evidenceLineage: lineage,
  };
}

/** A stable reference to the dataset anchor, for callers that display it. */
export const DATASET_ANCHOR = ANCHOR_NOW;
