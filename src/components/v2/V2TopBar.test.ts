import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auth UX truthfulness pass — source invariants for the V2 top bar's
 * "Connect your model" action. Until BYOK provider wiring ships, this
 * control must never present as an active feature for guest or
 * authenticated visitors — it is unconditionally disabled with an honest
 * label and tooltip.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2TopBar.tsx"),
  "utf8",
);

describe("V2TopBar — non-operational model connection action", () => {
  it("renders the model connection control as unconditionally disabled", () => {
    expect(source).toMatch(/<button[\s\S]*?disabled[\s\S]*?Model connection/);
    // Must not be gated on authentication state — no isAuthenticated-driven
    // disabled/onClick wiring for this control.
    expect(source).not.toContain("disabled={!isAuthenticated}");
    expect(source).not.toContain("onClick={() => isAuthenticated && setRuntimeOpen(true)}");
  });

  it("uses the honest coming-next label and tooltip, not an active Connect your model label", () => {
    expect(source).toContain("Model connection — coming next");
    expect(source).toContain(
      "Model connection is not enabled in this build — live provider connection is not yet wired up.",
    );
    expect(source).not.toContain(">Connect your model<");
  });

  it("no longer mounts the BYOK RuntimeDrawer from the top bar", () => {
    expect(source).not.toContain("RuntimeDrawer");
    expect(source).not.toContain("runtimeOpen");
  });
});
