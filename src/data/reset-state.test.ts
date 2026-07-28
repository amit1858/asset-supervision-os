import { describe, it, expect } from "vitest";
import { buildDataset } from "./generate";
import { computeRots } from "@/engines/rots";
import type { ReadinessDimension } from "@/domain/enums";

/**
 * Guards on the corrected deterministic "reset" state: the demo must not claim
 * realised outcomes or real external provider activity that has not occurred.
 */
describe("reset-state AI accounting", () => {
  const db = buildDataset();

  it("records every actual AI interaction as the offline mock provider", () => {
    for (const i of db.aiInteractions) {
      expect(i.accounting).toBe("actual");
      expect(i.provider).toBe("mock");
      expect(i.estimatedCostUsd).toBe(0);
    }
  });

  it("has no actual NVIDIA or DGX Spark usage in the synthetic records", () => {
    const external = db.aiInteractions.filter(
      (i) => i.provider === "nvidia" || i.provider === "dgxspark",
    );
    expect(external.length).toBe(0);
  });

  it("reports actual cost of $0 with separate estimated scenarios", () => {
    const m = computeRots({
      interactions: db.aiInteractions,
      recommendations: db.recommendations,
      decisions: db.humanDecisions,
      outcomes: db.operationalOutcomes,
    });
    expect(m.actualProvider).toBe("mock");
    expect(m.actualCostUsd).toBe(0);
    // Estimated NVIDIA/DGX scenarios exist for comparison, clearly separated.
    const providers = m.estimatedScenarios.map((s) => s.provider);
    expect(providers).toContain("nvidia");
    expect(providers).toContain("dgxspark");
    expect(m.estimatedScenarios.every((s) => s.accounting === "estimated")).toBe(true);
  });
});

describe("reset-state value taxonomy", () => {
  const db = buildDataset();
  const m = computeRots({
    interactions: db.aiInteractions,
    recommendations: db.recommendations,
    decisions: db.humanDecisions,
    outcomes: db.operationalOutcomes,
  });

  it("has no realised value before any validated outcome", () => {
    // No seeded outcome is realised in the reset state.
    expect(db.operationalOutcomes.every((o) => o.valueStatus !== "realised")).toBe(true);
    expect(db.operationalOutcomes.every((o) => o.realisedValue === null)).toBe(true);
    expect(m.realisedValueUsd).toBe(0);
    expect(m.realisedAvailable).toBe(false);
    expect(m.realisedValuePer1kTokens).toBeNull();
  });

  it("separates projected value-enabled from value-at-stake and realised", () => {
    expect(m.valueAtStakeUsd).toBeGreaterThan(0);
    expect(m.projectedValueEnabledUsd).toBeGreaterThan(0);
    // Projected enabled value is protected value, distinct from exposure at stake.
    expect(m.projectedValueEnabledUsd).toBeLessThanOrEqual(m.valueAtStakeUsd);
  });

  it("shows accepted-recommendation outcomes as pending, not realised", () => {
    expect(m.pendingOutcomeCount).toBeGreaterThan(0);
    expect(m.resolvedEventCount).toBe(0);
  });
});

describe("turnaround readiness calculation", () => {
  it("counts 6 of 12 readiness checks (ready or on-track) = 50%", () => {
    const db = buildDataset();
    const dims: ReadinessDimension[] = ["engineering", "materials", "labour", "permits"];
    const packages = db.turnaroundWorkPackages;
    const total = packages.length * dims.length;
    const completed = packages.reduce(
      (s, p) => s + dims.filter((d) => p.readiness[d] === "ready" || p.readiness[d] === "on_track").length,
      0,
    );
    expect(total).toBe(12);
    expect(completed).toBe(6);
    expect(Math.round((completed / total) * 100)).toBe(50);
  });
});
