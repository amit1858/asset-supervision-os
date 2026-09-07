import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Case Investigator drawer is an accessibility primitive, not a product
 * surface. These invariants are proven from source so the focus, keyboard and
 * background-isolation behaviour cannot silently regress.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/agent/Drawer.tsx"),
  "utf8",
);

describe("Drawer — accessible overlay invariants", () => {
  it("declares a modal dialog with an accessible label", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("aria-labelledby={titleId}");
  });

  it("closes on Escape", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toMatch(/Escape[\s\S]*?onClose\(\)/);
  });

  it("traps Tab focus within the panel", () => {
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("event.preventDefault()");
  });

  it("restores focus to the opener on close", () => {
    expect(source).toContain("previouslyFocused");
    expect(source).toContain("previouslyFocused?.focus?.()");
  });

  it("blocks the background with a portalled backdrop that closes on click", () => {
    expect(source).toContain("createPortal");
    expect(source).toContain("document.body");
    expect(source).toMatch(/bg-black\/40[\s\S]*?onClick={onClose}/);
  });

  it("locks body scroll while open and never opens on its own", () => {
    expect(source).toContain('body.style.overflow = "hidden"');
    // Rendering is gated on the parent-owned `open` flag — no internal auto-open.
    expect(source).toContain("if (!mounted || !open) return null;");
  });
});
