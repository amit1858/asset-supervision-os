import type { ProductionRun } from "@/domain/types";
import { aggregateOee, type OeeResult } from "@/engines/oee";

/**
 * Production-data grain. The seeded production runs are DAILY grain, so
 * shift-level OEE/availability cannot be derived from them. A metric of one
 * grain must never be surfaced as a metric of another grain (a 30-day value
 * must not be shown as a shift value).
 */
export type ProductionGrain = "shift" | "daily" | "monthly";

/** The grain of the seeded production runs. */
export const SEED_PRODUCTION_GRAIN: ProductionGrain = "daily";

/**
 * Returns `value` ONLY if it was derived at the requested grain; otherwise null.
 * This is the guard that prevents a daily/30-day metric being surfaced as a
 * shift metric.
 */
export function metricAtGrain<T>(
  value: T,
  actualGrain: ProductionGrain,
  requiredGrain: ProductionGrain,
): T | null {
  return actualGrain === requiredGrain ? value : null;
}

export interface ShiftMetrics {
  /** True only when shift-grain production data exists. */
  shiftDataAvailable: boolean;
  /** Shift OEE — null unless derived from shift-grain data. */
  shiftOee: number | null;
  /** Shift availability — null unless derived from shift-grain data. */
  shiftAvailability: number | null;
  /** A 30-day unit benchmark, labelled separately (NOT a shift value). */
  benchmark30d: { oee: number; availability: number };
}

/**
 * Compute shift metrics from production runs. Because the seed is daily grain,
 * shift metrics are unavailable and returned as null; a clearly-labelled 30-day
 * unit benchmark is provided separately.
 */
export function computeShiftMetrics(
  runs: ProductionRun[],
  grain: ProductionGrain = SEED_PRODUCTION_GRAIN,
): ShiftMetrics {
  const benchmarkRuns = runs.slice(-30).map((r) => ({
    plannedProductionMinutes: r.plannedProductionMinutes,
    downtimeMinutes: r.downtimeMinutes,
    idealRateUnitsPerHour: r.idealRateUnitsPerHour,
    totalUnitsProduced: r.totalUnitsProduced,
    goodUnits: r.goodUnits,
  }));
  const bench: OeeResult = aggregateOee(benchmarkRuns);

  const shiftDataAvailable = grain === "shift";
  return {
    shiftDataAvailable,
    shiftOee: metricAtGrain(bench.oee, grain, "shift"),
    shiftAvailability: metricAtGrain(bench.availability, grain, "shift"),
    benchmark30d: { oee: bench.oee, availability: bench.availability },
  };
}
