import { describe, expect, it } from "vitest";
import { GUIDED_JOURNEYS, getGuidedJourneyForPersona } from "./journeys";
import { PERSONAS } from "@/personas/registry";
import { V2_ROUTES } from "./routes";

describe("guided journeys", () => {
  it("defines one typed journey for each supported role", () => {
    expect(GUIDED_JOURNEYS.map((j) => j.id)).toEqual([
      "plant-manager-operating-thread",
      "reliability-manager-prioritisation",
      "materials-readiness",
      "turnaround-horizon",
    ]);
    expect(new Set(GUIDED_JOURNEYS.map((j) => j.id)).size).toBe(GUIDED_JOURNEYS.length);
    for (const journey of GUIDED_JOURNEYS) {
      expect(PERSONAS[journey.personaId]).toBeDefined();
      expect(journey.steps.length).toBeGreaterThanOrEqual(5);
      expect(new Set(journey.steps.map((step) => step.id)).size).toBe(journey.steps.length);
      for (const step of journey.steps) {
        expect(step.targetId).toMatch(/^[a-z0-9-]+$/);
        expect(step.route.startsWith("/v2/")).toBe(true);
        expect(V2_ROUTES.some((route) => step.route === route.path || step.route.startsWith(`${route.path}/`))).toBe(true);
      }
    }
  });

  it("resolves only configured personas", () => {
    expect(getGuidedJourneyForPersona("plant_manager")?.id).toBe("plant-manager-operating-thread");
    expect(getGuidedJourneyForPersona("reliability_manager")?.id).toBe("reliability-manager-prioritisation");
    expect(getGuidedJourneyForPersona("materials_coordinator")?.id).toBe("materials-readiness");
    expect(getGuidedJourneyForPersona("turnaround_manager")?.id).toBe("turnaround-horizon");
    expect(getGuidedJourneyForPersona("ai_admin")).toBeNull();
  });
});
