import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile V2 shell acceptance repair — source invariants for how
 * `V2ShellClient` wires the mobile navigation drawer alongside the existing
 * persistent desktop sidebar. The sidebar itself must remain untouched
 * (`hidden ... lg:block`) so desktop behavior at 1024px/1440px is preserved.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2ShellClient.tsx"),
  "utf8",
);

describe("V2ShellClient — mobile navigation wiring", () => {
  it("lifts navOpen state and opens it from the top bar's hamburger trigger", () => {
    expect(source).toContain("const [navOpen, setNavOpen] = useState(false);");
    expect(source).toContain("onOpenNav={() => setNavOpen(true)}");
  });

  it("renders MobileNavDrawer wrapping V2SideNavigation with a close-on-navigate callback", () => {
    expect(source).toMatch(
      /<MobileNavDrawer open=\{navOpen\} onClose=\{\(\) => setNavOpen\(false\)\} contextLabel=\{persona\.displayName\}>\s*<V2SideNavigation onNavigate=\{\(\) => setNavOpen\(false\)\} \/>\s*<\/MobileNavDrawer>/,
    );
  });

  it("derives the drawer's context label from the active persona (not a hardcoded string)", () => {
    expect(source).toContain("const persona = getPersona(personaId);");
    expect(source).toContain("persona.displayName");
  });

  it("keeps the persistent desktop sidebar exactly as before (hidden below lg, unchanged at lg+)", () => {
    expect(source).toContain(
      'className="sticky hidden w-56 shrink-0 self-start overflow-y-auto border-r border-border bg-surface lg:block"',
    );
    // Desktop sidebar renders V2SideNavigation with no onNavigate — untouched.
    expect(source).toMatch(/<aside[\s\S]*?<V2SideNavigation \/>\s*<\/aside>/);
  });
});
