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

/**
 * Slice 2.1c.1 — RAW work-order materials evidence.
 *
 * The adapter reads the work order and the DISTINCT spare balances behind it and
 * returns them verbatim. It performs no readiness arithmetic: shortage, coverage
 * and buffer are all computed by the governed domain engine, so there is exactly
 * one implementation and no way for the ledger to disagree with it. A spare with
 * no `SparePart` or `InventoryBalance` row is surfaced honestly via the boolean
 * flags and `null` quantities, never coerced to zero.
 */
export interface WorkOrderSpareBalanceEvidence {
  readonly spareId: string;
  readonly hasSparePart: boolean;
  readonly hasBalance: boolean;
  readonly onHandQty: number | null;
  readonly reservedQty: number | null;
  readonly reorderPoint: number | null;
}

export interface WorkOrderMaterialsEvidence {
  readonly workOrderId: string;
  readonly assetId: string;
  /** Raw, exactly as the work order carries them; cardinality is governed downstream. */
  readonly requiredSpareIds: readonly string[];
  readonly spareBalances: readonly WorkOrderSpareBalanceEvidence[];
  readonly evidence: EngineEvidence;
}

/**
 * Slice 2.1c.1 — RAW turnaround lead-time evidence for one named work order
 * within a turnaround scope. Lead times and the turnaround window are read
 * verbatim; the fit arithmetic (max lead time, slack, availability date) is the
 * governed domain engine's, never the adapter's.
 */
export interface TurnaroundSpareLeadTimeEvidence {
  readonly spareId: string;
  readonly leadTimeDays: number | null;
}

export interface TurnaroundLeadTimeEvidence {
  readonly turnaroundScopeId: string;
  readonly workOrderId: string;
  readonly assetId: string;
  readonly requiredSpareIds: readonly string[];
  readonly spareLeadTimes: readonly TurnaroundSpareLeadTimeEvidence[];
  /** Turnaround window start; `null` when the project is missing or unresolved. */
  readonly turnaroundStartIso: string | null;
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

  /**
   * Raw materials evidence for a work order, or `null` when the work order does
   * not exist or belongs to another asset — an auditable unavailable, never a
   * fabricated readiness.
   */
  workOrderMaterialsEvidence(
    workOrderId: string,
    assetId: string,
  ): WorkOrderMaterialsEvidence | null;

  /**
   * Raw lead-time evidence for one named work order within a turnaround scope,
   * or `null` when the scope / work order is missing or the asset mismatches.
   */
  turnaroundLeadTimeEvidence(
    turnaroundScopeId: string,
    workOrderId: string,
    assetId: string,
  ): TurnaroundLeadTimeEvidence | null;
}
