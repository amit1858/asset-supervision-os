import { describe, it, expect } from "vitest";
import { buildOperationalThread } from "./thread";
import { PERSONAS } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";

const EXPECTED_ORDER = [
  "signal",
  "risk",
  "decision",
  "planning",
  "materials",
  "turnaround",
  "value",
  "ai",
];

const EXPECTED_OWNERS: Record<string, PersonaId> = {
  signal: "shift_supervisor",
  risk: "reliability_engineer",
  decision: "reliability_manager",
  planning: "maintenance_planner",
  materials: "materials_coordinator",
  turnaround: "turnaround_manager",
  value: "plant_manager",
  ai: "ai_admin",
};

describe("buildOperationalThread", () => {
  it("produces the eight ordered Signal→Value stages", () => {
    const thread = buildOperationalThread("K-201");
    expect(thread.stages.map((s) => s.key)).toEqual(EXPECTED_ORDER);
  });

  it("assigns each stage to its accountable persona (blueprint §5)", () => {
    const thread = buildOperationalThread("K-201");
    for (const stage of thread.stages) {
      expect(stage.ownerPersona).toBe(EXPECTED_OWNERS[stage.key]);
      expect(stage.ownerName).toBe(PERSONAS[stage.ownerPersona].displayName);
    }
  });

  it("is asset-agnostic — the tag flows into every asset-aware href and the record link", () => {
    const a = buildOperationalThread("K-201");
    const b = buildOperationalThread("P-14B");
    expect(a.assetRecordHref).toBe("/v2/assets/K-201");
    expect(b.assetRecordHref).toBe("/v2/assets/P-14B");
    // Same structure regardless of tag (no per-tag conditionals).
    expect(a.stages.map((s) => s.key)).toEqual(b.stages.map((s) => s.key));
    // The value stage is not asset-aware, so it stays tag-free.
    const aValue = a.stages.find((s) => s.key === "value")!;
    expect(aValue.href).toBe("/v2/value-realisation");
    // Asset-aware stages carry the tag.
    const aPlanning = a.stages.find((s) => s.key === "planning")!;
    expect(aPlanning.href).toBe("/v2/planning?asset=K-201");
  });

  it("marks the stage owned by the active persona as current, and only that one", () => {
    const thread = buildOperationalThread("K-201", "reliability_manager");
    const current = thread.stages.filter((s) => s.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]!.key).toBe("decision");
  });

  it("marks no stage current when no persona is active", () => {
    const thread = buildOperationalThread("K-201");
    expect(thread.stages.some((s) => s.isCurrent)).toBe(false);
  });

  it("keeps every stage href inside the /v2 namespace", () => {
    for (const stage of buildOperationalThread("K-201").stages) {
      expect(stage.href.startsWith("/v2")).toBe(true);
    }
  });
});
