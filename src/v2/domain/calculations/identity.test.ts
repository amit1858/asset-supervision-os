import { describe, it, expect } from "vitest";
import {
  calculationIdOf,
  canonicalKey,
  ledgerScopeKeyOf,
  outputEnvelopeIdOf,
  proposedAssessmentIdOf,
  requestIdOf,
  slotKey,
  subjectKey,
} from "./identity";
import type { CalculationSubject, LedgerScope } from "./subject";

const CASE: CalculationSubject = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: "asset-k201",
};

describe("canonical key encoding", () => {
  it("is deterministic for identical input", () => {
    expect(canonicalKey("s", ["a", "b"])).toBe(canonicalKey("s", ["a", "b"]));
  });

  it("length-prefixes every component including the scheme", () => {
    expect(canonicalKey("s", ["ab"])).toBe("1:s,2:ab,");
  });

  it("is injective across delimiter-colliding component splits", () => {
    // Naive joining on ":" or "," would collapse each of these pairs.
    expect(canonicalKey("s", ["a:b", "c"])).not.toBe(canonicalKey("s", ["a", "b:c"]));
    expect(canonicalKey("s", ["a,b", "c"])).not.toBe(canonicalKey("s", ["a", "b,c"]));
    expect(canonicalKey("s", ["a|b", "c"])).not.toBe(canonicalKey("s", ["a", "b|c"]));
    expect(canonicalKey("s", ["a", "b"])).not.toBe(canonicalKey("s", ["ab"]));
  });

  it("survives empty, whitespace, newline and unicode components", () => {
    const keys = [
      canonicalKey("s", ["", "ab"]),
      canonicalKey("s", ["a", "b"]),
      canonicalKey("s", ["ab", ""]),
      canonicalKey("s", ["a\nb"]),
      canonicalKey("s", ["a b"]),
      canonicalKey("s", ["añ"]),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("separates schemes that share component content", () => {
    expect(canonicalKey("subject", ["x"])).not.toBe(canonicalKey("slot", ["x"]));
  });

  it("rejects a non-string component and an empty scheme", () => {
    expect(() => canonicalKey("s", [1 as unknown as string])).toThrow(TypeError);
    expect(() => canonicalKey("", ["a"])).toThrow(TypeError);
    expect(() => canonicalKey("   ", ["a"])).toThrow(TypeError);
  });
});

describe("subject, scope and slot identity", () => {
  it("distinguishes subject kinds that share an identifier", () => {
    const a = subjectKey({ kind: "recommendation", recommendationId: "x", assetId: "asset-k201" });
    const b = subjectKey({ kind: "work_order", workOrderId: "x", assetId: "asset-k201" });
    expect(a).not.toBe(b);
  });

  it("distinguishes a case subject from a ledger scope with the same identity", () => {
    const scope: LedgerScope = { kind: "supervision_case", caseId: "case-k201", assetId: "asset-k201" };
    expect(subjectKey(CASE)).not.toBe(ledgerScopeKeyOf(scope));
  });

  it("throws when a subject identity component is blank", () => {
    expect(() =>
      subjectKey({ kind: "supervision_case", caseId: " ", assetId: "asset-k201" }),
    ).toThrow(TypeError);
  });

  it("binds a slot to kind plus subject, not to the triggering event", () => {
    const slotA = slotKey("asset_assessment", CASE);
    const slotB = slotKey("realised_value", CASE);
    expect(slotA).not.toBe(slotB);
    expect(slotKey("asset_assessment", CASE)).toBe(slotA);
  });
});

describe("request and calculation identity", () => {
  it("derives a request id from kind, subject and triggering event only", () => {
    const first = requestIdOf("asset_assessment", CASE, "evt-1");
    const second = requestIdOf("asset_assessment", CASE, "evt-1");
    expect(first).toBe(second);
    expect(requestIdOf("asset_assessment", CASE, "evt-2")).not.toBe(first);
  });

  it("does not include asOf, so the same trigger yields one request identity", () => {
    // asOf is bound to the governed request, so it can never be a second
    // identity axis; a differing asOf is a conflict, not a new question.
    const id = requestIdOf("asset_assessment", CASE, "evt-1");
    expect(id.includes("2026")).toBe(false);
  });

  it("changes the calculation id when the formula set version changes", () => {
    const requestId = requestIdOf("asset_assessment", CASE, "evt-1");
    expect(calculationIdOf(requestId, "asset-assessment.v1")).not.toBe(
      calculationIdOf(requestId, "asset-assessment.v2"),
    );
  });

  it("rejects blank request ids and formula set versions", () => {
    expect(() => requestIdOf("asset_assessment", CASE, "  ")).toThrow(TypeError);
    expect(() => calculationIdOf("", "v1")).toThrow(TypeError);
    expect(() => calculationIdOf("r", " ")).toThrow(TypeError);
  });

  it("derives envelope and proposed-assessment identity from the calculation", () => {
    const calculationId = calculationIdOf(
      requestIdOf("asset_assessment", CASE, "evt-1"),
      "asset-assessment.v1",
    );
    expect(outputEnvelopeIdOf(calculationId, "riskScore")).not.toBe(
      outputEnvelopeIdOf(calculationId, "healthScore"),
    );
    expect(proposedAssessmentIdOf(calculationId)).toBe(
      proposedAssessmentIdOf(calculationId),
    );
    expect(proposedAssessmentIdOf(calculationId)).not.toBe(calculationId);
  });
});
