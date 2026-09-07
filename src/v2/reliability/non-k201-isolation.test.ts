import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * September 8 acceptance correction — non-K-201 route isolation.
 *
 * The K-201 Reliability experience is the only governed asset record in this
 * slice. A non-K-201 asset route must never render the K-201 experience or read
 * the K-201 governed view; it shows the honest placeholder instead. This is a
 * source invariant so the isolation cannot silently regress.
 */
describe("V2AssetScreen — non-K-201 isolation", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/v2/V2AssetScreen.tsx"),
    "utf8",
  );

  it("gates the K-201 experience behind an exact tag equality check", () => {
    expect(source).toContain("asset.tag === K201_TAG ?");
  });

  it("reads the K-201 governed view and renders its experience exactly once, only when gated", () => {
    const govReads = source.match(/getK201ReliabilityView\(/g) ?? [];
    const experiences = source.match(/<AssetReliabilityExperience\b/g) ?? [];
    expect(govReads.length).toBe(1);
    expect(experiences.length).toBe(1);
    // The single governed read sits on the K201 branch of the ternary.
    expect(source).toMatch(
      /asset\.tag === K201_TAG \?[\s\S]*?<AssetReliabilityExperience[\s\S]*?getK201ReliabilityView/,
    );
  });

  it("falls back to the honest placeholder for any other asset tag", () => {
    expect(source).toMatch(
      /asset\.tag === K201_TAG \?[\s\S]*?\) : \([\s\S]*?<V2Placeholder\b/,
    );
  });

  it("mounts the governed Case Investigator only inside the K-201 branch", () => {
    const investigators = source.match(/<K201CaseInvestigator\b/g) ?? [];
    expect(investigators.length).toBe(1);
    // The single investigator sits on the K-201 branch of the ternary, so a
    // non-K-201 asset renders no launcher and issues no agent request.
    expect(source).toMatch(
      /asset\.tag === K201_TAG \?[\s\S]*?<K201CaseInvestigator[\s\S]*?\) : \(/,
    );
  });

  it("retires the old bottom-of-page panel — one canonical investigator only", () => {
    expect(source).not.toContain("K201CasePanel");
  });
});
