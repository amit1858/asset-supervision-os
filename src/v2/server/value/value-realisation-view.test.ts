import { describe, it, expect } from "vitest";
import { getValueRealisationView } from "./value-realisation-view";

/**
 * September 9 Value Realisation experience — read-model contract.
 *
 * Proves the four financial concepts stay strictly separate and correctly
 * represented: decision exposure ($1,620,156) is the governed envelope reused
 * verbatim; value at stake, portfolio projected, K-201 projected and realised
 * are source facts with no fabricated envelope metadata; and realised value is
 * rendered "not yet available", NEVER as $0.
 */
describe("getValueRealisationView — governed decision exposure", () => {
  const view = getValueRealisationView("plant_manager");

  it("reuses the governed decision-exposure envelope verbatim", () => {
    expect(view.decisionExposure.rawValue).toBe(1620155.9999999995);
    expect(view.decisionExposure.display).toBe("$1,620,156");
    expect(view.decisionExposure.label).toBe("Decision exposure");
  });

  it("carries governed envelope metadata on the exposure only", () => {
    expect(view.decisionExposure.trustLabel).toBe("Deterministic calculation");
    expect(view.decisionExposure.formulaVersion.length).toBeGreaterThan(0);
    expect(view.decisionExposure.formulaVersion).not.toBe("n/a");
  });
});

describe("getValueRealisationView — source facts kept separate", () => {
  const view = getValueRealisationView("plant_manager");

  it("keeps value at stake, projected and realised as distinct labelled concepts", () => {
    expect(view.valueAtStake.rawValue).toBe(2304155.9999999995);
    expect(view.portfolioProjected.rawValue).toBe(1449400);
    expect(view.k201Projected.rawValue).toBe(1094400);
  });

  it("formats the source-fact displays as currency", () => {
    expect(view.portfolioProjected.display).toBe("$1,449,400");
    expect(view.k201Projected.display).toBe("$1,094,400");
  });

  it("labels source facts with their origin and no envelope metadata", () => {
    for (const fact of [view.valueAtStake, view.portfolioProjected, view.k201Projected]) {
      expect(fact.sourceIdentity.length).toBeGreaterThan(0);
      // A SourceFactView must not expose envelope-only fields.
      expect(fact).not.toHaveProperty("formulaVersion");
      expect(fact).not.toHaveProperty("trustLabel");
      expect(fact).not.toHaveProperty("freshness");
    }
  });
});

describe("getValueRealisationView — realised value honesty", () => {
  const view = getValueRealisationView("plant_manager");

  it("renders realised value as not-yet-available, never as zero", () => {
    expect(view.realised.available).toBe(false);
    expect(view.realised.rawValue).toBeNull();
    expect(view.realised.display).not.toBe("$0");
    expect(view.realised.unavailableReason).toContain("Not yet available");
    expect(view.realisedNotice).toContain("Not yet available");
  });
});

describe("getValueRealisationView — determinism and scope", () => {
  const view = getValueRealisationView("plant_manager");

  it("excludes token economics from this workspace's scope notice", () => {
    expect(view.scopeNotice.toLowerCase()).toContain("token");
    expect(view.conditionalNotice.toLowerCase()).toContain("conditional");
  });

  it("is deterministic across calls and viewer-independent", () => {
    const a = getValueRealisationView("plant_manager");
    const b = getValueRealisationView("reliability_manager");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
