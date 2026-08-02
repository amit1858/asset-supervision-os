import { describe, expect, it } from "vitest";
import { makeEnvelope, type ValueEnvelope } from "../envelope";
import {
  EXPOSURE_THRESHOLD_POLICY_VERSION,
  EXPOSURE_THRESHOLD_USD,
  requiresEndorsement,
} from "./exposure-threshold";

/**
 * Slice 2.1b — `exposure-threshold.v1`. Missing evidence is never read as zero
 * and never as "below threshold".
 */

const ANCHOR = "2026-07-27T00:00:00.000Z";

function usd(value: number): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: "env-value",
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "fresh",
    formulaVersion: "value-at-stake.v1",
    evidenceIds: ["ev-1"],
    asOf: ANCHOR,
    capturedAt: ANCHOR,
    producedAt: ANCHOR,
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
    expect(requiresEndorsement(usd(1_000_000))).toBe("required");
  });

  it("requires endorsement for the K-201 exposure of USD 1,620,156", () => {
    expect(requiresEndorsement(usd(1_620_156))).toBe("required");
  });

  it("does not require endorsement just below the threshold", () => {
    expect(requiresEndorsement(usd(999_999.99))).toBe("not_required");
  });

  it("treats an available zero as a real sub-threshold value", () => {
    expect(requiresEndorsement(usd(0))).toBe("not_required");
  });

  it("returns undeterminable — never sub-threshold — for unavailable evidence", () => {
    expect(requiresEndorsement(unavailable("historian feed offline"))).toBe(
      "undeterminable",
    );
  });

  it("returns undeterminable for an absent envelope", () => {
    expect(requiresEndorsement(null)).toBe("undeterminable");
    expect(requiresEndorsement(undefined)).toBe("undeterminable");
  });

  it("returns undeterminable for a non-finite value rather than guessing", () => {
    expect(requiresEndorsement(usd(Number.NaN))).toBe("undeterminable");
    expect(requiresEndorsement(usd(Number.POSITIVE_INFINITY))).toBe("undeterminable");
  });
});
