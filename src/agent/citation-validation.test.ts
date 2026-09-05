import { describe, it, expect } from "vitest";
import { validateProviderDraft, extractSignificantNumbers } from "./citation-validation";
import type { Citation, ProviderDraft } from "./types";

function citation(id: string, value: string): Citation {
  return {
    id,
    label: id,
    value,
    provenance: "deterministic",
    sourceType: "governed_metric",
    sourceId: null,
    observedAt: null,
    toolName: "get_reliability_assessment",
  };
}

const CITATIONS: Citation[] = [
  citation("m-exposure", "$1,620,156"),
  citation("m-health", "52"),
];

function draft(claim: Partial<ProviderDraft["claims"][number]>): ProviderDraft {
  return {
    situationSummary: "K-201 is under a governed review.",
    claims: [
      {
        id: "c1",
        text: "Health scores 52.",
        kind: "reliability",
        citationIds: ["m-health"],
        ...claim,
      },
    ],
  };
}

describe("citation validation — the governance guarantee", () => {
  it("accepts a fully grounded draft", () => {
    expect(validateProviderDraft(draft({}), CITATIONS).valid).toBe(true);
  });

  it("rejects a claim citing an unknown evidence id", () => {
    const res = validateProviderDraft(draft({ citationIds: ["m-ghost"] }), CITATIONS);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toContain("unknown evidence id");
  });

  it("rejects an ungrounded number not present in any cited value", () => {
    const res = validateProviderDraft(
      draft({ text: "Exposure is $9,999,999.", citationIds: ["m-exposure"] }),
      CITATIONS,
    );
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toContain("unsupported number");
  });

  it("accepts a number that matches a cited value regardless of comma/spacing", () => {
    expect(
      validateProviderDraft(
        draft({ text: "Decision exposure of $1,620,156 is at risk.", citationIds: ["m-exposure"] }),
        CITATIONS,
      ).valid,
    ).toBe(true);
  });

  it("rejects any self-action / mutation language", () => {
    expect(
      validateProviderDraft(draft({ text: "I approved the work." }), CITATIONS).valid,
    ).toBe(false);
    expect(
      validateProviderDraft(
        { situationSummary: "Click to approve now.", claims: draft({}).claims },
        CITATIONS,
      ).valid,
    ).toBe(false);
  });

  it("rejects a claim that cites no evidence", () => {
    expect(validateProviderDraft(draft({ citationIds: [] }), CITATIONS).valid).toBe(false);
  });

  it("does not flag asset tags or formula versions as numbers", () => {
    expect(extractSignificantNumbers("K-201 uses value-at-stake.v1 on HDS-2 (wo-1).")).toEqual([]);
    expect(
      validateProviderDraft(
        draft({ text: "K-201 health is 52.", citationIds: ["m-health"] }),
        CITATIONS,
      ).valid,
    ).toBe(true);
  });
});
