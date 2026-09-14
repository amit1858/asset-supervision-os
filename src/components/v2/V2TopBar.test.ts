import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Governed session-scoped BYOK source invariants. Authentication controls
 * access to the connection surface; it does not itself connect a provider.
 */
const source = readFileSync(
  join(process.cwd(), "src/components/v2/V2TopBar.tsx"),
  "utf8",
);

describe("V2TopBar — governed model connection action", () => {
  it("enables the surface only for authenticated users", () => {
    expect(source).toContain("aria-disabled={!isAuthenticated}");
    expect(source).toContain("if (isAuthenticated) openConnection()");
  });

  it("explains guest deterministic narration without implying a connection", () => {
    expect(source).toContain("Provider Centre");
    expect(source).toContain("Deterministic narration");
    expect(source).toContain(
      "Guest Demo uses governed deterministic narration. Sign in to open Provider Centre.",
    );
    expect(source).toContain(
      "Deterministic narration — Provider Centre requires sign-in.",
    );
  });

  it("shows the connected state without conflating identity or persona", () => {
    expect(source).toContain("connected");
    expect(source).toContain("<V2PersonaSelector />");
    expect(source).toContain('href="/access"');
  });
});
