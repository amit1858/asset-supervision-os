import "server-only";

import {
  ANCHOR_NOW,
  HISTORY_DAYS,
  LINE,
  SEED,
  TREND_WINDOW_DAYS,
} from "@/data/constants";
import { getDataset } from "@/data/seed";
import { analyzeK201 } from "@/data/k201-analysis";
import type {
  AssetAssessmentResult,
  DatasetMetadata,
  EngineEvidence,
  EnginePort,
  OutcomeRealisedValueResult,
  ProductionOeeResult,
  ProjectedValueResult,
} from "@/v2/domain/calculations/port";

/**
 * Slice 2.1c — the SERVER-ONLY engine adapter.
 *
 * This is the only module in the calculation vertical that touches the seeded
 * dataset and the analysis engines. `import "server-only"` makes a client
 * bundle that reaches this file a build error, so governed truth construction
 * cannot leak to the browser.
 *
 * It REIMPLEMENTS NOTHING. Risk, health, time-to-critical, OEE, the loss tree
 * and financial exposure all come from `analyzeK201`, which is itself the
 * single source of truth shared by the seed generator and the repository.
 * Projected value and realised value are read from the governed records the
 * seed already produced. There is no second formula and therefore no way for
 * the ledger to disagree with Asset 360 or the ROTS view.
 *
 * It reads no clock: `ANCHOR_NOW` is the existing canonical anchor, exposed
 * read-only through `datasetMetadata()`. No second anchor is created and
 * nothing under `src/data/**` is modified.
 */

const K201_ASSET_ID = "asset-k201";
const K201_TAG = "K-201";
const DATASET_ID = "k201.local-seed";

function historianEvidence(
  capturedAt: string | null,
  evidenceIds: readonly string[],
): EngineEvidence {
  return {
    sourceKey: "historian",
    sourceMode: "local",
    capturedAt,
    evidenceIds,
  };
}

function seedEvidence(
  capturedAt: string | null,
  evidenceIds: readonly string[],
): EngineEvidence {
  return {
    sourceKey: "local_seed",
    sourceMode: "local",
    capturedAt,
    evidenceIds,
  };
}

function latestReadingAt(assetId: string): string | null {
  const readings = getDataset()
    .sensorReadings.filter((r) => r.assetId === assetId)
    .map((r) => r.timestamp)
    .sort((a, b) => a.localeCompare(b));
  return readings[readings.length - 1] ?? null;
}

class SeededEngineAdapter implements EnginePort {
  datasetMetadata(): DatasetMetadata {
    return Object.freeze({
      datasetId: DATASET_ID,
      seed: SEED,
      anchorNow: ANCHOR_NOW,
      historyDays: HISTORY_DAYS,
      trendWindowDays: TREND_WINDOW_DAYS,
      productionLineId: LINE.id,
      sourceMode: "local" as const,
    });
  }

  /**
   * K-201 is the only asset with a governed assessment engine in Phase 1/2.
   * Every other asset returns `null`, which the ledger records as an explicit
   * unavailable calculation rather than a fabricated score.
   */
  assessAsset(assetId: string): AssetAssessmentResult | null {
    if (assetId !== K201_ASSET_ID) return null;

    const db = getDataset();
    const analysis = analyzeK201({
      sensorReadings: db.sensorReadings,
      productionRuns: db.productionRuns,
      downtimeEvents: db.downtimeEvents,
    });

    const evidenceIds = [
      ...new Set(
        db.sensorReadings.filter((r) => r.assetId === assetId).map((r) => r.sensorId),
      ),
    ].sort();

    return {
      assetId,
      assetTag: K201_TAG,
      healthScore: analysis.risk.healthScore,
      riskScore: analysis.risk.riskScore,
      projectedDaysToCritical: analysis.risk.projectedDaysToCritical,
      valueAtStakeUsd: analysis.totalExposureUsd,
      evidence: historianEvidence(latestReadingAt(assetId), evidenceIds),
    };
  }

  reconcileProductionLine(lineId: string): ProductionOeeResult | null {
    if (lineId !== LINE.id) return null;

    const db = getDataset();
    const analysis = analyzeK201({
      sensorReadings: db.sensorReadings,
      productionRuns: db.productionRuns,
      downtimeEvents: db.downtimeEvents,
    });
    const oee = analysis.recentOee;

    const runs = db.productionRuns
      .filter((r) => r.productionLineId === lineId)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      .slice(-TREND_WINDOW_DAYS);
    const capturedAt = runs[runs.length - 1]?.periodStart ?? null;

    return {
      lineId,
      oee: oee.oee,
      availability: oee.availability,
      performance: oee.performance,
      quality: oee.quality,
      availabilityLossUnits: oee.losses.availabilityLossUnits,
      performanceLossUnits: oee.losses.performanceLossUnits,
      qualityLossUnits: oee.losses.qualityLossUnits,
      evidence: historianEvidence(
        capturedAt,
        runs.map((r) => r.id),
      ),
    };
  }

  /**
   * The projected value of ONE recommendation. The portfolio total is never
   * returned here: summing recommendations is a portfolio view, and a
   * recommendation-scoped request that answered with a portfolio figure would
   * put the portfolio total into a single asset's case ledger.
   */
  projectRecommendationValue(
    recommendationId: string,
    assetId: string,
  ): ProjectedValueResult | null {
    const recommendation = getDataset().recommendations.find(
      (r) => r.id === recommendationId,
    );
    if (!recommendation) return null;
    if (recommendation.assetId !== assetId) return null;

    return {
      recommendationId,
      assetId,
      projectedValueEnabledUsd: recommendation.projectedValueEnabledUsd,
      evidence: seedEvidence(recommendation.createdAt, [recommendation.id]),
    };
  }

  /**
   * The realised value of ONE outcome.
   *
   * `available` is driven by the outcome's own governed `valueStatus` and
   * `realisedValue`, never by a portfolio rollup and never by a default. In the
   * current seeded state no outcome has been validated, so every call reports
   * unavailable — which is the truth, and is emphatically not `0`.
   */
  realisedValueForOutcome(
    outcomeId: string,
    assetId: string,
  ): OutcomeRealisedValueResult | null {
    const outcome = getDataset().operationalOutcomes.find((o) => o.id === outcomeId);
    if (!outcome) return null;
    if (outcome.assetId !== assetId) return null;

    const governed =
      outcome.valueStatus === "realised" && outcome.realisedValue !== null;

    return {
      outcomeId,
      assetId,
      available: governed,
      realisedValueUsd: governed ? outcome.realisedValue : null,
      unavailableReason: governed ? null : "no_validated_outcome_recorded",
      evidence: seedEvidence(outcome.recordedAt, [outcome.id]),
    };
  }
}

let adapter: EnginePort | null = null;

/** The process-wide seeded adapter. Memoized, like the dataset it reads. */
export function getEngineAdapter(): EnginePort {
  if (adapter === null) adapter = new SeededEngineAdapter();
  return adapter;
}
