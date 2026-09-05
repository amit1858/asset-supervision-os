import type {
  EvidenceLineageRowView,
  GovernedMetricView,
  OperationalHorizonView,
  TurnaroundFitView,
} from "@/v2/reliability/view-types";

/**
 * September 9 Turnaround Control experience — client-safe view-model contracts.
 *
 * Pure data. Every governed number is resolved from a governed calculation
 * envelope on the server (never recomputed in a component), and every
 * qualitative field is carried verbatim. This module imports NO engine, NO
 * server-only module and NO authority-mutation seam, so it is safe for a browser
 * bundle. It reuses the shared client-safe atoms (`GovernedMetricView`,
 * `TurnaroundFitView`, `OperationalHorizonView`, `EvidenceLineageRowView`) from
 * the reliability view-types rather than duplicating them.
 */

export type {
  EvidenceLineageRowView,
  GovernedMetricView,
  HorizonMarkerView,
  OperationalHorizonView,
  TurnaroundFitView,
} from "@/v2/reliability/view-types";

/**
 * The exact governed subject identity the turnaround-fit calculation was
 * evaluated against. These IDs are shown verbatim; human-readable names may
 * accompany them but must never replace them.
 */
export interface TurnaroundIdentityView {
  readonly turnaroundScopeId: string;
  readonly workOrderId: string;
  readonly assetId: string;
  readonly turnaroundName: string;
  readonly scopePackageCode: string;
  readonly workOrderNumber: string;
  readonly assetTag: string;
}

/** One work order weighed against the turnaround scope. */
export interface TurnaroundWorkOrderView {
  readonly workOrderId: string;
  readonly workOrderNumber: string;
  readonly title: string;
  readonly materialsLabel: string;
  readonly materialsDisplay: string;
  readonly readinessKind:
    | "ready"
    | "blocked"
    | "available_zero"
    | "missing_evidence"
    | "not_required";
  /** Whether this work order is executed immediately or held for the turnaround. */
  readonly timing: "immediate" | "turnaround_scoped";
  readonly timingLabel: string;
  readonly freshnessLabel: string;
}

/** Read-only human accountability for the turnaround decision and scope. */
export interface TurnaroundAccountabilityView {
  readonly decisionStatusLabel: string;
  /** The governed decision owner (e.g. Reliability Manager). */
  readonly decisionOwnerName: string;
  readonly nextActLabel: string;
  /** The turnaround scope owner (route owner persona). */
  readonly scopeOwnerName: string;
  readonly endorsementRequired: boolean;
  readonly endorsementNote: string;
  readonly readOnlyNotice: string;
}

export interface TurnaroundSummaryView {
  readonly tag: string;
  readonly assetName: string;
  readonly assetHref: string;
  readonly fitDisplay: string;
  readonly maxLeadDisplay: string;
  readonly daysUntilDisplay: string;
  readonly slackDisplay: string;
  readonly availableDate: string | null;
  /** ISO instant of the governed turnaround-fit record (`asOf`). */
  readonly evaluatedAt: string | null;
}

/** The complete K-201 Turnaround Control workspace view. */
export interface TurnaroundControlView {
  readonly summary: TurnaroundSummaryView;
  readonly identity: TurnaroundIdentityView;
  readonly turnaround: TurnaroundFitView;
  readonly horizon: OperationalHorizonView;
  readonly workOrders: readonly TurnaroundWorkOrderView[];
  readonly accountability: TurnaroundAccountabilityView;
  /**
   * The mandatory read-only caution: a lead-time fit is NOT a safe-to-wait
   * signal. Explanatory copy, not a governed value.
   */
  readonly safeToWaitWarning: string;
  readonly evidenceLineage: readonly EvidenceLineageRowView[];
}

/** Metric list used by the turnaround fit strip (re-exported for components). */
export type TurnaroundMetricView = GovernedMetricView;
