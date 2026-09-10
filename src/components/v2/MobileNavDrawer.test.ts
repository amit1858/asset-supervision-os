import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile V2 shell acceptance repair — source invariants for the mobile
 * navigation drawer. Below `lg` there is no persistent sidebar, so this
 * component is the only way to reach navigation; it must behave like a
 * proper accessible sheet (focus trap, Escape, scroll lock, focus restore)
 * without touching the Case Investigator's independent `Drawer` primitive.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/MobileNavDrawer.tsx"),
  "utf8",
);

describe("MobileNavDrawer — accessible mobile navigation sheet", () => {
  it("is a client component rendered as a modal dialog", () => {
    expect(source).toContain('"use client"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-label="Navigation"');
  });

  it("traps focus with Tab and restores it to the previously-focused element on close", () => {
    expect(source).toMatch(/const FOCUSABLE\s*=/);
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("previouslyFocused?.focus?.()");
  });

  it("closes on Escape", () => {
    expect(source).toMatch(/event\.key === "Escape"[\s\S]*?onClose\(\)/);
  });

  it("locks background scroll only while open and restores it on close", () => {
    expect(source).toContain('body.style.overflow = "hidden"');
    expect(source).toContain("body.style.overflow = priorOverflow");
  });

  it("closes automatically when the route changes underneath it", () => {
    expect(source).toContain("usePathname()");
    expect(source).toContain("openedPathname");
    expect(source).toMatch(/pathname !== openedPathname\.current\) onClose\(\)/);
  });

  it("closes defensively if the viewport grows past the desktop breakpoint while open", () => {
    expect(source).toContain('matchMedia("(min-width: 1024px)")');
  });

  it("portals to document.body and has a 44px close control", () => {
    expect(source).toContain("createPortal(");
    expect(source).toContain("document.body");
    expect(source).toContain("h-11 w-11");
    expect(source).toContain('aria-label="Close navigation"');
  });

  it("does not reuse or modify the Case Investigator's Drawer primitive", () => {
    expect(source).not.toContain("agent/Drawer");
  });
});
