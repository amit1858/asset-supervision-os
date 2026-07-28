import { describe, it, expect } from "vitest";
import { buildDataset } from "./generate";
import { analyzeK201 } from "./k201-analysis";

describe("seeded K-201 dataset", () => {
  const a = buildDataset();

  it("is fully deterministic for a fixed seed", () => {
    const b = buildDataset();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("contains the full set of core entities", () => {
    expect(a.assets.length).toBeGreaterThanOrEqual(8);
    expect(a.sensorReadings.length).toBe(270); // 3 channels x 90 days
    expect(a.productionRuns.length).toBe(90);
    expect(a.recommendations.length).toBeGreaterThan(0);
    expect(a.aiInteractions.length).toBe(a.recommendations.length);
    expect(a.meta.synthetic).toBe(true);
    expect(a.meta.heroAssetTag).toBe("K-201");
  });

  it("tells the intended deterioration story", () => {
    const an = analyzeK201(a);
    // Vibration has crossed warning (7.1) but not critical (11.2).
    expect(an.latest.vibration).toBeGreaterThan(7.1);
    expect(an.latest.vibration).toBeLessThan(11.2);
    // Drive-end bearing temperature has crossed its warning (85 °C).
    expect(an.latest.bearingTempDe).toBeGreaterThan(85);
    // Projected failure precedes the repair lead time -> immediate.
    expect(an.risk.projectedDaysToCritical).not.toBeNull();
    expect(an.risk.recommendedDisposition).toBe("immediate");
    expect(an.risk.riskScore).toBeGreaterThanOrEqual(45);
    // OEE is a valid ratio and financial exposure is positive.
    expect(an.recentOee.oee).toBeGreaterThan(0);
    expect(an.recentOee.oee).toBeLessThan(1);
    expect(an.totalExposureUsd).toBeGreaterThan(0);
  });

  it("keeps the hero recommendation open, time-bound, and grounded in evidence", () => {
    const rec = a.recommendations.find((r) => r.id === "rec-k201")!;
    expect(rec.status).toBe("open");
    expect(rec.disposition).toBe("immediate");
    // Time-bound operational decision, not an ambiguous label.
    expect(rec.title.toLowerCase()).toContain("within 48 hours");
    const kinds = rec.actionPlan.map((p) => p.kind);
    expect(kinds).toContain("immediate_mitigation");
    expect(kinds).toContain("inspection");
    expect(kinds).toContain("turnaround_overhaul");
    expect(rec.dueBy).not.toBeNull();
    expect(rec.decisionOwner.length).toBeGreaterThan(0);
    expect(rec.evidenceIds.length).toBeGreaterThanOrEqual(5);
    // The AI rationale must state that human approval is required.
    expect(rec.aiRationale!).toMatch(/human approval/i);
  });
});
