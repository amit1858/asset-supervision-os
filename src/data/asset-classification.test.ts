import { describe, it, expect } from "vitest";
import { buildDataset } from "./generate";
import {
  isInCriticalCondition,
  countByConditionStatus,
  countByCriticality,
  criticalityOf,
  conditionStatusOf,
} from "./asset-classification";

describe("criticality vs condition are separate", () => {
  const db = buildDataset();
  const k201 = db.assets.find((a) => a.tag === "K-201")!;

  it("criticality classification is independent of condition status", () => {
    // K-201 is a Criticality-A asset but its current CONDITION is attention.
    expect(criticalityOf(k201)).toBe("A");
    expect(conditionStatusOf(k201)).toBe("attention");
    expect(isInCriticalCondition(k201)).toBe(false);
  });

  it("does not count Criticality A as 'in critical condition'", () => {
    const critA = countByCriticality(db.assets, "A");
    const inCriticalCondition = countByConditionStatus(db.assets, "critical");
    expect(critA).toBeGreaterThan(0); // there ARE criticality-A assets
    expect(inCriticalCondition).toBe(0); // but none are in critical CONDITION
    // The two counts are not interchangeable.
    expect(critA).not.toBe(inCriticalCondition);
  });

  it("only counts assets whose condition status is critical", () => {
    for (const a of db.assets) {
      if (isInCriticalCondition(a)) expect(a.operationalStatus).toBe("critical");
    }
  });
});
