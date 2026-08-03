/**
 * Slice 2.1c — the PURE engine port.
 *
 * This module is types and JSON-safe DTOs only. It imports no repository, no
 * seed, no engine, no server code, no lifecycle snapshot and no reducer, so the
 * calculation domain can be reasoned about, tested and bundled without dragging
 * server-only truth construction behind it. The real implementation lives in
 * `src/v2/server/calculations/engine-adapter.ts`, which is `server-only` and
 * calls the EXISTING engines and repository — no formula is reimplemented on
 * either side of this boundary.
 *
 * The DTOs deliberately carry raw numbers plus the evidence and capture instant
 * needed to build a governed envelope. They carry NO provenance, formula
 * version, trust classification or value status: those are governed properties
 * fixed by the domain formula registry, so an adapter cannot relabel a
 * statistical prediction as a deterministic fact.
 *
 * Every method returns `null` when the engine has no data for the identity
 * asked about. `null` means "no governed value exists" and becomes an
 * auditable UNAVAILABLE calculation. It is never turned into `0`.
 */

import type { SourceKey } from "@/domain/integration";
import type { SourceMode } from "@/context/types";

/**
 * Read-only description of the dataset the adapter is serving, including the
 * canonical `ANCHOR_NOW`-backed evaluation instant. Exposed so a caller can
 * assert which dataset produced a value; the domain never derives a clock from
 * it and never creates a second anchor.
 */
export interface DatasetMetadata {
  readonly datasetId: string;
  readonly seed: number;
  readonly anchorNow: string;
  readonly historyDays: number;
  readonly trendWindowDays: number;
  readonly productionLineId: string;
  readonly sourceMode: SourceMode;
}

export interface EngineEvidence {
  /** The source the underlying evidence came from. Drives freshness resolution. */
  readonly sourceKey: SourceKey;
  readonly sourceMode: SourceMode;
  /** Evidence timestamp, or `null` when there is no evidence. */
  readonly capturedAt: string | null;
  readonly evidenceIds: readonly string[];
}

export interface AssetAssessmentResult {
  readonly assetId: string;
  readonly assetTag: string;
  readonly healthScore: number;
  readonly riskScore: number;
  /** Statistical trend extrapolation; `null` when no critical date is projected. */
  readonly projectedDaysToCritical: number | null;
  readonly valueAtStakeUsd: number;
  readonly evidence: EngineEvidence;
}

export interface ProductionOeeResult {
  readonly lineId: string;
  readonly oee: number;
  readonly availability: number;
  readonly performance: number;
  readonly quality: number;
  readonly availabilityLossUnits: number;
  readonly performanceLossUnits: number;
  readonly qualityLossUnits: number;
  readonly evidence: EngineEvidence;
}

export interface ProjectedValueResult {
  readonly recommendationId: string;
  readonly assetId: string;
  /** Projected value enabled by THIS recommendation only. Never a portfolio total. */
  readonly projectedValueEnabledUsd: number;
  readonly evidence: EngineEvidence;
}

export interface OutcomeRealisedValueResult {
  readonly outcomeId: string;
  readonly assetId: string;
  /**
   * Whether a governed realised value genuinely exists for THIS outcome.
   *
   * Explicit rather than inferred from the number, because a defaulted or
   * portfolio-wide `0` must never be mistaken for an available zero. A
   * genuinely governed zero is valid and sets `available: true`.
   */
  readonly available: boolean;
  readonly realisedValueUsd: number | null;
  readonly unavailableReason: string | null;
  readonly evidence: EngineEvidence;
}

export interface EnginePort {
  datasetMetadata(): DatasetMetadata;

  assessAsset(assetId: string): AssetAssessmentResult | null;

  reconcileProductionLine(lineId: string): ProductionOeeResult | null;

  projectRecommendationValue(
    recommendationId: string,
    assetId: string,
  ): ProjectedValueResult | null;

  realisedValueForOutcome(
    outcomeId: string,
    assetId: string,
  ): OutcomeRealisedValueResult | null;
}
