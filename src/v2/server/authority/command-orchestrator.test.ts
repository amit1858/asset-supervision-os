import { describe, it, expect } from "vitest";
import { ANCHOR_NOW } from "@/data/constants";
import { makeEnvelope } from "@/v2/domain/envelope";
import type { EventActor, GovernedEvent, GovernedEventType } from "@/v2/domain";
import {
  caseAggregate,
  caseTrail,
  toPersistableEvents,
  type GovernedCase,
} from "@/v2/domain";
import { openCase, recordGovernedFact } from "@/v2/domain/governed-case";
import { orchestrateHumanDecision, orchestrateSystemFact } from "./command-orchestrator";

/**
 * Slice 2.2 — server-only command orchestration. Proves the trusted context is
 * assembled server-side (authorization descriptor from the resolver) and that
 * the browser can never supply identity: only these functions build the context.
 */

const ANCHOR = ANCHOR_NOW;
const INIT = { aggregateId: "agg-k201", assetId: "K-201" };

function factEvent(
  sequence: number,
  type: GovernedEventType,
  payload: unknown,
  actor: EventActor = { kind: "system", systemId: "engine" },
): GovernedEvent {
  return {
    eventId: `evt-${sequence}`,
    aggregateId: INIT.aggregateId,
    sequence,
    occurredAt: ANCHOR,
    asOf: ANCHOR,
    actor,
    type,
    payload,
  } as GovernedEvent;
}

function proposedCase(): GovernedCase {
  let c = openCase(INIT);
  c = orchestrateSystemFact(c, {
    systemId: "condition-feed",
    event: factEvent(
      1,
      "ConditionSignalIngested",
      { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
      { kind: "system", systemId: "condition-feed" },
    ),
    attemptedAt: ANCHOR,
    asOf: ANCHOR,
    requestId: "req-sig",
  }).case;
  c = recordGovernedFact(
    c,
    { kind: "system", systemId: "engine", attemptedAt: ANCHOR, asOf: ANCHOR, requestId: "req-assess" },
    factEvent(2, "AssessmentComputed", {
      assessmentId: "assess-1",
      assetId: "K-201",
      valueAtStake: makeEnvelope<number>({
        id: `value.k201.value-at-stake.${ANCHOR}.1620156`,
        value: 1_620_156,
        provenance: "deterministic",
        sourceMode: "local",
        freshness: "fresh",
        formulaVersion: "value-at-stake.v1",
        asOf: ANCHOR,
        capturedAt: ANCHOR,
        producedAt: ANCHOR,
        createdByEventId: "evt-seed",
      }),
    }),
  ).case;
  c = recordGovernedFact(
    c,
    { kind: "system", systemId: "engine", attemptedAt: ANCHOR, asOf: ANCHOR, requestId: "req-rec" },
    factEvent(3, "RecommendationGenerated", {
      recommendationId: "rec-1",
      assessmentId: "assess-1",
    }),
  ).case;
  return c;
}

describe("orchestrateHumanDecision", () => {
  it("assembles a trusted context and commits an RM approval", () => {
    const result = orchestrateHumanDecision(proposedCase(), {
      principalId: "p-rm",
      personaId: "reliability_manager",
      act: "approve",
      payload: { decisionId: "dec-1", recommendationId: "rec-1" },
      rationale: "Approve on evidence.",
      attemptedAt: ANCHOR,
      asOf: ANCHOR,
      requestId: "req-approve",
    });
    expect(result.outcome).toBe("committed");
    expect(caseAggregate(result.case).snapshot?.decisionStatus).toBe("pending_endorsement");

    // The authorization descriptor is server-resolved and labelled.
    const decision = caseTrail(result.case).find(
      (r) => r.action.kind === "decision" && r.result === "committed",
    );
    if (decision?.actor.kind === "human") {
      expect(decision.actor.authorization.mode).toBe("demonstration_unrestricted");
      expect(decision.actor.authorization.label.toLowerCase()).toContain("demonstration");
    } else {
      throw new Error("expected a human decision audit");
    }
  });

  it("rejects a Plant Manager approval under the workflow policy", () => {
    const result = orchestrateHumanDecision(proposedCase(), {
      principalId: "p-pm",
      personaId: "plant_manager",
      act: "approve",
      payload: { decisionId: "dec-1", recommendationId: "rec-1" },
      rationale: "PM attempts approve.",
      attemptedAt: ANCHOR,
      asOf: ANCHOR,
      requestId: "req-pm",
    });
    expect(result.outcome).toBe("rejected");
    expect(result.rejectionReason).toBe("persona_not_allowed_for_act");
  });
});

describe("orchestrateSystemFact", () => {
  it("attributes an ingested fact to the system principal", () => {
    const c = proposedCase();
    const signalFact = caseTrail(c).find((r) => r.action.kind === "fact");
    expect(signalFact?.actor.kind).toBe("system");
    expect(toPersistableEvents(caseAggregate(c)).length).toBe(3);
  });
});
