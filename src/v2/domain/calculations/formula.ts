import type { Provenance, ValueStatus } from "@/domain/enums";
import type { FreshnessClass } from "../policy/freshness";
import type { RecomputeRequestKind } from "../recompute";

/**
 * Slice 2.1c — the governed formula registry.
 *
 * Slice 2.1c performs NO arithmetic. What it owns is formula IDENTITY: which
 * named formula, at which version, implemented by which existing engine entry
 * point, produced each field of a calculation. Recording the number without the
 * formula that produced it would make the ledger unauditable; recomputing the
 * number here would fork the engines.
 *
 * One calculation record carries ONE record-level `formulaSetVersion` plus a
 * per-field `FormulaReference`, so a multi-field result (health, risk,
 * time-to-critical and value at stake all come from one assessment) is a single
 * governed fact whose fields remain individually attributable.
 *
 * The registry also fixes each field's PROVENANCE, its value-realisation
 * `ValueStatus` and its freshness class. These are governed properties of the
 * formula, not of the caller: fixing them here is what stops a caller declaring
 * the statistical time-to-critical prediction to be a deterministic
 * calculation, or promoting a projected value to realised.
 */

export type FormulaFamily =
  | "asset_health"
  | "asset_risk"
  | "time_to_critical"
  | "value_at_stake"
  | "oee"
  | "oee_loss"
  | "projected_value"
  | "realised_value"
  | "work_readiness"
  | "turnaround_lead_time_fit";

export interface FormulaReference {
  readonly family: FormulaFamily;
  readonly version: string;
  /** The existing function that owns the arithmetic. Never reimplemented here. */
  readonly engineEntryPoint: string;
}

export interface FormulaFieldDefinition {
  readonly name: string;
  readonly formula: FormulaReference;
  /**
   * Epistemic origin, governed by the formula. `time_to_critical` is
   * `statistical` — it is a trend extrapolation, and `trustFromProvenance`
   * therefore classifies it as a `prediction`, never a deterministic fact.
   */
  readonly provenance: Provenance;
  /**
   * Position in the existing value-realisation lifecycle when the field is
   * PRODUCED, or `null` when the field is not a member of that lifecycle.
   * An unavailable field always carries `null` regardless of this value.
   */
  readonly valueStatus: ValueStatus | null;
  readonly freshnessClass: FreshnessClass;
}

export interface FormulaSetDefinition {
  readonly kind: RecomputeRequestKind;
  readonly formulaSetVersion: string;
  readonly fields: readonly FormulaFieldDefinition[];
}

function field(
  name: string,
  family: FormulaFamily,
  version: string,
  engineEntryPoint: string,
  provenance: Provenance,
  valueStatus: ValueStatus | null,
  freshnessClass: FreshnessClass,
): FormulaFieldDefinition {
  return Object.freeze({
    name,
    formula: Object.freeze({ family, version, engineEntryPoint }),
    provenance,
    valueStatus,
    freshnessClass,
  });
}

const RISK_ENGINE = "@/engines/risk#computeRisk";
const OEE_ENGINE = "@/engines/oee#aggregateOee";
const EXPOSURE_ENGINE = "@/data/k201-analysis#analyzeK201";
const RECOMMENDATION_SOURCE = "@/data/repository#getRepository.getRots";
const OUTCOME_SOURCE = "@/data/seed#getDataset.operationalOutcomes";

/**
 * `value_at_stake` carries `valueStatus: null`.
 *
 * The existing `ValueStatus` union is `projected | validated | realised` — the
 * value-REALISATION lifecycle for value the system enables. Value at stake is
 * the exposure already under decision (`rots.ts`: "exposure under decision (NOT
 * AI-created value)"), so it is not a member of that lifecycle and there is no
 * at-stake member to map it onto. Declaring it `projected` would conflate
 * exposure with projected value enabled, which the value taxonomy keeps
 * strictly separate. The union is not modified.
 */
const ASSET_ASSESSMENT_V1: FormulaSetDefinition = Object.freeze({
  kind: "asset_assessment",
  formulaSetVersion: "asset-assessment.v1",
  fields: Object.freeze([
    field("healthScore", "asset_health", "asset-health.v1", RISK_ENGINE, "deterministic", null, "condition_signal"),
    field("riskScore", "asset_risk", "asset-risk.v1", RISK_ENGINE, "deterministic", null, "condition_signal"),
    field("timeToCriticalDays", "time_to_critical", "time-to-critical.v1", RISK_ENGINE, "statistical", null, "condition_signal"),
    field("valueAtStakeUsd", "value_at_stake", "value-at-stake.v1", EXPOSURE_ENGINE, "deterministic", null, "financial_value"),
  ]),
});

const OEE_RECONCILIATION_V1: FormulaSetDefinition = Object.freeze({
  kind: "oee_reconciliation",
  formulaSetVersion: "oee-reconciliation.v1",
  fields: Object.freeze([
    field("oee", "oee", "oee.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("availability", "oee", "oee.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("performance", "oee", "oee.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("quality", "oee", "oee.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("availabilityLossUnits", "oee_loss", "oee-loss-tree.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("performanceLossUnits", "oee_loss", "oee-loss-tree.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
    field("qualityLossUnits", "oee_loss", "oee-loss-tree.v1", OEE_ENGINE, "deterministic", null, "production_oee"),
  ]),
});

const PROJECTED_VALUE_V1: FormulaSetDefinition = Object.freeze({
  kind: "decision_projected_value",
  formulaSetVersion: "projected-value.v1",
  fields: Object.freeze([
    field("projectedValueEnabledUsd", "projected_value", "projected-value.v1", RECOMMENDATION_SOURCE, "deterministic", "projected", "financial_value"),
  ]),
});

/**
 * Work readiness and turnaround lead-time fit have NO governed engine in
 * Slice 2.1c. Their formula sets are deliberately field-less: a calculation of
 * either kind can only ever be an auditable unavailable attempt, and there is
 * no registered field a caller could populate with a fabricated `"ready"` or
 * `"fits"` verdict. Slice 2.1c.1 introduces the real engines.
 */
const WORK_READINESS_DEFERRED_V1: FormulaSetDefinition = Object.freeze({
  kind: "work_readiness",
  formulaSetVersion: "work-readiness.deferred.v1",
  fields: Object.freeze([]),
});

const LEAD_TIME_FIT_DEFERRED_V1: FormulaSetDefinition = Object.freeze({
  kind: "turnaround_lead_time_fit",
  formulaSetVersion: "turnaround-lead-time-fit.deferred.v1",
  fields: Object.freeze([]),
});

const REALISED_VALUE_V1: FormulaSetDefinition = Object.freeze({
  kind: "realised_value",
  formulaSetVersion: "realised-value.v1",
  fields: Object.freeze([
    field("realisedValueUsd", "realised_value", "realised-value.v1", OUTCOME_SOURCE, "deterministic", "realised", "financial_value"),
  ]),
});

/** Every governed formula set, keyed by request kind. */
export const FORMULA_SETS: Readonly<
  Record<RecomputeRequestKind, readonly FormulaSetDefinition[]>
> = Object.freeze({
  asset_assessment: Object.freeze([ASSET_ASSESSMENT_V1]),
  oee_reconciliation: Object.freeze([OEE_RECONCILIATION_V1]),
  decision_projected_value: Object.freeze([PROJECTED_VALUE_V1]),
  work_readiness: Object.freeze([WORK_READINESS_DEFERRED_V1]),
  turnaround_lead_time_fit: Object.freeze([LEAD_TIME_FIT_DEFERRED_V1]),
  realised_value: Object.freeze([REALISED_VALUE_V1]),
});

/** The formula set `executeRecompute` uses for each kind. */
export const DEFAULT_FORMULA_SET_VERSION: Readonly<
  Record<RecomputeRequestKind, string>
> = Object.freeze({
  asset_assessment: ASSET_ASSESSMENT_V1.formulaSetVersion,
  oee_reconciliation: OEE_RECONCILIATION_V1.formulaSetVersion,
  decision_projected_value: PROJECTED_VALUE_V1.formulaSetVersion,
  work_readiness: WORK_READINESS_DEFERRED_V1.formulaSetVersion,
  turnaround_lead_time_fit: LEAD_TIME_FIT_DEFERRED_V1.formulaSetVersion,
  realised_value: REALISED_VALUE_V1.formulaSetVersion,
});

export function findFormulaSet(
  kind: RecomputeRequestKind,
  formulaSetVersion: string,
): FormulaSetDefinition | null {
  const sets = FORMULA_SETS[kind];
  if (!sets) return null;
  return sets.find((s) => s.formulaSetVersion === formulaSetVersion) ?? null;
}

export function formulaFieldDefinition(
  set: FormulaSetDefinition,
  name: string,
): FormulaFieldDefinition | null {
  return set.fields.find((f) => f.name === name) ?? null;
}

export function isFormulaReference(value: unknown): value is FormulaReference {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.family === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.engineEntryPoint === "string"
  );
}
