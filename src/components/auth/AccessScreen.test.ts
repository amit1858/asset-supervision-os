import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auth UX truthfulness pass — source invariants for the `/access` screen.
 *
 * These prove, from the committed source, that the authenticated and
 * signed-out presentations use the wording this pass requires and never
 * mix an authenticated identity with a "Continue as Guest Demo" primary
 * action, never present Microsoft sign-in as an active disabled control,
 * and never fall back to displaying the account email on this screen.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/auth/AccessScreen.tsx"),
  "utf8",
);

describe("AccessScreen — signed-out presentation", () => {
  it("keeps the Guest Demo primary action for signed-out visitors", () => {
    expect(source).toContain("Continue as Guest Demo");
  });

  it("keeps the Sign in heading and GitHub sign-in control for signed-out visitors", () => {
    expect(source).toMatch(/"Sign in"/);
    expect(source).toContain("Sign in with GitHub");
  });

  it("never renders a disabled Sign in with Microsoft button — hidden entirely when unconfigured", () => {
    // Microsoft truthfulness: the button only renders when `microsoftConfigured`
    // is true; there is no disabled-button fallback — a quiet note instead.
    expect(source).not.toContain("disabled={!microsoftConfigured}");
    expect(source).not.toMatch(/Sign in with Microsoft[\s\S]{0,80}Not configured/);
    expect(source).toContain("Microsoft sign-in is not configured for this demonstration.");
  });
});

describe("AccessScreen — authenticated presentation", () => {
  it("replaces the Guest Demo card with Continue to workspace", () => {
    expect(source).toContain("Continue to workspace");
    expect(source).toContain(
      "Continue into the governed manufacturing workspace with your authenticated identity.",
    );
    expect(source).toContain("Open workspace");
  });

  it("replaces the Sign in heading with Your account and shows identity + provider + sign out", () => {
    expect(source).toContain("Your account");
    expect(source).toContain("Connected with GitHub");
    expect(source).toContain("Sign out");
  });

  it("does not show Continue as Guest Demo as the authenticated primary action", () => {
    // The authenticated branch must not fall through to the guest card.
    const authenticatedBranch = source.slice(
      source.indexOf("isAuthenticated ? ("),
      source.indexOf(") : ("),
    );
    expect(authenticatedBranch).not.toContain("Continue as Guest Demo");
  });

  it("prefers the display name and never falls back to the email address", () => {
    expect(source).toContain('session?.user?.name ?? "Signed in"');
    expect(source).not.toContain("session?.user?.email");
  });
});
