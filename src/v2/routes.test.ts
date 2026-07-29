import { describe, it, expect } from "vitest";
import {
  V2_ROUTES,
  listV2Routes,
  getV2Route,
  getV2RouteByPath,
} from "./routes";
import { PERSONAS } from "@/personas/registry";
import { ALL_CAPABILITIES } from "@/personas/capabilities";
import type { PersonaId } from "@/personas/types";

describe("v2 route registry", () => {
  it("exposes routes with unique keys and paths", () => {
    const keys = V2_ROUTES.map((r) => r.key);
    const paths = V2_ROUTES.map((r) => r.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps every route inside the /v2 namespace", () => {
    for (const r of V2_ROUTES) {
      expect(r.path.startsWith("/v2")).toBe(true);
    }
  });

  it("never exposes the design-system showcase as a customer route", () => {
    for (const r of V2_ROUTES) {
      expect(r.path).not.toContain("design-system");
    }
  });

  it("names a valid owner persona for every route", () => {
    const ids = new Set(Object.keys(PERSONAS) as PersonaId[]);
    for (const r of V2_ROUTES) {
      expect(ids.has(r.ownerPersona)).toBe(true);
    }
  });

  it("only references real capabilities in access rules", () => {
    const caps = new Set(ALL_CAPABILITIES);
    for (const r of V2_ROUTES) {
      for (const cap of r.access?.anyOf ?? []) {
        expect(caps.has(cap)).toBe(true);
      }
    }
  });

  it("covers the eight persona homes", () => {
    const owners = V2_ROUTES.filter((r) => r.kind === "persona_workspace").map(
      (r) => r.ownerPersona,
    );
    expect(new Set(owners).size).toBe(8);
  });

  it("resolves routes by key and by path", () => {
    expect(getV2Route("plant")?.path).toBe("/v2/plant");
    expect(getV2RouteByPath("/v2/plant")?.key).toBe("plant");
    expect(getV2Route("does-not-exist")).toBeUndefined();
    expect(listV2Routes()).toBe(V2_ROUTES);
  });
});
