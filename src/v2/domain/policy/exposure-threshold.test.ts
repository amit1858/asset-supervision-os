import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeEnvelope, type ValueEnvelope } from "../envelope";
import type { FreshnessState } from "../freshness-state";
import {
  EXPOSURE_THRESHOLD_POLICY_VERSION,
  EXPOSURE_THRESHOLD_USD,
  isPolicyResolvable,
  POLICY_RESOLUTION_VERSION,
  requiresEndorsement,
} from "./exposure-threshold";

/**
 * Slice 2.1b — `exposure-threshold.v1`. Missing evidence is never read as zero
 * and never as "below threshold".
 */

const ANCHOR = "2026-07-27T00:00:00.000Z";
const LATER = "2026-07-28T00:00:00.000Z";

function usd(
  value: number,
  freshness: FreshnessState = "fresh",
  asOf: string = ANCHOR,
): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: "env-value",
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness,
    formulaVersion: "value-at-stake.v1",
    evidenceIds: ["ev-1"],
    asOf,
    capturedAt: asOf,
    producedAt: asOf,
    createdByEventId: "evt-1",
  });
}

function unavailable(reason: string): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: "env-missing",
    value: null,
    unavailableReason: reason,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "missing",
    formulaVersion: "value-at-stake.v1",
    evidenceIds: [],
    asOf: ANCHOR,
    capturedAt: null,
    producedAt: ANCHOR,
    createdByEventId: "evt-1",
  });
}

describe("exposure-threshold.v1", () => {
  it("is a named, versioned policy at exactly USD 1,000,000", () => {
    expect(EXPOSURE_THRESHOLD_POLICY_VERSION).toBe("exposure-threshold.v1");
    expect(EXPOSURE_THRESHOLD_USD).toBe(1_000_000);
  });

  it("requires endorsement at exactly USD 1,000,000", () => {
    expect(requiresEndorsement(usd(1_000_000), ANCHOR)).toBe("required");
  });

  it("requires endorsement for the K-201 exposure of USD 1,620,156", () => {
    expect(requiresEndorsement(usd(1_620_156), ANCHOR)).toBe("required");
  });

  it("does not require endorsement just below the threshold", () => {
    expect(requiresEndorsement(usd(999_999.99), ANCHOR)).toBe("not_required");
  });

  it("treats an available zero as a real sub-threshold value", () => {
    expect(requiresEndorsement(usd(0), ANCHOR)).toBe("not_required");
  });

  it("returns undeterminable — never sub-threshold — for unavailable evidence", () => {
    expect(requiresEndorsement(unavailable("historian feed offline"), ANCHOR)).toBe(
      "undeterminable",
    );
  });

  it("returns undeterminable for an absent envelope", () => {
    expect(requiresEndorsement(null, ANCHOR)).toBe("undeterminable");
    expect(requiresEndorsement(undefined, ANCHOR)).toBe("undeterminable");
  });

  it("returns undeterminable for a non-finite value rather than guessing", () => {
    expect(requiresEndorsement(usd(Number.NaN), ANCHOR)).toBe("undeterminable");
    expect(requiresEndorsement(usd(Number.POSITIVE_INFINITY), ANCHOR)).toBe("undeterminable");
  });
});

describe("policy-resolution.v1", () => {
  it("is a named, versioned rule", () => {
    expect(POLICY_RESOLUTION_VERSION).toBe("policy-resolution.v1");
  });

  it("resolves only when available, fresh and evaluated at the governing instant", () => {
    expect(isPolicyResolvable(usd(1_620_156, "fresh", ANCHOR), ANCHOR)).toBe(true);
  });

  it("does not resolve an absent envelope reaching the policy", () => {
    // The signature is non-nullable, so absence is handled at the policy edge.
    expect(requiresEndorsement(null, ANCHOR)).toBe("undeterminable");
    expect(requiresEndorsement(undefined, ANCHOR)).toBe("undeterminable");
  });

  it("treats an available zero as resolvable when fresh and as-of aligned", () => {
    expect(isPolicyResolvable(usd(0, "fresh", ANCHOR), ANCHOR)).toBe(true);
    expect(requiresEndorsement(usd(0, "fresh", ANCHOR), ANCHOR)).toBe("not_required");
  });

  it("does not resolve on an unavailable envelope", () => {
    expect(isPolicyResolvable(unavailable("historian feed offline"), ANCHOR)).toBe(false);
  });

  it("does not resolve on stale, unknown or missing freshness", () => {
    for (const freshness of ["stale", "unknown", "missing"] as const) {
      expect(isPolicyResolvable(usd(1_620_156, freshness, ANCHOR), ANCHOR)).toBe(false);
    }
  });

  it("does not resolve when the envelope was evaluated at another instant", () => {
    expect(isPolicyResolvable(usd(1_620_156, "fresh", LATER), ANCHOR)).toBe(false);
    expect(isPolicyResolvable(usd(1_620_156, "fresh", ANCHOR), LATER)).toBe(false);
  });

  it("requires an exact asOf match, not a prefix or a later instant", () => {
    const nearly = "2026-07-27T00:00:00.001Z";
    expect(isPolicyResolvable(usd(1_620_156, "fresh", ANCHOR), nearly)).toBe(false);
  });

  it("does not resolve a stale available zero", () => {
    // Zero is a real value, but staleness still blocks resolution.
    expect(isPolicyResolvable(usd(0, "stale", ANCHOR), ANCHOR)).toBe(false);
    expect(requiresEndorsement(usd(0, "stale", ANCHOR), ANCHOR)).toBe("undeterminable");
  });

  it("each of the three conditions fails independently", () => {
    expect(isPolicyResolvable(unavailable("x"), ANCHOR)).toBe(false);
    expect(isPolicyResolvable(usd(1_620_156, "stale", ANCHOR), ANCHOR)).toBe(false);
    expect(isPolicyResolvable(usd(1_620_156, "fresh", LATER), ANCHOR)).toBe(false);
    expect(isPolicyResolvable(usd(1_620_156, "fresh", ANCHOR), ANCHOR)).toBe(true);
  });
});

describe("exposure-threshold.v1 routed through policy-resolution.v1", () => {
  it("is undeterminable — never sub-threshold — for stale exposure", () => {
    expect(requiresEndorsement(usd(1_620_156, "stale", ANCHOR), ANCHOR)).toBe(
      "undeterminable",
    );
  });

  it("is undeterminable for stale exposure below the threshold too", () => {
    expect(requiresEndorsement(usd(10, "stale", ANCHOR), ANCHOR)).toBe("undeterminable");
  });

  it("is undeterminable when the exposure was evaluated at another instant", () => {
    expect(requiresEndorsement(usd(1_620_156, "fresh", ANCHOR), LATER)).toBe(
      "undeterminable",
    );
  });

  it("reads no clock: the caller must state the instant it decides at", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/v2/domain/policy/exposure-threshold.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const banned of ["Date.now", "new Date", "Math.random", "performance.now"]) {
      expect(source.includes(banned)).toBe(false);
    }
  });
});
