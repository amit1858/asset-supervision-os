import { describe, it, expect } from "vitest";
import { canAccessV2Route, routeAllows, restrictionReason } from "./access";
import { getV2Route, V2_ROUTES } from "./routes";
import { PERSONAS, personaCan } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";

const ALL_PERSONAS = Object.keys(PERSONAS) as PersonaId[];

describe("canAccessV2Route", () => {
  it("opens capability-free routes to every persona", () => {
    for (const route of V2_ROUTES.filter((r) => !r.access)) {
      for (const id of ALL_PERSONAS) {
        expect(canAccessV2Route(id, route.key)).toBe(true);
      }
    }
  });

  it("restricts value realisation to the plant manager", () => {
    for (const id of ALL_PERSONAS) {
      expect(canAccessV2Route(id, "value-realisation")).toBe(
        id === "plant_manager",
      );
    }
  });

  it("restricts the AI control tower to the AI administrator", () => {
    for (const id of ALL_PERSONAS) {
      expect(canAccessV2Route(id, "agent-control")).toBe(id === "ai_admin");
    }
  });

  it("denies OEE to the materials coordinator (holds neither performance capability)", () => {
    expect(canAccessV2Route("materials_coordinator", "oee")).toBe(false);
    expect(canAccessV2Route("reliability_manager", "oee")).toBe(true);
  });

  it("denies Asset 360 to the AI administrator (no asset-condition capability)", () => {
    expect(canAccessV2Route("ai_admin", "asset-360")).toBe(false);
    expect(canAccessV2Route("reliability_engineer", "asset-360")).toBe(true);
  });

  it("agrees with the capability model for every route/persona pair", () => {
    for (const route of V2_ROUTES) {
      for (const id of ALL_PERSONAS) {
        const expected =
          !route.access ||
          route.access.anyOf.some((cap) => personaCan(id, cap));
        expect(canAccessV2Route(id, route.key)).toBe(expected);
      }
    }
  });

  it("returns false for unknown routes", () => {
    expect(canAccessV2Route("plant_manager", "nope")).toBe(false);
  });
});

describe("restrictionReason", () => {
  it("is null when access is allowed and explains the block otherwise", () => {
    expect(restrictionReason("plant_manager", "value-realisation")).toBeNull();
    const reason = restrictionReason("materials_coordinator", "value-realisation");
    expect(reason).toContain("Value Realisation");
  });

  it("routeAllows matches canAccessV2Route", () => {
    const route = getV2Route("oee")!;
    expect(routeAllows("reliability_manager", route)).toBe(
      canAccessV2Route("reliability_manager", "oee"),
    );
  });
});
