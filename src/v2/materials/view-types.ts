import type {
  EvidenceLineageRowView,
  GovernedMetricView,
  OperationalHorizonView,
  TurnaroundFitView,
  WorkReadinessView,
} from "@/v2/reliability/view-types";

/**
 * September 8 Maintenance & Materials experience — the client-safe view-model
 * contracts for the K-201 maintenance & materials workspace.
 *
 * Like the reliability view-types, this module is pure data. Every governed
 * number is resolved from a governed calculation envelope (or read verbatim from
 * a governed inventory / lead-time evidence fact) on the server; a component
 * renders these shapes but never derives an operational value. This module
 * imports NO engine, NO server-only module and NO authority-mutation seam, so it
 * is safe for a browser bundle. It reuses the shared client-safe atoms
 * (`GovernedMetricView`, `WorkReadinessView`, `TurnaroundFitView`,
 * `EvidenceLineageRowView`) from the reliability view-types rather than
 * duplicating them.
 */

export type {
  EvidenceLineageRowView,
  GovernedMetricView,
  HorizonMarkerView,
  OperationalHorizonView,
  TurnaroundFitView,
  WorkReadinessView,
} from "@/v2/reliability/view-types";

/**
 * One leg of the inventory-position bridge for a work order, read verbatim from
 * a governed inventory-balance fact. Quantities are exact integers; a `null`
 * quantity is an honest "no balance on record", NEVER defaulted to zero.
 */
export interface InventoryLegView {
  readonly spareId: string;
  readonly partLabel: string;
  readonly onHand: number | null;
  readonly reserved: number | null;
  readonly reorderPoint: number | null;
  readonly hasBalance: boolean;
}

/**
 * The inventory-position bridge for one work order:
 *   On hand − Reserved − Required − Reorder point = Post-allocation buffer.
 *
 * The buffer is the GOVERNED calculation envelope value, never re-derived here;
 * the legs are governed inventory / calculation facts. `equationText` is an
 * accessible, screen-reader-friendly restatement of the same arithmetic.
 */
export interface InventoryBridgeView {
  readonly workOrderId: string;
  readonly legs: readonly InventoryLegView[];
  /** Governed required quantity (calculation envelope). */
  readonly required: GovernedMetricView;
  /** Governed available-unreserved quantity (calculation envelope). */
  readonly available: GovernedMetricView;
  /** Governed shortage quantity (calculation envelope). */
  readonly shortage: GovernedMetricView;
  /** Governed post-allocation buffer to reorder point (calculation envelope). */
  readonly buffer: GovernedMetricView;
  /** Summed on-hand across the legs (governed inventory facts), or `null`. */
  readonly onHandTotal: number | null;
  readonly reservedTotal: number | null;
  readonly reorderPointTotal: number | null;
  /** Accessible restatement of the bridge arithmetic. */
  readonly equationText: string;
}

/** A single row in the work-order readiness matrix. */
export interface WorkOrderReadinessRowView {
  readonly workOrderId: string;
  readonly workOrderNumber: string;
  readonly title: string;
  /** Materials readiness classification, e.g. "ready" | "blocked" | ... */
  readonly materialsLabel: string;
  readonly materialsDisplay: string;
  /** Inventory-health classification, e.g. "below_reorder_point" | ... */
  readonly inventoryLabel: string;
  readonly inventoryDisplay: string;
  /**
   * Distinguishes the conditions the matrix must never conflate:
   *  - `ready` — materials are available for the work order;
   *  - `blocked` — a real shortage stops the work order;
   *  - `available_zero` — nothing on hand but nothing required either;
   *  - `missing_evidence` — materials evidence is unavailable;
   *  - `not_required` — the work order needs no materials.
   */
  readonly readinessKind:
    | "ready"
    | "blocked"
    | "available_zero"
    | "missing_evidence"
    | "not_required";
  readonly requiredDisplay: string;
  readonly availableDisplay: string;
  readonly shortageDisplay: string;
  readonly bufferDisplay: string;
  readonly freshness: WorkReadinessView["freshness"];
  readonly freshnessLabel: string;
  readonly evaluatedAt: string | null;
  readonly bridge: InventoryBridgeView;
}

/** The read-only human-accountability panel for the materials workspace. */
export interface MaterialsAccountabilityView {
  readonly decisionStatusLabel: string;
  readonly nextActLabel: string;
  readonly nextActPersonaName: string;
  readonly endorsementRequired: boolean;
  readonly endorsementNote: string;
  /** True when no governed human decision has been recorded yet. */
  readonly noDecisionRecorded: boolean;
  readonly readOnlyNotice: string;
}

/** A compact maintenance summary head for the workspace. */
export interface MaintenanceSummaryView {
  readonly tag: string;
  readonly assetName: string;
  readonly assetHref: string;
  readonly interventionTitle: string | null;
  readonly interventionType: string | null;
  readonly recommendationStatusLabel: string;
  /** Number of work orders that are materials-blocked. */
  readonly blockedCount: number;
  readonly workOrderCount: number;
  readonly turnaroundFitDisplay: string;
  readonly evaluatedAt: string | null;
}

/** The complete K-201 Maintenance & Materials workspace view. */
export interface MaintenanceMaterialsView {
  readonly summary: MaintenanceSummaryView;
  readonly workOrders: readonly WorkOrderReadinessRowView[];
  readonly turnaround: TurnaroundFitView;
  readonly horizon: OperationalHorizonView;
  readonly accountability: MaterialsAccountabilityView;
  readonly evidenceLineage: readonly EvidenceLineageRowView[];
}
