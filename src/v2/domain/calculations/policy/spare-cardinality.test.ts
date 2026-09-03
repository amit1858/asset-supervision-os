import { describe, expect, it } from "vitest";

import {
  CARDINALITY_EVIDENCE_MALFORMED,
  REQUIRED_SPARE_CARDINALITY_POLICY_VERSION,
  resolveRequiredSpareCardinality,
} from "./spare-cardinality";

describe("required-spare cardinality policy", () => {
  it("names and versions the governed policy", () => {
    expect(REQUIRED_SPARE_CARDINALITY_POLICY_VERSION).toBe("required-spare-cardinality.v1");
  });

  it("treats an empty list as valid with zero units", () => {
    const result = resolveRequiredSpareCardinality([]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.units).toEqual([]);
  });

  it("gives each distinct id exactly one unit", () => {
    const result = resolveRequiredSpareCardinality(["sp-brg", "sp-seal"]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.units).toEqual([
      { spareId: "sp-brg", requiredQty: 1 },
      { spareId: "sp-seal", requiredQty: 1 },
    ]);
  });

  it("rejects a duplicated id rather than manufacturing a quantity of two", () => {
    const result = resolveRequiredSpareCardinality(["sp-brg", "sp-brg"]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(CARDINALITY_EVIDENCE_MALFORMED);
  });

  it("rejects a blank / whitespace id as malformed", () => {
    for (const bad of ["", "   "]) {
      const result = resolveRequiredSpareCardinality(["sp-brg", bad]);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toBe(CARDINALITY_EVIDENCE_MALFORMED);
    }
  });

  it("rejects a non-array input", () => {
    const result = resolveRequiredSpareCardinality(
      null as unknown as readonly string[],
    );
    expect(result.ok).toBe(false);
  });
});
