import { describe, expect, it } from "vitest";
import { getDataset } from "@/data/seed";

describe("asset risk portfolio source population", () => {
  it("surfaces the eight canonical synthetic assets without changing protected aggregates", () => {
    const db = getDataset();
    expect(db.plants).toHaveLength(1);
    expect(db.productionLines).toHaveLength(1);
    expect(db.assets).toHaveLength(8);
    expect(new Set(db.assets.map((asset) => asset.id)).size).toBe(8);
    expect(new Set(db.assets.map((asset) => asset.tag)).size).toBe(8);
    expect(db.assets.every((asset) => asset.plantId === db.plants[0]?.id)).toBe(true);
    expect(db.assets.every((asset) => asset.productionLineId === db.productionLines[0]?.id)).toBe(true);
    expect(db.assets.find((asset) => asset.tag === "K-201")?.id).toBe("asset-k201");
    expect(db.assets.find((asset) => asset.tag === "K-201")?.operationalStatus).toBe("attention");
    expect(db.recommendations.find((recommendation) => recommendation.id === "rec-k201")?.projectedValueEnabledUsd).toBe(1094400);
    expect(db.recommendations.reduce((sum, recommendation) => sum + recommendation.projectedValueEnabledUsd, 0)).toBe(1449400);
    expect(db.operationalOutcomes.every((outcome) => outcome.realisedValue === null)).toBe(true);
  });
});
