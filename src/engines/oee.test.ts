import { describe, it, expect } from "vitest";
import {
  computeOee,
  aggregateOee,
  financialExposure,
  type OeeInputs,
} from "./oee";

describe("computeOee", () => {
  // Textbook case engineered to give A=P=Q=0.9, OEE=0.729.
  const base: OeeInputs = {
    plannedProductionMinutes: 1000,
    downtimeMinutes: 100,
    idealRateUnitsPerHour: 60, // 1 unit/min
    totalUnitsProduced: 810,
    goodUnits: 729,
  };

  it("computes the three components exactly", () => {
    const r = computeOee(base);
    expect(r.availability).toBeCloseTo(0.9, 10);
    expect(r.performance).toBeCloseTo(0.9, 10);
    expect(r.quality).toBeCloseTo(0.9, 10);
    expect(r.oee).toBeCloseTo(0.729, 10);
  });

  it("builds the loss tree in production units", () => {
    const r = computeOee(base);
    expect(r.losses.runTimeMinutes).toBe(900);
    expect(r.losses.theoreticalMaxUnits).toBeCloseTo(900, 10);
    expect(r.losses.availabilityLossUnits).toBeCloseTo(100, 10); // 60/h * 100min
    expect(r.losses.performanceLossUnits).toBeCloseTo(90, 10); // 900 - 810
    expect(r.losses.qualityLossUnits).toBeCloseTo(81, 10); // 810 - 729
    expect(r.losses.totalLossUnits).toBeCloseTo(271, 10);
  });

  it("returns zeros when there is no planned time", () => {
    const r = computeOee({ ...base, plannedProductionMinutes: 0 });
    expect(r.oee).toBe(0);
    expect(r.availability).toBe(0);
  });

  it("clamps performance above 1 but preserves the raw ratio", () => {
    const r = computeOee({ ...base, totalUnitsProduced: 1000, goodUnits: 1000 });
    expect(r.performance).toBe(1);
    expect(r.rawPerformance).toBeGreaterThan(1);
  });

  it("never yields quality above 1", () => {
    const r = computeOee({ ...base, goodUnits: 900 });
    expect(r.quality).toBeLessThanOrEqual(1);
  });
});

describe("aggregateOee", () => {
  it("rolls up by summing minutes and units, not averaging OEEs", () => {
    const runs: OeeInputs[] = [
      { plannedProductionMinutes: 600, downtimeMinutes: 60, idealRateUnitsPerHour: 60, totalUnitsProduced: 500, goodUnits: 495 },
      { plannedProductionMinutes: 600, downtimeMinutes: 120, idealRateUnitsPerHour: 60, totalUnitsProduced: 460, goodUnits: 450 },
    ];
    const agg = aggregateOee(runs);
    // planned 1200, downtime 180 -> availability 1020/1200 = 0.85
    expect(agg.availability).toBeCloseTo(0.85, 10);
    expect(agg.oee).toBeGreaterThan(0);
    expect(agg.oee).toBeLessThan(1);
  });

  it("returns an empty result for no runs", () => {
    expect(aggregateOee([]).oee).toBe(0);
  });
});

describe("financialExposure", () => {
  it("multiplies loss units by contribution margin", () => {
    expect(financialExposure(271, 12)).toBe(3252);
  });
  it("never returns a negative exposure", () => {
    expect(financialExposure(-50, 12)).toBe(0);
    expect(financialExposure(50, -12)).toBe(0);
  });
});
