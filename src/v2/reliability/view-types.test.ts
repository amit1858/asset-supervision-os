import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatUtcInstant, UNAVAILABLE_DISPLAY } from "./view-types";

/**
 * September 6–7 Reliability experience — timestamp disclosure.
 *
 * The Asset 360 header discloses two distinct governed evaluation instants: the
 * 06:00Z assessment and the 12:00Z work-readiness / turnaround records. These
 * tests pin the deterministic UTC formatter and prove the component derives each
 * displayed instant from its governed record rather than hardcoding a string.
 */
describe("formatUtcInstant", () => {
  it("renders a governed ISO instant as a deterministic UTC label", () => {
    expect(formatUtcInstant("2026-07-27T06:00:00.000Z")).toBe("27 July 2026, 06:00 UTC");
    expect(formatUtcInstant("2026-07-27T12:00:00.000Z")).toBe("27 July 2026, 12:00 UTC");
  });

  it("is a pure function of its input — a different asOf yields a different label", () => {
    const a = formatUtcInstant("2026-07-27T06:00:00.000Z");
    const b = formatUtcInstant("2026-07-27T12:00:00.000Z");
    expect(a).not.toBe(b);
    // 06:00Z and 12:00Z are visibly distinguished.
    expect(a).toContain("06:00 UTC");
    expect(b).toContain("12:00 UTC");
  });

  it("renders unavailable for a null or malformed instant, never a fabricated time", () => {
    expect(formatUtcInstant(null)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatUtcInstant("not-an-instant")).toBe(UNAVAILABLE_DISPLAY);
  });
});

describe("AssetReliabilityExperience — timestamp derivation (source invariants)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/v2/reliability/AssetReliabilityExperience.tsx"),
    "utf8",
  );

  it("derives each disclosed timestamp from its governed record field via the formatter", () => {
    expect(source).toContain("formatUtcInstant(view.evaluatedAt)");
    expect(source).toContain("evaluatedAt");
    expect(source).toContain("formatUtcInstant(view.turnaround.evaluatedAt)");
    expect(source).toContain("view.workReadiness[0]?.evaluatedAt");
  });

  it("never hardcodes a display timestamp independently of the records", () => {
    expect(source).not.toContain("06:00 UTC");
    expect(source).not.toContain("12:00 UTC");
    expect(source).not.toContain("2026-07-27T");
  });

  it("labels the three evaluation scopes distinctly", () => {
    expect(source).toContain("Assessment evaluated");
    expect(source).toContain("Work readiness evaluated");
    expect(source).toContain("Turnaround fit evaluated");
  });
});
