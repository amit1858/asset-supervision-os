import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile V2 shell acceptance repair — source invariants for `V2SideNavigation`.
 * The persistent desktop sidebar and the new mobile drawer render the exact
 * same navigation list; the only addition is an optional `onNavigate`
 * callback so the drawer can close itself the instant a destination is
 * chosen, and a mobile-only 44px touch-target floor on each link.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2SideNavigation.tsx"),
  "utf8",
);

describe("V2SideNavigation — shared drawer/sidebar navigation", () => {
  it("accepts an optional onNavigate callback with no required props", () => {
    expect(source).toMatch(/onNavigate\s*\}:\s*\{\s*onNavigate\?:\s*\(\)\s*=>\s*void\s*\}\s*=\s*\{\}/);
  });

  it("wires onNavigate to each nav link's onClick so selecting a route can close the drawer", () => {
    expect(source).toContain("onClick={onNavigate}");
  });

  it("keeps a 44px-minimum touch target on mobile only, without changing desktop sizing", () => {
    expect(source).toContain("max-lg:min-h-11");
  });

  it("still derives content entirely from the persona registry (no second nav model)", () => {
    expect(source).toContain("v2NavItems(personaId)");
  });
});
