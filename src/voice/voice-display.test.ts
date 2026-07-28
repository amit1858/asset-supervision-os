import { describe, it, expect } from "vitest";
import { voiceScopeDisplay } from "./display";
import type { VoiceScope } from "./types";

const plants = [{ id: "plant-gc", name: "Gulf Coast Refinery (synthetic)" }];
const units = [{ id: "line-hds2", name: "HDS-2 — Diesel Hydrotreater Unit 2" }];
const scope: VoiceScope = {
  personaId: "reliability_manager",
  plantId: "plant-gc",
  unitId: "line-hds2",
  assetTag: "K-201",
  timeRange: "30d",
  shift: null,
  route: "/reliability",
  sourceMode: "local",
  dataFreshness: "recent",
};

describe("voice scope display", () => {
  it("uses business-readable labels instead of internal shorthand", () => {
    const d = voiceScopeDisplay(scope, plants, units);
    expect(d.personaName).toBe("Reliability Manager");
    expect(d.plantName).toContain("Gulf Coast Refinery");
    expect(d.unitName).toBe("HDS-2 — Diesel Hydrotreater Unit 2");
    expect(d.timeRangeLabel).toBe("Last 30 days");
    expect(d.freshnessLabel).toBe("Updated recently");
    // Raw ids are never surfaced.
    expect(d.plantName).not.toContain("plant-");
    expect(d.unitName).not.toContain("line-");
    expect(d.timeRangeLabel).not.toBe("30d");
  });

  it("never exposes implementation terms", () => {
    const blob = JSON.stringify(voiceScopeDisplay(scope, plants, units)).toLowerCase();
    for (const t of ["provider", "mock", "seeded", "repository", "api", "endpoint"]) {
      expect(blob).not.toContain(t);
    }
  });

  it("keeps stable internal IDs in the domain scope (only the display differs)", () => {
    expect(scope.plantId).toBe("plant-gc");
    expect(scope.unitId).toBe("line-hds2");
    expect(scope.timeRange).toBe("30d");
  });
});
