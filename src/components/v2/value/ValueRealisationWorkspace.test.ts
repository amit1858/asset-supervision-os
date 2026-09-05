import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * September 9 Value Realisation — presentation invariants.
 *
 * Pure source-string checks (no React render) proving the corrected wording:
 * the recommendation table no longer implies every row is awaiting an outcome,
 * the four value concepts remain visually distinct, no token-economics term is
 * hardcoded on a card, and the formula identifier is not printed on the
 * Decision-exposure card face.
 */

const SRC = readFileSync(
  join(process.cwd(), "src/components/v2/value/ValueRealisationWorkspace.tsx"),
  "utf8",
);

describe("ValueRealisationWorkspace presentation", () => {
  it("drops the misleading blanket table heading and row status", () => {
    expect(SRC).not.toContain("Projected value awaiting an outcome");
    expect(SRC).not.toContain("Open — outcome pending");
  });

  it("renders each recommendation's true status via the view model", () => {
    expect(SRC).toContain("Recommendation status");
    expect(SRC).toContain("r.statusLabel");
    expect(SRC).toContain("view.recommendationScopeNote");
  });

  it("surfaces the throughput scope note distinguishing populations", () => {
    expect(SRC).toContain("view.throughputScopeNote");
  });

  it("hardcodes no token-economics terminology on the cards", () => {
    // The only place the technical ledger identity may appear is data-driven
    // (provenanceIdentity), never as a hardcoded card string.
    expect(SRC).not.toContain("Return on Token Spend");
  });

  it("does not print the formula identifier on the Decision-exposure card face", () => {
    expect(SRC).not.toContain("formula {metric.formulaVersion}");
  });

  it("keeps the source-provenance disclosure for the technical identities", () => {
    expect(SRC).toContain("view.sourceProvenance");
    expect(SRC).toContain("provenanceIdentity");
  });
});
