import { describe, it, expect } from "vitest";
import { toV2Href, v2NavItems, v2LandingRoute } from "./nav";
import { PERSONAS, personaCan } from "@/personas/registry";
import { personaLandingRoute } from "@/personas/routing";
import type { PersonaId } from "@/personas/types";

const ALL_PERSONAS = Object.keys(PERSONAS) as PersonaId[];

describe("toV2Href", () => {
  it("maps renamed v1 routes into the /v2 namespace", () => {
    expect(toV2Href("/plant-overview")).toBe("/v2/plant");
    expect(toV2Href("/reliability")).toBe("/v2/reliability");
    expect(toV2Href("/agent-control")).toBe("/v2/agent-control");
    expect(toV2Href("/value-realisation")).toBe("/v2/value-realisation");
  });

  it("preserves query strings (shareable operational context)", () => {
    expect(toV2Href("/planning?asset=K-201")).toBe("/v2/planning?asset=K-201");
    expect(toV2Href("/agent-control?tab=value-cost")).toBe(
      "/v2/agent-control?tab=value-cost",
    );
  });

  it("maps asset records without per-tag conditionals", () => {
    expect(toV2Href("/assets/K-201")).toBe("/v2/assets/K-201");
    expect(toV2Href("/assets/P-14B")).toBe("/v2/assets/P-14B");
  });

  it("maps the site root to the /v2 root", () => {
    expect(toV2Href("/")).toBe("/v2");
  });
});

describe("v2NavItems", () => {
  it("only includes items the persona is capable of seeing", () => {
    for (const id of ALL_PERSONAS) {
      for (const item of v2NavItems(id)) {
        if (item.capability) {
          expect(personaCan(id, item.capability)).toBe(true);
        }
        expect(item.v2Href.startsWith("/v2")).toBe(true);
      }
    }
  });

  it("never surfaces the design-system route", () => {
    for (const id of ALL_PERSONAS) {
      for (const item of v2NavItems(id)) {
        expect(item.v2Href).not.toContain("design-system");
      }
    }
  });

  it("mirrors the registry nav (capability-filtered) one-for-one", () => {
    for (const id of ALL_PERSONAS) {
      const registryCount = PERSONAS[id].navItems.filter(
        (i) => !i.capability || personaCan(id, i.capability),
      ).length;
      expect(v2NavItems(id).length).toBe(registryCount);
    }
  });
});

describe("v2LandingRoute", () => {
  it("is the v2 mapping of the persona landing route", () => {
    for (const id of ALL_PERSONAS) {
      expect(v2LandingRoute(id)).toBe(toV2Href(personaLandingRoute(id)));
    }
  });

  it("preserves the active asset thread into the persona's asset view", () => {
    // Engineer lands directly on the asset record.
    expect(v2LandingRoute("reliability_engineer", { assetTag: "K-201" })).toBe(
      "/v2/assets/K-201",
    );
    // Planner carries the asset as a query filter.
    expect(v2LandingRoute("maintenance_planner", { assetTag: "K-201" })).toBe(
      "/v2/planning?asset=K-201",
    );
  });
});
