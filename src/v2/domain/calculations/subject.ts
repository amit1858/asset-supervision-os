import type { GovernedEventType } from "../events";
import type { RecomputeRequestKind } from "../recompute";

/**
 * Slice 2.1c — WHAT a calculation is about, and WHICH ledger may hold it.
 *
 * A recompute request names a kind and an asset; it does not, on its own, say
 * whether the result belongs to a supervision case, a production line or a
 * portfolio. `CalculationSubject` supplies that missing identity so a
 * recommendation-scoped projected value can never be silently recorded as a
 * portfolio total, and a portfolio total can never be recorded against one
 * asset's case.
 *
 * `LedgerScope` is deliberately NARROWER than `CalculationSubject`: a ledger is
 * opened for a case, a line or a portfolio, and it accepts only the subjects
 * that genuinely belong to that container. This is the structural reason the
 * portfolio projected value cannot enter the K-201 case ledger — not a runtime
 * comparison against a magic number.
 *
 * Nothing here reads a clock, performs arithmetic or imports the event log,
 * the lifecycle reducer or any engine.
 */

export type CalculationSubject =
  | {
      readonly kind: "supervision_case";
      readonly caseId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "production_line";
      readonly lineId: string;
    }
  | {
      readonly kind: "recommendation";
      readonly recommendationId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "work_order";
      readonly workOrderId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "turnaround_scope";
      readonly turnaroundScopeId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "outcome";
      readonly outcomeId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "portfolio";
      readonly portfolioId: string;
    };

export type LedgerScope =
  | {
      readonly kind: "supervision_case";
      readonly caseId: string;
      readonly assetId: string;
    }
  | {
      readonly kind: "production_line";
      readonly lineId: string;
    }
  | {
      readonly kind: "portfolio";
      readonly portfolioId: string;
    };

export type CalculationSubjectKind = CalculationSubject["kind"];
export type LedgerScopeKind = LedgerScope["kind"];

export const CALCULATION_SUBJECT_KINDS: readonly CalculationSubjectKind[] =
  Object.freeze([
    "supervision_case",
    "production_line",
    "recommendation",
    "work_order",
    "turnaround_scope",
    "outcome",
    "portfolio",
  ] as const);

/**
 * The ONE subject kind each request kind may carry.
 *
 * A single required kind (rather than a permitted list) is what makes
 * `calculation_subject_kind_mismatch` decidable: there is no combination in
 * which a caller can choose the container a result lands in.
 */
export const REQUIRED_SUBJECT_KIND: Readonly<
  Record<RecomputeRequestKind, CalculationSubjectKind>
> = Object.freeze({
  asset_assessment: "supervision_case",
  oee_reconciliation: "production_line",
  decision_projected_value: "recommendation",
  work_readiness: "work_order",
  turnaround_lead_time_fit: "turnaround_scope",
  realised_value: "outcome",
} as const);

/**
 * The governed events permitted to emit each request kind, mirroring the
 * Slice 2.1b.1 emission contract exactly. `requestedByEventType` is checked
 * against this table before any engine is invoked, so a fabricated request
 * cannot reach a calculation by naming a plausible kind.
 */
export const VALID_TRIGGERS: Readonly<
  Record<RecomputeRequestKind, readonly GovernedEventType[]>
> = Object.freeze({
  asset_assessment: Object.freeze(["ConditionSignalIngested"] as const),
  oee_reconciliation: Object.freeze(["ProductionObservationIngested"] as const),
  decision_projected_value: Object.freeze([
    "DecisionApproved",
    "EndorsementGranted",
    "AssessmentComputed",
  ] as const),
  work_readiness: Object.freeze(["WorkOrderPlanned", "MaterialsChecked"] as const),
  turnaround_lead_time_fit: Object.freeze(["TurnaroundScopeRetained"] as const),
  realised_value: Object.freeze(["OutcomeConfirmed"] as const),
});

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The identity components of a subject, in a fixed order, for canonical key
 * construction. Returns `null` when any component is absent or blank so the
 * caller can reject with `missing_subject_identity` rather than build a key
 * over `undefined`.
 */
export function subjectIdentityParts(
  subject: CalculationSubject,
): readonly string[] | null {
  if (typeof subject !== "object" || subject === null) return null;
  switch (subject.kind) {
    case "supervision_case":
      return isNonEmpty(subject.caseId) && isNonEmpty(subject.assetId)
        ? [subject.caseId, subject.assetId]
        : null;
    case "production_line":
      return isNonEmpty(subject.lineId) ? [subject.lineId] : null;
    case "recommendation":
      return isNonEmpty(subject.recommendationId) && isNonEmpty(subject.assetId)
        ? [subject.recommendationId, subject.assetId]
        : null;
    case "work_order":
      return isNonEmpty(subject.workOrderId) && isNonEmpty(subject.assetId)
        ? [subject.workOrderId, subject.assetId]
        : null;
    case "turnaround_scope":
      return isNonEmpty(subject.turnaroundScopeId) && isNonEmpty(subject.assetId)
        ? [subject.turnaroundScopeId, subject.assetId]
        : null;
    case "outcome":
      return isNonEmpty(subject.outcomeId) && isNonEmpty(subject.assetId)
        ? [subject.outcomeId, subject.assetId]
        : null;
    case "portfolio":
      return isNonEmpty(subject.portfolioId) ? [subject.portfolioId] : null;
    default:
      return null;
  }
}

/** As `subjectIdentityParts`, for the narrower ledger scope union. */
export function scopeIdentityParts(scope: LedgerScope): readonly string[] | null {
  if (typeof scope !== "object" || scope === null) return null;
  switch (scope.kind) {
    case "supervision_case":
      return isNonEmpty(scope.caseId) && isNonEmpty(scope.assetId)
        ? [scope.caseId, scope.assetId]
        : null;
    case "production_line":
      return isNonEmpty(scope.lineId) ? [scope.lineId] : null;
    case "portfolio":
      return isNonEmpty(scope.portfolioId) ? [scope.portfolioId] : null;
    default:
      return null;
  }
}

/** The asset a subject belongs to, or `null` for subjects with no single asset. */
export function subjectAssetId(subject: CalculationSubject): string | null {
  switch (subject.kind) {
    case "supervision_case":
    case "recommendation":
    case "work_order":
    case "turnaround_scope":
    case "outcome":
      return subject.assetId;
    case "production_line":
    case "portfolio":
      return null;
    default:
      return null;
  }
}

/**
 * Scope admission.
 *
 * - A supervision-case ledger accepts its exact case, plus the recommendation,
 *   work-order, turnaround-scope and outcome subjects OF THE SAME ASSET. It
 *   never accepts a production line and never accepts a portfolio.
 * - A production-line ledger accepts only its exact production line.
 * - A portfolio ledger accepts only its exact portfolio.
 */
export function isSubjectInScope(
  scope: LedgerScope,
  subject: CalculationSubject,
): boolean {
  if (subjectIdentityParts(subject) === null) return false;
  if (scopeIdentityParts(scope) === null) return false;

  switch (scope.kind) {
    case "supervision_case": {
      if (subject.kind === "supervision_case") {
        return subject.caseId === scope.caseId && subject.assetId === scope.assetId;
      }
      if (
        subject.kind === "recommendation" ||
        subject.kind === "work_order" ||
        subject.kind === "turnaround_scope" ||
        subject.kind === "outcome"
      ) {
        return subject.assetId === scope.assetId;
      }
      // production_line and portfolio can never belong to a case ledger.
      return false;
    }
    case "production_line":
      return subject.kind === "production_line" && subject.lineId === scope.lineId;
    case "portfolio":
      return (
        subject.kind === "portfolio" && subject.portfolioId === scope.portfolioId
      );
    default:
      return false;
  }
}
