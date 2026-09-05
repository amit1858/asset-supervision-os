import type {
  EvidenceLineageRowView,
  GovernedMetricView,
} from "@/v2/reliability/view-types";

/**
 * September 9 OEE & Loss Intelligence experience — client-safe view-model
 * contracts.
 *
 * Pure data. OEE, its availability/performance/quality components and the three
 * loss-unit magnitudes are all resolved from governed calculation envelopes on
 * the server; a component renders them but never derives an operational value.
 * This module imports NO engine, NO server-only module and NO authority-mutation
 * seam, so it is safe for a browser bundle.
 */

export type {
  EvidenceLineageRowView,
  GovernedMetricView,
} from "@/v2/reliability/view-types";

/**
 * One segment of the loss split. A proportional split is only constructed when
 * the source contract proves the three losses share one unit and are additive
 * components of a single total; `ratio` is then the segment's share of that
 * total. The exact governed unit magnitude (`metric`) is ALWAYS carried and
 * never hidden behind the proportion.
 */
export interface LossSegmentView {
  readonly key: "availability" | "performance" | "quality";
  readonly label: string;
  /** The governed loss-unit magnitude envelope — exact value, never hidden. */
  readonly metric: GovernedMetricView;
  /** Share of the additive total in [0,1], or `null` when the split is not supported. */
  readonly ratio: number | null;
  readonly ratioDisplay: string;
}

/**
 * The loss visualization contract. `presentation` records which visual was
 * chosen and WHY: `proportional_split` only when additivity is proven, else
 * `independent_bars`. The three exact loss magnitudes are always present.
 */
export interface LossVisualizationView {
  readonly presentation: "proportional_split" | "independent_bars";
  readonly rationale: string;
  readonly unitLabel: string;
  readonly segments: readonly LossSegmentView[];
  /**
   * The additive total of the three loss magnitudes, shown only as the split
   * denominator. Presentation geometry only — NOT a new governed business
   * metric. `null` when any magnitude is unavailable.
   */
  readonly totalUnits: number | null;
  readonly totalDisplay: string;
}

export interface OeeSummaryView {
  readonly lineId: string;
  readonly lineLabel: string;
  /** ISO instant of the governed OEE record (`asOf`). */
  readonly evaluatedAt: string | null;
}

/**
 * The active operational context. K-201 may appear ONLY as the asset under
 * review within the line and a navigation link — never as "K-201 OEE" and never
 * as the cause of the line OEE.
 */
export interface OeeAssetContextView {
  readonly tag: string;
  readonly assetName: string;
  readonly assetHref: string;
  readonly note: string;
}

/** The complete OEE & Loss Intelligence workspace view (line-level). */
export interface OeeLossView {
  readonly summary: OeeSummaryView;
  readonly oee: GovernedMetricView;
  readonly components: readonly GovernedMetricView[];
  readonly losses: LossVisualizationView;
  readonly assetContext: OeeAssetContextView;
  readonly evidenceLineage: readonly EvidenceLineageRowView[];
}
