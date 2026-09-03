import { describe, expect, it } from "vitest";
import {
  ENVELOPE_FIELD_BY_TYPE,
  GOVERNED_EVENT_TYPES,
  PAYLOAD_IDENTITY_FIELDS,
  prepareEvent,
  type EventActor,
  type GovernedEventType,
  type ProposedEvent,
} from "./events";

/**
 * Slice 2.1b — the event catalogue is closed, past-tense and command-free, and
 * the assistant boundary is inert.
 */

const ANCHOR = "2026-07-27T00:00:00.000Z";

function proposedSignal(): ProposedEvent {
  return {
    aggregateId: "agg-1",
    occurredAt: ANCHOR,
    asOf: ANCHOR,
    type: "ConditionSignalIngested",
    payload: {
      signalId: "sig-1",
      assetId: "K-201",
      capturedAt: ANCHOR,
      readingIds: ["r-1"],
    },
  };
}

describe("GovernedEventType", () => {
  it("declares exactly the seventeen approved events", () => {
    expect(GOVERNED_EVENT_TYPES).toHaveLength(17);
    expect(new Set(GOVERNED_EVENT_TYPES).size).toBe(17);
  });

  it("declares DecisionReturned as the return-for-rework event", () => {
    expect(GOVERNED_EVENT_TYPES).toContain("DecisionReturned");
  });

  it("does not declare EvidenceUnavailableRecorded", () => {
    expect(GOVERNED_EVENT_TYPES).not.toContain(
      "EvidenceUnavailableRecorded" as GovernedEventType,
    );
  });

  it("contains no command / request events", () => {
    for (const type of GOVERNED_EVENT_TYPES) {
      expect(type.endsWith("Requested")).toBe(false);
    }
  });

  it("drops the redundant signal events in favour of ConditionSignalIngested", () => {
    expect(GOVERNED_EVENT_TYPES).toContain("ConditionSignalIngested");
    expect(GOVERNED_EVENT_TYPES).not.toContain("SignalIngested" as GovernedEventType);
    expect(GOVERNED_EVENT_TYPES).not.toContain(
      "NewMeasurementIngested" as GovernedEventType,
    );
  });

  it("keeps production observation separate from condition signals", () => {
    expect(GOVERNED_EVENT_TYPES).toContain("ProductionObservationIngested");
  });

  it("does not add a RecommendationRevised event — recovery reuses generation", () => {
    expect(GOVERNED_EVENT_TYPES).not.toContain(
      "RecommendationRevised" as GovernedEventType,
    );
  });

  it("splits outcome evidence from outcome confirmation", () => {
    expect(GOVERNED_EVENT_TYPES).toContain("OutcomeEvidenceRecorded");
    expect(GOVERNED_EVENT_TYPES).toContain("OutcomeConfirmed");
  });

  it("keeps approval, rejection, endorsement and decline as four distinct acts", () => {
    expect(GOVERNED_EVENT_TYPES).toContain("DecisionApproved");
    expect(GOVERNED_EVENT_TYPES).toContain("DecisionRejected");
    expect(GOVERNED_EVENT_TYPES).toContain("EndorsementGranted");
    expect(GOVERNED_EVENT_TYPES).toContain("EndorsementDeclined");
  });
});

describe("payload metadata", () => {
  it("declares identity fields for every event type", () => {
    for (const type of GOVERNED_EVENT_TYPES) {
      expect(PAYLOAD_IDENTITY_FIELDS[type].length).toBeGreaterThan(0);
    }
  });

  it("declares an envelope field only for the two value-bearing events", () => {
    expect(Object.keys(ENVELOPE_FIELD_BY_TYPE).sort()).toEqual([
      "AssessmentComputed",
      "RealisedValueRecorded",
    ]);
  });

  it("does not let a recommendation carry a projected value", () => {
    expect(ENVELOPE_FIELD_BY_TYPE.RecommendationGenerated).toBeUndefined();
    expect(PAYLOAD_IDENTITY_FIELDS.RecommendationGenerated).toEqual([
      "recommendationId",
      "assessmentId",
    ]);
  });

  it("requires both endorsement events to reference the approval event", () => {
    expect(PAYLOAD_IDENTITY_FIELDS.EndorsementGranted).toContain("approvalEventId");
    expect(PAYLOAD_IDENTITY_FIELDS.EndorsementDeclined).toContain("approvalEventId");
  });

  it("freezes its lookup tables", () => {
    expect(Object.isFrozen(GOVERNED_EVENT_TYPES)).toBe(true);
    expect(Object.isFrozen(PAYLOAD_IDENTITY_FIELDS)).toBe(true);
    expect(Object.isFrozen(ENVELOPE_FIELD_BY_TYPE)).toBe(true);
  });
});

describe("EventActor", () => {
  it("is a persona / system / assistant discriminated union", () => {
    const persona: EventActor = { kind: "persona", personaId: "maintenance_planner" };
    const system: EventActor = { kind: "system", systemId: "condition-feed" };
    const assistant: EventActor = { kind: "assistant", assistantId: "copilot" };
    expect([persona.kind, system.kind, assistant.kind]).toEqual([
      "persona",
      "system",
      "assistant",
    ]);
    expect(persona).toEqual({ kind: "persona", personaId: "maintenance_planner" });
  });

  it("carries a persona identity but never a role or any asserted authority", () => {
    const persona = { kind: "persona", personaId: "plant_manager" } as const;
    expect(Object.keys(persona)).toEqual(["kind", "personaId"]);
    // @ts-expect-error identity is not authorization: role is not part of the union.
    const withRole: EventActor = { kind: "persona", personaId: "plant_manager", role: "x" };
    expect(withRole.kind).toBe("persona");
  });

  it("only accepts a known PersonaId", () => {
    // @ts-expect-error an arbitrary string is not a governed persona identity.
    const bogus: EventActor = { kind: "persona", personaId: "not_a_persona" };
    expect(bogus.kind).toBe("persona");
  });
});

describe("assistant boundary", () => {
  it("produces an inert prepared draft that is not an accepted event", () => {
    const prepared = prepareEvent(proposedSignal(), "Vibration trend exceeds the alarm band.");
    expect(prepared.preparedBy).toBe("assistant");
    expect(prepared.proposed.type).toBe("ConditionSignalIngested");
    expect(Object.isFrozen(prepared)).toBe(true);
    // No acceptance brand of any kind is reachable from a prepared event.
    expect(Object.getOwnPropertySymbols(prepared)).toHaveLength(0);
  });

  it("keeps the draft structurally short of a governed event", () => {
    const prepared = prepareEvent(proposedSignal(), "Prepared for a human to record.");
    // Governed identity and ordering are minted only by the recording actor.
    expect(prepared.proposed).not.toHaveProperty("eventId");
    expect(prepared.proposed).not.toHaveProperty("sequence");
    expect(prepared.proposed).not.toHaveProperty("actor");
  });

  it("exposes no promotion helper that would let the assistant append", async () => {
    const eventsModule = await import("./events");
    expect(eventsModule).not.toHaveProperty("confirmPreparedEvent");
    expect(eventsModule).not.toHaveProperty("promotePreparedEvent");
    expect(eventsModule).not.toHaveProperty("toGovernedEvent");
    const logModule = await import("./event-log");
    expect(logModule).not.toHaveProperty("confirmPreparedEvent");
    expect(logModule).not.toHaveProperty("promotePreparedEvent");
  });
});
