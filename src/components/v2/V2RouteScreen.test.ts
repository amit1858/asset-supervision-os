import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * September 9 dispatcher regression — source invariants for V2RouteScreen.
 *
 * The route→workspace dispatch was refactored from a nested ternary to a
 * readable switch. These invariants prove, from the committed source, that:
 *   - every implemented route maps to its own workspace + server read model;
 *   - the previously-working reliability and materials branches are unchanged;
 *   - unimplemented routes still fall through to the honest placeholder;
 *   - the screen remains a server component and renders the brief only for a
 *     persona workspace.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2RouteScreen.tsx"),
  "utf8",
);

describe("V2RouteScreen dispatch map", () => {
  const CASES: ReadonlyArray<[string, string, string]> = [
    ["reliability", "ReliabilityWorkspace", "getReliabilityWorkspaceView"],
    ["materials", "MaintenanceMaterialsWorkspace", "getMaintenanceMaterialsView"],
    ["turnaround", "TurnaroundControlWorkspace", "getTurnaroundControlView"],
    ["oee", "OeeLossWorkspace", "getOeeLossView"],
    ["value-realisation", "ValueRealisationWorkspace", "getValueRealisationView"],
  ];

  for (const [key, component, readModel] of CASES) {
    it(`routes "${key}" to ${component} via ${readModel}`, () => {
      expect(source).toContain(`case "${key}":`);
      expect(source).toContain(`<${component} view={${readModel}(`);
    });
  }

  it("uses a switch, not a nested ternary chain, for dispatch", () => {
    expect(source).toContain("switch (route.key)");
    // The old ternary tested route.key equality inline; the refactor removes it.
    expect(source).not.toContain('route.key === "reliability" ?');
  });

  it("falls through unimplemented routes to the honest placeholder", () => {
    expect(source).toContain("default:");
    expect(source).toContain("<V2Placeholder route={route} />");
  });

  it("renders the brief only for a persona workspace", () => {
    expect(source).toContain('route.kind === "persona_workspace"');
    expect(source).toContain("presentBriefForV2(buildPersonaBrief(");
  });

  it("remains a server component (no 'use client')", () => {
    expect(source.includes("use client")).toBe(false);
  });

  it("still gates access with the capability model before dispatch", () => {
    expect(source).toContain("canAccessV2Route(ctx.personaId, route.key)");
    expect(source).toContain("<V2Restricted");
  });
});
