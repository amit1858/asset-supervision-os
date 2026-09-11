import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile V2 shell acceptance repair — source invariants for `V2TopBar`'s
 * mobile-only affordances. Below `lg` (1024px) there is no room for every
 * desktop control at once, so voice/notifications/approvals/theme move
 * behind a single "More actions" menu while a hamburger opens the mobile
 * navigation drawer. Persona, the (still non-operational) model-connection
 * status, and identity/guest access must stay directly visible at every
 * width — see `V2TopBar.test.ts` for the pre-existing non-operational
 * model-connection invariants, which this file does not duplicate.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2TopBar.tsx"),
  "utf8",
);

describe("V2TopBar — mobile navigation trigger", () => {
  it("renders an lg:hidden hamburger trigger only when onOpenNav is provided", () => {
    expect(source).toContain("onOpenNav?: () => void");
    expect(source).toMatch(/onOpenNav \? \([\s\S]*?aria-label="Open navigation"[\s\S]*?lg:hidden/);
    expect(source).toContain('<Icon name="menu" size={20} />');
  });

  it("gives the nav trigger a 44px touch target", () => {
    expect(source).toMatch(/aria-label="Open navigation"[\s\S]{0,200}h-11 w-11/);
  });
});

describe("V2TopBar — desktop cluster unchanged at lg and above", () => {
  it("keeps voice, notifications, approvals and the divider desktop-only via hidden lg:flex", () => {
    expect(source).toMatch(
      /<div className="hidden items-center gap-1 lg:flex">[\s\S]*?VoiceHeaderButton[\s\S]*?Notifications[\s\S]*?My Approvals[\s\S]*?<\/div>/,
    );
  });

  it("keeps the theme switcher desktop-only via hidden lg:block", () => {
    expect(source).toMatch(/<div className="hidden lg:block">\s*<ThemeSwitcher \/>\s*<\/div>/);
  });
});

describe("V2TopBar — MobileActionsMenu (More actions)", () => {
  it("is hidden at lg and above and exposes an accessible menu trigger", () => {
    expect(source).toMatch(/function MobileActionsMenu/);
    expect(source).toContain('<div className="relative lg:hidden">');
    expect(source).toContain('aria-haspopup="true"');
    expect(source).toContain('aria-label={`More actions');
  });

  it("closes on Escape and restores focus to its trigger", () => {
    const menuSection = source.slice(
      source.indexOf("function MobileActionsMenu"),
      source.indexOf("function HeaderIconButton"),
    );
    expect(menuSection).toContain('e.key === "Escape"');
    expect(menuSection).toContain("setOpen(false)");
    expect(menuSection).toContain("triggerRef.current?.focus()");
  });

  it("reuses the same voice launcher and theme switcher components as desktop (no reimplementation)", () => {
    const menuSection = source.slice(source.indexOf("function MobileActionsMenu"));
    expect(menuSection).toContain("<VoiceHeaderButton />");
    expect(menuSection).toContain("<ThemeSwitcher />");
  });

  it("surfaces My Approvals and Notifications inside the menu", () => {
    const menuSection = source.slice(source.indexOf("function MobileActionsMenu"));
    expect(menuSection).toContain("My Approvals");
    expect(menuSection).toContain("Notifications");
  });
});

describe("V2TopBar — always-visible identity, persona and model-connection status", () => {
  it("never wraps the persona selector, model-connection status or identity link behind lg:hidden", () => {
    expect(source).not.toMatch(/hidden lg:(flex|block)">\s*<V2PersonaSelector/);
    expect(source).not.toMatch(/hidden lg:(flex|block)">\s*<Link\s+href="\/access"/);
  });

  it("gives the identity link a 44px mobile touch target while leaving desktop height auto", () => {
    expect(source).toMatch(/href="\/access"[\s\S]{0,300}h-11 shrink-0[\s\S]{0,300}lg:h-auto/);
  });

  it("defers verbose model and identity labels until 1360px to avoid the 1280px xl breakpoint overflow", () => {
    expect(source).toMatch(
      /className="hidden min-\[1360px\]:inline">[\s\S]*?Connect your model/,
    );
    expect(source).toContain('className="hidden max-w-[10rem] truncate min-[1360px]:inline">{identityLabel}</span>');
    expect(source).not.toContain("truncate xl:inline");
  });
});
