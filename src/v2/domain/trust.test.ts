import { describe, it, expect } from "vitest";
import { trustFromProvenance, TRUST_BY_PROVENANCE } from "./trust";
import type { TrustClassification } from "./trust";
import type { Provenance } from "@/domain/enums";

/**
 * Slice 2.1a — technical plan §12.3b. `trustClassification` is a derived,
 * fail-safe mapping over the existing `Provenance` primitive.
 */

const ALL_PROVENANCE: readonly Provenance[] = [
  "measured",
  "deterministic",
  "business_rule",
  "statistical",
  "ai_generated",
  "human",
];

describe("trustFromProvenance", () => {
  it("maps every supported Provenance deterministically to one classification", () => {
    const expected: Record<Provenance, TrustClassification> = {
      measured: "measured_fact",
      deterministic: "deterministic_calculation",
      business_rule: "deterministic_calculation",
      statistical: "prediction",
      ai_generated: "ai_explanation",
      human: "human_decision",
    };

    for (const provenance of ALL_PROVENANCE) {
      expect(trustFromProvenance(provenance)).toBe(expected[provenance]);
      expect(trustFromProvenance(provenance)).toBe(trustFromProvenance(provenance));
    }
  });

  it("covers the whole Provenance union with no unmapped member", () => {
    expect(Object.keys(TRUST_BY_PROVENANCE).sort()).toEqual([...ALL_PROVENANCE].sort());
    for (const provenance of ALL_PROVENANCE) {
      expect(trustFromProvenance(provenance)).not.toBe("unknown");
    }
  });

  it("keeps a rule/threshold evaluation deterministic, not a prediction", () => {
    expect(trustFromProvenance("business_rule")).toBe("deterministic_calculation");
    expect(trustFromProvenance("statistical")).toBe("prediction");
  });

  it("fails safe to unknown for unexpected runtime input and never throws", () => {
    const unexpected: unknown[] = [
      undefined,
      null,
      "",
      "measured_fact",
      "MEASURED",
      "prediction",
      0,
      1,
      NaN,
      true,
      {},
      [],
      { provenance: "measured" },
      () => "measured",
      Symbol("measured"),
    ];

    for (const value of unexpected) {
      expect(() => trustFromProvenance(value)).not.toThrow();
      expect(trustFromProvenance(value)).toBe("unknown");
    }
  });

  it("never invents a fact-level classification for unknown input", () => {
    expect(trustFromProvenance("sensor")).not.toBe("measured_fact");
    expect(trustFromProvenance("calc")).not.toBe("deterministic_calculation");
  });

  it("does not inherit prototype keys", () => {
    expect(trustFromProvenance("toString")).toBe("unknown");
    expect(trustFromProvenance("constructor")).toBe("unknown");
  });

  it("separates prediction, AI explanation, human decision and calculation", () => {
    const classes = [
      trustFromProvenance("statistical"),
      trustFromProvenance("ai_generated"),
      trustFromProvenance("human"),
      trustFromProvenance("deterministic"),
    ];
    expect(new Set(classes).size).toBe(4);
  });
});

describe("trust mapping table", () => {
  it("is frozen so the derived mapping cannot drift at runtime", () => {
    expect(Object.isFrozen(TRUST_BY_PROVENANCE)).toBe(true);
  });
});
