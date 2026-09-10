import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile V2 shell acceptance repair — source invariants for the persona
 * selector's responsive sizing. Below `lg` it must stay compact (no "Explore
 * as" label, a tighter truncation cap) so it fits inside the mobile header
 * cluster; at `lg` and above it must render exactly as before the repair.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2PersonaSelector.tsx"),
  "utf8",
);

describe("V2PersonaSelector — responsive header sizing", () => {
  it("hides the leading icon and 'Explore as' label until lg (matches the sidebar breakpoint)", () => {
    expect(source).toContain('className="hidden shrink-0 text-header-muted lg:inline"');
    expect(source).toMatch(/<Icon name="user" size=\{15\} className="hidden shrink-0 text-header-muted lg:inline" \/>/);
  });

  it("tightens the truncated name width below lg and restores the original desktop cap at lg+", () => {
    expect(source).toContain(
      'className="max-w-[4rem] truncate font-medium sm:max-w-[6rem] lg:max-w-[10.5rem] xl:max-w-[16rem]"',
    );
  });

  it("still identifies the control by its full accessible label regardless of visible width", () => {
    expect(source).toContain("aria-label={`Explore as ${active.displayName}");
  });
});
