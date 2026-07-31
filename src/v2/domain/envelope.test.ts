import { describe, it, expect } from "vitest";
import { makeEnvelope, supersede, markUnavailable, isAvailable } from "./envelope";
import type { ValueEnvelope } from "./envelope";
import * as envelopeModule from "./envelope";
import { resolveFreshness } from "./freshness-state";
import { ANCHOR_NOW } from "@/data/constants";

/**
 * Slice 2.1a — technical plan §12.3c. The envelope is immutable, derives trust
 * internally, and never represents an absent value as 0.
 */

const PRODUCED_AT = "2026-07-27T00:00:00.000Z";
const CAPTURED_AT = "2026-07-26T23:50:00.000Z";

function baseEnvelope(): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: "value.k201.deterministic-risk@1",
    value: 68,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: resolveFreshness({
      sourceKey: "historian",
      capturedAt: CAPTURED_AT,
      asOf: ANCHOR_NOW,
    }),
    formulaVersion: "risk@v1",
    evidenceIds: ["measurement-1", "measurement-2"],
    asOf: ANCHOR_NOW,
    capturedAt: CAPTURED_AT,
    producedAt: PRODUCED_AT,
    createdByEventId: "evt-assessment-computed-1",
  });
}

describe("makeEnvelope", () => {
  it("creates version 1 with no predecessor and the supplied governed fields", () => {
    const envelope = baseEnvelope();

    expect(envelope.id).toBe("value.k201.deterministic-risk@1");
    expect(envelope.version).toBe(1);
    expect(envelope.supersedesId).toBeNull();
    expect(envelope.status).toBe("available");
    expect(envelope.value).toBe(68);
    expect(envelope.sourceMode).toBe("local");
    expect(envelope.freshness).toBe("fresh");
    expect(envelope.formulaVersion).toBe("risk@v1");
    expect(envelope.evidenceIds).toEqual(["measurement-1", "measurement-2"]);
    expect(envelope.asOf).toBe(ANCHOR_NOW);
    expect(envelope.capturedAt).toBe(CAPTURED_AT);
    expect(envelope.producedAt).toBe(PRODUCED_AT);
    expect(envelope.createdByEventId).toBe("evt-assessment-computed-1");
  });

  it("carries no integrationState field on the envelope contract", () => {
    const envelope = baseEnvelope();
    expect(Object.prototype.hasOwnProperty.call(envelope, "integrationState")).toBe(false);
    expect(Object.keys(envelope)).not.toContain("integrationState");
  });

  it("exposes only the approved public helpers", () => {
    expect(Object.keys(envelopeModule).sort()).toEqual([
      "isAvailable",
      "makeEnvelope",
      "markUnavailable",
      "supersede",
    ]);
    expect(Object.keys(envelopeModule)).not.toContain("markSuperseded");
  });

  it("carries sourceMode and freshness as separate axes; neither is synthetic", () => {
    const envelope = baseEnvelope();
    expect(envelope.sourceMode).toBe("local");
    expect(envelope.freshness).not.toBe("synthetic");
    expect(envelope.sourceMode).not.toBe("synthetic");
  });

  it("returns a frozen envelope with a defensively copied, frozen evidence list", () => {
    const evidenceIds = ["measurement-1"];
    const envelope = makeEnvelope<number>({
      id: "value.k201.health@1",
      value: 52,
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "health@v1",
      evidenceIds,
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });

    evidenceIds.push("measurement-injected");
    expect(envelope.evidenceIds).toEqual(["measurement-1"]);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.evidenceIds)).toBe(true);
  });

  it("defaults capturedAt and evidenceIds honestly when not supplied", () => {
    const envelope = makeEnvelope<number>({
      id: "value.k201.oee@1",
      value: 91.2,
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "oee@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });

    expect(envelope.capturedAt).toBeNull();
    expect(envelope.evidenceIds).toEqual([]);
  });
});

describe("derived trust cannot be contradicted", () => {
  it("derives trustClassification from provenance", () => {
    expect(baseEnvelope().trustClassification).toBe("deterministic_calculation");

    const predicted = makeEnvelope<number>({
      id: "value.k201.ttc-days@1",
      value: 17.93,
      provenance: "statistical",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "ttc@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });
    expect(predicted.trustClassification).toBe("prediction");

    const decided = makeEnvelope<string>({
      id: "value.k201.decision@1",
      value: "approved",
      provenance: "human",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "decision@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-decision-recorded-1",
    });
    expect(decided.trustClassification).toBe("human_decision");
    expect(predicted.trustClassification).not.toBe(decided.trustClassification);
  });

  it("rejects a caller-supplied trustClassification at compile time", () => {
    makeEnvelope<number>({
      id: "value.k201.spoof@1",
      value: 68,
      provenance: "ai_generated",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "risk@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
      // @ts-expect-error trustClassification is derived and is not an input.
      trustClassification: "measured_fact",
    });

    const prev = baseEnvelope();
    supersede<number>(prev, {
      id: "value.k201.spoof@2",
      value: 70,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
      // @ts-expect-error trustClassification is derived and is not an input.
      trustClassification: "measured_fact",
    });
  });

  it("ignores a smuggled trustClassification at runtime", () => {
    const smuggled = {
      id: "value.k201.spoof@1",
      value: 68,
      provenance: "ai_generated",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "risk@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
      trustClassification: "measured_fact",
    } as unknown as Parameters<typeof makeEnvelope<number>>[0];

    const envelope = makeEnvelope<number>(smuggled);
    expect(envelope.trustClassification).toBe("ai_explanation");
    expect(envelope.trustClassification).not.toBe("measured_fact");
  });

  it("recomputes trust when supersede changes provenance", () => {
    const v1 = baseEnvelope();
    const v2 = supersede<number>(v1, {
      id: "value.k201.deterministic-risk@2",
      value: 70,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
      provenance: "statistical",
    });

    expect(v1.trustClassification).toBe("deterministic_calculation");
    expect(v2.trustClassification).toBe("prediction");
  });

  it("maps unknown runtime provenance to unknown without throwing", () => {
    const rogue = {
      id: "value.k201.rogue@1",
      value: 1,
      provenance: "vibes",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "x@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    } as unknown as Parameters<typeof makeEnvelope<number>>[0];

    let envelope: ValueEnvelope<number> | undefined;
    expect(() => {
      envelope = makeEnvelope<number>(rogue);
    }).not.toThrow();
    expect(envelope?.trustClassification).toBe("unknown");
  });

  it("stores no trust value that can disagree with its provenance", () => {
    const cases = [
      baseEnvelope(),
      supersede<number>(baseEnvelope(), {
        id: "value.k201.deterministic-risk@2",
        value: 70,
        producedAt: PRODUCED_AT,
        createdByEventId: "evt-2",
        provenance: "ai_generated",
      }),
      markUnavailable(baseEnvelope(), "evidence missing", {
        id: "value.k201.deterministic-risk@3",
        createdByEventId: "evt-3",
        producedAt: PRODUCED_AT,
      }),
    ];

    const expected: Record<string, string> = {
      deterministic: "deterministic_calculation",
      ai_generated: "ai_explanation",
    };
    for (const envelope of cases) {
      expect(envelope.trustClassification).toBe(expected[envelope.provenance]);
    }
  });
});

describe("supersession", () => {
  it("creates a new identity, increments version and records supersedesId", () => {
    const v1 = baseEnvelope();
    const v2 = supersede<number>(v1, {
      id: "value.k201.deterministic-risk@2",
      value: 74,
      producedAt: "2026-07-27T01:00:00.000Z",
      createdByEventId: "evt-new-measurement-1",
      capturedAt: "2026-07-27T00:55:00.000Z",
    });

    expect(v2).not.toBe(v1);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.value).toBe(74);
    expect(v2.createdByEventId).toBe("evt-new-measurement-1");
  });

  it("leaves the prior envelope byte-for-byte unchanged", () => {
    const v1 = baseEnvelope();
    const snapshot = JSON.stringify(v1);

    supersede<number>(v1, {
      id: "value.k201.deterministic-risk@2",
      value: 74,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
    });

    expect(JSON.stringify(v1)).toBe(snapshot);
    expect(v1.version).toBe(1);
    expect(v1.value).toBe(68);
    expect(v1.supersedesId).toBeNull();
  });

  it("offers no way to stamp a superseded status back onto history", () => {
    const v1 = baseEnvelope();
    expect(envelopeModule).not.toHaveProperty("markSuperseded");
    // Successorship is expressed forwards only, via the successor's supersedesId.
    expect(Object.keys(v1)).not.toContain("supersededByEventId");
  });

  it("chains identities monotonically across versions", () => {
    const v1 = baseEnvelope();
    const v2 = supersede<number>(v1, {
      id: "risk@2",
      value: 70,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
    });
    const v3 = supersede<number>(v2, {
      id: "risk@3",
      value: 72,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-3",
    });

    expect([v1.version, v2.version, v3.version]).toEqual([1, 2, 3]);
    expect([v1.supersedesId, v2.supersedesId, v3.supersedesId]).toEqual([
      null,
      v1.id,
      v2.id,
    ]);
    expect([v1.value, v2.value, v3.value]).toEqual([68, 70, 72]);
  });

  it("carries forward unchanged axes", () => {
    const v1 = baseEnvelope();
    const v2 = supersede<number>(v1, {
      id: "risk@2",
      value: 70,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
    });

    expect(v2.sourceMode).toBe(v1.sourceMode);
    expect(v2.formulaVersion).toBe(v1.formulaVersion);
    expect(v2.evidenceIds).toEqual(v1.evidenceIds);
    expect(v2.asOf).toBe(v1.asOf);
    expect(v2.capturedAt).toBe(v1.capturedAt);
  });

  it("supports a formula version bump without losing history", () => {
    const v1 = baseEnvelope();
    const v2 = supersede<number>(v1, {
      id: "risk@2",
      value: 69,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-version-bump",
      formulaVersion: "risk@v2",
    });

    expect(v1.formulaVersion).toBe("risk@v1");
    expect(v2.formulaVersion).toBe("risk@v2");
    expect(v1.value).toBe(68);
  });

  it("cannot be mutated in place", () => {
    const v1 = baseEnvelope();
    expect(() => {
      (v1 as { version: number }).version = 99;
    }).toThrow();
    expect(v1.version).toBe(1);
  });
});

describe("availability contract", () => {
  it("requires a non-empty reason for an unavailable value", () => {
    const v1 = baseEnvelope();

    for (const reason of ["", "   ", "\n"]) {
      expect(() =>
        markUnavailable(v1, reason, {
          id: "risk@2",
          createdByEventId: "evt-2",
          producedAt: PRODUCED_AT,
        }),
      ).toThrow(TypeError);
    }

    expect(() =>
      makeEnvelope<number>({
        id: "risk@1",
        value: null,
        unavailableReason: "  ",
        provenance: "deterministic",
        sourceMode: "local",
        freshness: "missing",
        formulaVersion: "risk@v1",
        asOf: ANCHOR_NOW,
        producedAt: PRODUCED_AT,
        createdByEventId: "evt-1",
      }),
    ).toThrow(TypeError);
  });

  it("sets value to null — never 0 — when unavailable", () => {
    const v1 = baseEnvelope();
    const v2 = markUnavailable(v1, "no fresh measurement in window", {
      id: "risk@2",
      createdByEventId: "evt-evidence-unavailable-1",
      producedAt: "2026-07-27T02:00:00.000Z",
      freshness: "missing",
      capturedAt: null,
    });

    expect(v2.status).toBe("unavailable");
    expect(v2.value).toBeNull();
    expect(v2.value).not.toBe(0);
    expect(v2.unavailableReason).toBe("no fresh measurement in window");
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.freshness).toBe("missing");
    expect(v2.capturedAt).toBeNull();
    expect(isAvailable(v2)).toBe(false);
  });

  it("keeps numeric zero a legitimate available value", () => {
    const zero = makeEnvelope<number>({
      id: "value.k201.realised@1",
      value: 0,
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "realised-value@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });

    expect(zero.status).toBe("available");
    expect(zero.value).toBe(0);
    expect(isAvailable(zero)).toBe(true);
    expect(zero.unavailableReason).toBeUndefined();
  });

  it("never lets an available value carry an unavailable reason", () => {
    const available = baseEnvelope();
    expect(available.unavailableReason).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(available, "unavailableReason")).toBe(
      false,
    );

    // @ts-expect-error an available envelope cannot carry an unavailable reason.
    makeEnvelope<number>({
      id: "risk@1",
      value: 68,
      unavailableReason: "should not compile",
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "risk@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });
  });

  it("requires a reason when superseding into an unavailable state", () => {
    const v1 = baseEnvelope();

    // Compile-time and runtime both reject it.
    expect(() =>
      // @ts-expect-error a null value requires an unavailableReason.
      supersede<number>(v1, {
        id: "risk@2",
        value: null,
        producedAt: PRODUCED_AT,
        createdByEventId: "evt-2",
      }),
    ).toThrow(TypeError);

    const v2 = supersede<number>(v1, {
      id: "risk@2",
      value: null,
      unavailableReason: "recompute failed; last good value retained upstream",
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-2",
    });
    expect(v2.status).toBe("unavailable");
    expect(v1.status).toBe("available");
    expect(v1.value).toBe(68);
  });

  it("narrows the value type through isAvailable", () => {
    const envelope = baseEnvelope();
    expect(isAvailable(envelope)).toBe(true);
    if (isAvailable(envelope)) {
      expect(envelope.value + 1).toBe(69);
    }
  });
});

describe("immutability guarantee and its limits", () => {
  it("freezes the envelope and its evidence list", () => {
    const envelope = baseEnvelope();
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.evidenceIds)).toBe(true);
    expect(() => {
      (envelope.evidenceIds as string[]).push("injected");
    }).toThrow();
  });

  it("does not freeze or clone a caller-owned object payload (documented limit)", () => {
    const payload = { risk: 68, notes: ["initial"] };
    const envelope = makeEnvelope<{ risk: number; notes: string[] }>({
      id: "value.k201.payload@1",
      value: payload,
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "risk@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-1",
    });

    // The payload stays caller-owned and mutable: deep immutability of T is not
    // claimed, and the envelope never freezes or mutates what it was given.
    expect(Object.isFrozen(payload)).toBe(false);
    expect(() => {
      payload.notes.push("mutated by caller");
    }).not.toThrow();
    expect(isAvailable(envelope) && envelope.value.notes).toEqual([
      "initial",
      "mutated by caller",
    ]);
  });
});

describe("value separation", () => {
  it("keeps value at stake, projected value and realised value as separate envelopes", () => {
    const valueAtStake = makeEnvelope<number>({
      id: "value.k201.value-at-stake@1",
      value: 1_620_156,
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "value-at-stake@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-assessment-computed-1",
    });

    const projectedValue = makeEnvelope<number>({
      id: "value.k201.projected-value-enabled@1",
      value: 1_094_400,
      provenance: "statistical",
      sourceMode: "local",
      freshness: "fresh",
      formulaVersion: "projected-value-enabled@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-decision-recorded-1",
    });

    const realisedValue = makeEnvelope<number>({
      id: "value.k201.realised-value@1",
      value: null,
      unavailableReason: "no confirmed outcome yet",
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "missing",
      formulaVersion: "realised-value@v1",
      asOf: ANCHOR_NOW,
      producedAt: PRODUCED_AT,
      createdByEventId: "evt-execution-recorded-1",
    });

    expect(new Set([valueAtStake.id, projectedValue.id, realisedValue.id]).size).toBe(3);
    expect(valueAtStake.trustClassification).toBe("deterministic_calculation");
    expect(projectedValue.trustClassification).toBe("prediction");
    expect(realisedValue.status).toBe("unavailable");
    expect(realisedValue.value).toBeNull();
    // The withdrawn $1,458,140 figure appears nowhere.
    expect([valueAtStake.value, projectedValue.value, realisedValue.value]).not.toContain(
      1_458_140,
    );
  });
});
