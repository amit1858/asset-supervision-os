import type { ValueStatus } from "@/domain/enums";
import type { ValueEnvelope } from "../envelope";
import type { GovernedEventType } from "../events";
import type { RecomputeRequestKind } from "../recompute";
import type { CalculationRejectionReason } from "./failure";
import {
  findFormulaSet,
  formulaFieldDefinition,
  isFormulaReference,
  type FormulaReference,
} from "./formula";
import type { CalculationId, CalculationRequestId, CalculationSlot } from "./identity";
import { isCalculationInputSnapshot, type CalculationInputSnapshot } from "./inputs";
import type { CalculationSubject } from "./subject";

/**
 * Slice 2.1c — the immutable calculation record.
 *
 * One record is one ATTEMPT to answer one governed recompute request. It is
 * append-only: a record is never rewritten, never backward-stamped and never
 * deleted. A newer answer is a NEW record that points back at the one it
 * supersedes, so every superseded calculation survives in full.
 *
 * Provenance, freshness, source mode, evidence and formula version live on the
 * ENVELOPE of each output field, and are deliberately not duplicated at record
 * level: two copies of the same truth are two chances to disagree. The record
 * carries only what is genuinely record-scoped — identity, the governed
 * question, the explicit `asOf`, the formula-set version and the inputs.
 */

export interface CalculationOutputField {
  readonly name: string;
  readonly formula: FormulaReference;
  readonly valueStatus: ValueStatus | null;
  readonly envelope: ValueEnvelope<number>;
}

export interface ProducedCalculationOutput {
  readonly outcome: "produced";
  /** Non-empty; every envelope is available. */
  readonly fields: readonly CalculationOutputField[];
}

export interface UnavailableCalculationOutput {
  readonly outcome: "unavailable";
  readonly unavailableReason: string;
  /** Every envelope is explicitly unavailable. Never an available `0`. */
  readonly fields: readonly CalculationOutputField[];
}

export interface FailedCalculationOutput {
  readonly outcome: "failed";
  readonly failureReason: string;
  readonly detail: string;
}

export type CalculationOutput =
  | ProducedCalculationOutput
  | UnavailableCalculationOutput
  | FailedCalculationOutput;

export interface CalculationRecord {
  readonly calculationId: CalculationId;
  readonly requestId: CalculationRequestId;
  readonly slot: CalculationSlot;
  readonly ledgerScopeKey: string;
  readonly subject: CalculationSubject;
  readonly sequence: number;
  readonly kind: RecomputeRequestKind;
  readonly requestedByEventId: string;
  readonly requestedByEventType: GovernedEventType;
  /** Explicit evaluation instant carried from the governed request. */
  readonly asOf: string;
  readonly formulaSetVersion: string;
  readonly inputs: CalculationInputSnapshot;
  readonly output: CalculationOutput;
  readonly supersedesCalculationId: CalculationId | null;
}

export interface RecordFailure {
  readonly reason: CalculationRejectionReason;
  readonly detail: string;
}

const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() === value;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Structural check on a value claiming to be a governed envelope. */
export function isEnvelopeShaped(value: unknown): value is ValueEnvelope<number> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") return false;
  if (typeof candidate.version !== "number") return false;
  if (candidate.status !== "available" && candidate.status !== "unavailable") return false;
  if (typeof candidate.provenance !== "string") return false;
  if (typeof candidate.sourceMode !== "string") return false;
  if (typeof candidate.freshness !== "string") return false;
  if (typeof candidate.formulaVersion !== "string") return false;
  if (!Array.isArray(candidate.evidenceIds)) return false;
  if (!isCanonicalInstant(candidate.asOf)) return false;
  if (candidate.status === "available") {
    return typeof candidate.value === "number";
  }
  return candidate.value === null && isNonEmpty(candidate.unavailableReason);
}

function validateField(value: unknown): RecordFailure | null {
  if (typeof value !== "object" || value === null) {
    return { reason: "malformed_engine_output", detail: "An output field must be an object." };
  }
  const field = value as Record<string, unknown>;
  if (!isNonEmpty(field.name)) {
    return { reason: "malformed_engine_output", detail: "An output field requires a non-empty name." };
  }
  if (!isFormulaReference(field.formula)) {
    return {
      reason: "malformed_engine_output",
      detail: `Output field "${String(field.name)}" requires a formula reference.`,
    };
  }
  if (
    field.valueStatus !== null &&
    field.valueStatus !== "projected" &&
    field.valueStatus !== "validated" &&
    field.valueStatus !== "realised"
  ) {
    return {
      reason: "malformed_engine_output",
      detail: `Output field "${String(field.name)}" carries an unknown valueStatus.`,
    };
  }
  if (!isEnvelopeShaped(field.envelope)) {
    return {
      reason: "invalid_envelope",
      detail: `Output field "${String(field.name)}" requires a governed value envelope.`,
    };
  }
  return null;
}

/**
 * Validate the output against the record and the governed formula registry.
 *
 * The formula registry is authoritative for WHICH fields a calculation kind may
 * carry, WHICH formula family produces each, and — for a produced result — the
 * governed `ValueStatus`. A caller therefore cannot add an unregistered field,
 * relabel a field's formula family, or promote a projected value to realised.
 */
export function validateOutput(record: CalculationRecord): RecordFailure | null {
  const output = record.output as unknown;
  if (typeof output !== "object" || output === null) {
    return { reason: "malformed_calculation", detail: "A calculation requires an output." };
  }
  const candidate = output as Record<string, unknown>;
  const set = findFormulaSet(record.kind, record.formulaSetVersion);
  if (set === null) {
    return {
      reason: "formula_set_not_registered",
      detail: `Formula set "${record.formulaSetVersion}" is not registered for "${record.kind}".`,
    };
  }

  if (candidate.outcome === "failed") {
    if (!isNonEmpty(candidate.failureReason) || !isNonEmpty(candidate.detail)) {
      return {
        reason: "malformed_calculation",
        detail: "A failed calculation requires a non-empty failureReason and detail.",
      };
    }
    return null;
  }

  const produced = candidate.outcome === "produced";
  const unavailable = candidate.outcome === "unavailable";
  if (!produced && !unavailable) {
    return { reason: "malformed_calculation", detail: "Unknown calculation output outcome." };
  }
  if (unavailable && !isNonEmpty(candidate.unavailableReason)) {
    return {
      reason: "malformed_calculation",
      detail: "An unavailable calculation requires a non-empty unavailableReason.",
    };
  }
  if (!Array.isArray(candidate.fields)) {
    return { reason: "malformed_engine_output", detail: "Output fields must be an array." };
  }
  const fields = candidate.fields as unknown[];
  if (produced && fields.length === 0) {
    return {
      reason: "malformed_engine_output",
      detail: "A produced calculation requires at least one output field.",
    };
  }
  const seen = new Set<string>();
  let availableCount = 0;
  for (const entry of fields) {
    const shapeFailure = validateField(entry);
    if (shapeFailure) return shapeFailure;
    const field = entry as CalculationOutputField;

    if (seen.has(field.name)) {
      return {
        reason: "formula_field_mismatch",
        detail: `Output field "${field.name}" appears more than once.`,
      };
    }
    seen.add(field.name);

    const definition = formulaFieldDefinition(set, field.name);
    if (definition === null) {
      return {
        reason: "formula_field_mismatch",
        detail: `Output field "${field.name}" is not registered in "${set.formulaSetVersion}".`,
      };
    }
    if (definition.formula.family !== field.formula.family) {
      return {
        reason: "formula_field_mismatch",
        detail: `Output field "${field.name}" declares family "${field.formula.family}" but the registry says "${definition.formula.family}".`,
      };
    }
    if (definition.formula.version !== field.formula.version) {
      return {
        reason: "formula_version_mismatch",
        detail: `Output field "${field.name}" declares formula version "${field.formula.version}" but the registry says "${definition.formula.version}".`,
      };
    }
    if (definition.formula.engineEntryPoint !== field.formula.engineEntryPoint) {
      return {
        reason: "formula_field_mismatch",
        detail: `Output field "${field.name}" declares an unregistered engine entry point.`,
      };
    }
    if (field.formula.version !== field.envelope.formulaVersion) {
      return {
        reason: "formula_version_mismatch",
        detail: `Output field "${field.name}" formula version "${field.formula.version}" must equal envelope formulaVersion "${field.envelope.formulaVersion}".`,
      };
    }
    if (field.envelope.asOf !== record.asOf) {
      return {
        reason: "envelope_as_of_mismatch",
        detail: `Output field "${field.name}" envelope asOf "${field.envelope.asOf}" must equal calculation asOf "${record.asOf}".`,
      };
    }
    if (field.envelope.provenance !== definition.provenance) {
      return {
        reason: "formula_field_mismatch",
        detail: `Output field "${field.name}" declares provenance "${field.envelope.provenance}" but the registry says "${definition.provenance}".`,
      };
    }

    if (produced) {
      if (field.envelope.status === "available") {
        if (!Number.isFinite(field.envelope.value)) {
          return {
            reason: "malformed_engine_output",
            detail: `Output field "${field.name}" is not a finite number.`,
          };
        }
        if (field.valueStatus !== definition.valueStatus) {
          return {
            reason: "formula_field_mismatch",
            detail: `Output field "${field.name}" declares valueStatus "${String(field.valueStatus)}" but the registry says "${String(definition.valueStatus)}".`,
          };
        }
        availableCount += 1;
      } else if (field.valueStatus !== null) {
        // A field with no value is not a member of the value-realisation
        // lifecycle, whatever the registry says the produced status would be.
        return {
          reason: "formula_field_mismatch",
          detail: `An unavailable output field must carry a null valueStatus; "${field.name}" declares "${String(field.valueStatus)}".`,
        };
      }
    } else {
      if (field.envelope.status !== "unavailable") {
        return {
          reason: "malformed_engine_output",
          detail: `An unavailable calculation cannot carry an available envelope for "${field.name}".`,
        };
      }
      if (field.valueStatus !== null) {
        return {
          reason: "formula_field_mismatch",
          detail: `An unavailable output field must carry a null valueStatus; "${field.name}" declares "${String(field.valueStatus)}".`,
        };
      }
    }
  }

  if (produced && availableCount === 0) {
    return {
      reason: "malformed_engine_output",
      detail: "A produced calculation requires at least one available field.",
    };
  }

  if (produced && seen.size !== set.fields.length) {
    return {
      reason: "formula_field_mismatch",
      detail: `Formula set "${set.formulaSetVersion}" requires ${set.fields.length} field(s); received ${seen.size}.`,
    };
  }

  return null;
}

/** Structural validation of the record itself, independent of ledger state. */
export function validateRecordShape(value: unknown): RecordFailure | null {
  if (typeof value !== "object" || value === null) {
    return { reason: "malformed_calculation", detail: "A calculation record must be an object." };
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "calculationId",
    "requestId",
    "slot",
    "ledgerScopeKey",
    "requestedByEventId",
    "requestedByEventType",
    "formulaSetVersion",
  ]) {
    if (!isNonEmpty(record[key])) {
      return {
        reason: "malformed_calculation",
        detail: `A calculation record requires a non-empty ${key}.`,
      };
    }
  }
  if (!isCanonicalInstant(record.asOf)) {
    return {
      reason: "invalid_timestamp",
      detail: `asOf "${String(record.asOf)}" is not a canonical UTC instant.`,
    };
  }
  if (
    typeof record.sequence !== "number" ||
    !Number.isSafeInteger(record.sequence) ||
    record.sequence < 1
  ) {
    return {
      reason: "invalid_sequence",
      detail: "A calculation sequence must be a positive safe integer.",
    };
  }
  if (
    record.supersedesCalculationId !== null &&
    !isNonEmpty(record.supersedesCalculationId)
  ) {
    return {
      reason: "invalid_supersession",
      detail: "supersedesCalculationId must be null or a non-empty calculation id.",
    };
  }
  if (!isCalculationInputSnapshot(record.inputs)) {
    return {
      reason: "invalid_input_snapshot",
      detail: "A calculation record requires a valid, JSON-safe input snapshot.",
    };
  }
  return null;
}
