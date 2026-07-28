import { describe, it, expect } from "vitest";
import { computeShiftMetrics, metricAtGrain, SEED_PRODUCTION_GRAIN } from "./shift-metrics";
import { buildDataset } from "./generate";

describe("metricAtGrain", () => {
  it("returns the value only at the required grain", () => {
    expect(metricAtGrain(0.91, "shift", "shift")).toBe(0.91);
    expect(metricAtGrain(0.91, "daily", "shift")).toBeNull();
    expect(metricAtGrain(0.91, "monthly", "shift")).toBeNull();
  });
});

describe("computeShiftMetrics", () => {
  const db = buildDataset();

  it("does not surface a 30-day (daily-grain) value as a shift metric", () => {
    const m = computeShiftMetrics(db.productionRuns);
    expect(SEED_PRODUCTION_GRAIN).toBe("daily");
    expect(m.shiftDataAvailable).toBe(false);
    expect(m.shiftOee).toBeNull();
    expect(m.shiftAvailability).toBeNull();
  });

  it("provides the 30-day unit benchmark separately", () => {
    const m = computeShiftMetrics(db.productionRuns);
    expect(m.benchmark30d.oee).toBeGreaterThan(0);
    expect(m.benchmark30d.oee).toBeLessThan(1);
    // The benchmark is NOT equal to the (null) shift metric.
    expect(m.shiftOee).not.toBe(m.benchmark30d.oee);
  });

  it("would surface shift metrics only when the grain is shift", () => {
    const m = computeShiftMetrics(db.productionRuns, "shift");
    expect(m.shiftDataAvailable).toBe(true);
    expect(m.shiftOee).not.toBeNull();
  });
});
