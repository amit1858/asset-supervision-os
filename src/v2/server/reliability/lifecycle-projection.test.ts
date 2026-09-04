import { describe, it, expect } from "vitest";
import { makeEnvelope } from "@/v2/domain/envelope";
import { buildK201Projection, K201_PROJECTION_ACTOR } from "./lifecycle-projection";

/**
 * September 6–7 Reliability experience — the deterministic K-201 projection.
 *
 * Proves the read-only projection reduces four governed FACTS to a proposed
 * decision through the real reducer, carries only SYSTEM attribution, is fully
 * deterministic, and fabricates no human decision.
 */
const EVALUATED_AT = "2026-07-27T06:00:00.000Z";

function freshExposure(value: number) {
  return makeEnvelope<number>({
    id: "env-exposure-proj",
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "fresh",
    formulaVersion: "test.v1",
    evidenceIds: ["read-1"],
    asOf: EVALUATED_AT,
    capturedAt: EVALUATED_AT,
    producedAt: EVALUATED_AT,
    createdByEventId: "asm-k201",
  });
}

describe("buildK201Projection", () => {
  const projection = buildK201Projection({
    valueAtStake: freshExposure(1620156),
    evaluatedAt: EVALUATED_AT,
    signalCapturedAt: EVALUATED_AT,
    readingIds: ["read-1"],
    runIds: ["run-1"],
  });

  it("emits exactly four governed facts in order", () => {
    expect(projection.events.map((e) => e.type)).toEqual([
      "ConditionSignalIngested",
      "ProductionObservationIngested",
      "AssessmentComputed",
      "RecommendationGenerated",
    ]);
  });

  it("reaches DECISION_PROPOSED / proposed without a fabricated human decision", () => {
    expect(projection.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(projection.snapshot.decisionStatus).toBe("proposed");
    expect(projection.stepSnapshots).toHaveLength(4);
    expect(projection.stepSnapshots[2]!.phase).toBe("RISK_ASSESSED");
  });

  it("attributes every fact to the system, never a persona or the assistant", () => {
    for (const event of projection.events) {
      expect(event.actor).toEqual(K201_PROJECTION_ACTOR);
      expect(event.actor.kind).toBe("system");
    }
  });

  it("uses injected deterministic identities (no clock, no randomness)", () => {
    expect(projection.events.map((e) => e.eventId)).toEqual([
      "proj-case-k201-1",
      "proj-case-k201-2",
      "proj-case-k201-3",
      "proj-case-k201-4",
    ]);
  });

  it("is byte-identical across builds", () => {
    const again = buildK201Projection({
      valueAtStake: freshExposure(1620156),
      evaluatedAt: EVALUATED_AT,
      signalCapturedAt: EVALUATED_AT,
      readingIds: ["read-1"],
      runIds: ["run-1"],
    });
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(projection.events));
  });
});
