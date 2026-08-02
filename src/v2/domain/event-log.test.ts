import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ANCHOR_NOW } from "@/data/constants";
import { makeEnvelope, type ValueEnvelope } from "./envelope";
import {
  GOVERNED_EVENT_TYPES,
  prepareEvent,
  type EventActor,
  type GovernedEvent,
  type GovernedEventType,
} from "./events";
import {
  appendEvent,
  createAggregate,
  GovernedIntegrityError,
  replay,
  toPersistableEvents,
  type GovernedAggregate,
} from "./event-log";
import * as eventLogModule from "./event-log";

/**
 * Slice 2.1b — the governed append boundary: runtime integrity, deterministic
 * header validation, duplicate semantics, append-only history and replay.
 */

const ANCHOR = ANCHOR_NOW;
const LATER = "2026-07-28T00:00:00.000Z";
const ENGINEER: EventActor = { kind: "persona", personaId: "reliability_engineer" };
const MANAGER: EventActor = { kind: "persona", personaId: "maintenance_planner" };
const PLANT_MANAGER: EventActor = { kind: "persona", personaId: "plant_manager" };
const FEED: EventActor = { kind: "system", systemId: "condition-feed" };
const ASSISTANT: EventActor = { kind: "assistant", assistantId: "copilot" };

const INIT = { aggregateId: "agg-k201", assetId: "K-201" };

function envelope(value: number, asOf: string = ANCHOR): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: `value.k201.value-at-stake.${asOf}.${value}`,
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "fresh",
    formulaVersion: "value-at-stake.v1",
    asOf,
    capturedAt: asOf,
    producedAt: asOf,
    createdByEventId: "evt-seed",
  });
}

function make(
  sequence: number,
  type: GovernedEventType,
  payload: unknown,
  overrides: Partial<GovernedEvent> = {},
): GovernedEvent {
  return {
    eventId: `evt-${sequence}`,
    aggregateId: INIT.aggregateId,
    sequence,
    occurredAt: ANCHOR,
    asOf: ANCHOR,
    actor: ENGINEER,
    type,
    payload,
    ...overrides,
  } as GovernedEvent;
}

/** The full governed K-201 history: signal → realised value. */
function k201History(): GovernedEvent[] {
  return [
    make(
      1,
      "ConditionSignalIngested",
      { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
      { actor: FEED },
    ),
    make(2, "AssessmentComputed", {
      assessmentId: "assess-1",
      assetId: "K-201",
      valueAtStake: envelope(1_620_156),
    }),
    make(3, "RecommendationGenerated", {
      recommendationId: "rec-1",
      assessmentId: "assess-1",
    }),
    make(
      4,
      "DecisionApproved",
      { decisionId: "dec-1", recommendationId: "rec-1" },
      { actor: MANAGER },
    ),
    make(
      5,
      "EndorsementGranted",
      { endorsementId: "end-1", decisionId: "dec-1", approvalEventId: "evt-4" },
      { actor: PLANT_MANAGER },
    ),
    make(6, "WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" }),
    make(7, "MaterialsChecked", {
      checkId: "chk-1",
      workOrderId: "wo-1",
      partIds: ["p-1", "p-2"],
    }),
    make(8, "TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
    make(
      9,
      "WorkExecuted",
      { executionId: "exec-1", workOrderId: "wo-1" },
      { actor: MANAGER },
    ),
    make(10, "OutcomeEvidenceRecorded", {
      evidenceRecordId: "ev-1",
      executionId: "exec-1",
      evidenceIds: ["e-1", "e-2"],
    }),
    make(
      11,
      "OutcomeConfirmed",
      { outcomeId: "out-1", evidenceRecordId: "ev-1" },
      { actor: MANAGER },
    ),
    make(
      12,
      "RealisedValueRecorded",
      { outcomeId: "out-1", realisedValue: envelope(1_094_400) },
      { actor: MANAGER },
    ),
  ];
}

function accepted(aggregate: GovernedAggregate, event: GovernedEvent): GovernedAggregate {
  const result = appendEvent(aggregate, event);
  if (result.outcome !== "accepted") {
    throw new Error(`expected acceptance, received ${result.outcome}: ${result.reason}`);
  }
  return result.aggregate;
}

function seeded(count: number): GovernedAggregate {
  let aggregate = createAggregate(INIT);
  for (const event of k201History().slice(0, count)) {
    aggregate = accepted(aggregate, event);
  }
  return aggregate;
}

// ---------------------------------------------------------------------------

describe("runtime integrity", () => {
  it("never exports the private brands", () => {
    const symbols = Object.getOwnPropertySymbols(eventLogModule).filter(
      (symbol) => symbol.description?.includes("governed") ?? false,
    );
    expect(symbols).toHaveLength(0);
    expect(Object.keys(eventLogModule)).not.toContain("ACCEPTED");
    expect(Object.keys(eventLogModule)).not.toContain("AGGREGATE");
  });

  it("fails closed on a forged aggregate", () => {
    const forged = {
      aggregateId: INIT.aggregateId,
      assetId: INIT.assetId,
      events: [],
      snapshot: null,
    };
    expect(() =>
      // @ts-expect-error a caller cannot construct a valid aggregate.
      appendEvent(forged, k201History()[0] as GovernedEvent),
    ).toThrow(GovernedIntegrityError);
    // @ts-expect-error same forged value through the serialization helper.
    expect(() => toPersistableEvents(forged)).toThrow(GovernedIntegrityError);
  });

  it("requires a non-empty aggregateId and assetId", () => {
    expect(() => createAggregate({ aggregateId: " ", assetId: "K-201" })).toThrow(TypeError);
    expect(() => createAggregate({ aggregateId: "agg", assetId: "" })).toThrow(TypeError);
  });
});

describe("append-only history", () => {
  it("accepts the full governed K-201 history", () => {
    const aggregate = seeded(12);
    expect(aggregate.events).toHaveLength(12);
    expect(aggregate.snapshot?.phase).toBe("VALUE_VALIDATION_PENDING");
    expect(aggregate.snapshot?.currentOutcomeId).toBe("out-1");
  });

  it("returns a new aggregate and leaves the previous one untouched", () => {
    const before = seeded(2);
    const after = accepted(before, k201History()[2] as GovernedEvent);
    expect(before.events).toHaveLength(2);
    expect(after.events).toHaveLength(3);
    expect(after).not.toBe(before);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.events)).toBe(true);
  });

  it("owns its accepted records defensively", () => {
    const mutable = make(
      1,
      "ConditionSignalIngested",
      { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
      { actor: FEED },
    );
    const aggregate = accepted(createAggregate(INIT), mutable);
    (mutable.payload as unknown as { readingIds: string[] }).readingIds.push("r-tampered");
    const stored = aggregate.events[0]?.event.payload as unknown as {
      readingIds: readonly string[];
    };
    expect(stored.readingIds).toEqual(["r-1"]);
  });

  it("preserves earlier events and snapshots when a later append is rejected", () => {
    const aggregate = seeded(3);
    const before = JSON.stringify(toPersistableEvents(aggregate));
    const snapshotBefore = JSON.stringify(aggregate.snapshot);
    const result = appendEvent(
      aggregate,
      make(4, "WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" }),
    );
    expect(result.outcome).toBe("rejected");
    expect(result.aggregate).toBe(aggregate);
    expect(JSON.stringify(toPersistableEvents(aggregate))).toBe(before);
    expect(JSON.stringify(aggregate.snapshot)).toBe(snapshotBefore);
  });
});

describe("actor enforcement", () => {
  /** One well-formed payload per governed event type. */
  const payloadByType: Record<GovernedEventType, unknown> = {
    ConditionSignalIngested: {
      signalId: "sig-1",
      assetId: "K-201",
      capturedAt: ANCHOR,
      readingIds: ["r-1"],
    },
    ProductionObservationIngested: {
      observationId: "obs-1",
      assetId: "K-201",
      runIds: ["run-1"],
    },
    AssessmentComputed: {
      assessmentId: "assess-1",
      assetId: "K-201",
      valueAtStake: envelope(1_620_156),
    },
    RecommendationGenerated: { recommendationId: "rec-1", assessmentId: "assess-1" },
    DecisionApproved: { decisionId: "dec-1", recommendationId: "rec-1" },
    DecisionRejected: { decisionId: "dec-1", recommendationId: "rec-1" },
    EndorsementGranted: {
      endorsementId: "end-1",
      decisionId: "dec-1",
      approvalEventId: "evt-4",
    },
    EndorsementDeclined: {
      endorsementId: "end-1",
      decisionId: "dec-1",
      approvalEventId: "evt-4",
    },
    WorkOrderPlanned: { workOrderId: "wo-1", decisionId: "dec-1" },
    MaterialsChecked: { checkId: "chk-1", workOrderId: "wo-1", partIds: ["p-1"] },
    TurnaroundScopeRetained: { scopeId: "scope-1", workOrderId: "wo-1" },
    SpeedReductionExecuted: { actionId: "act-1", assetId: "K-201", reductionPct: 20 },
    WorkExecuted: { executionId: "exec-1", workOrderId: "wo-1" },
    OutcomeEvidenceRecorded: {
      evidenceRecordId: "ev-1",
      executionId: "exec-1",
      evidenceIds: ["e-1"],
    },
    OutcomeConfirmed: { outcomeId: "out-1", evidenceRecordId: "ev-1" },
    RealisedValueRecorded: { outcomeId: "out-1", realisedValue: envelope(1_094_400) },
  };

  it("rejects the assistant as author of all sixteen governed event types", () => {
    expect(GOVERNED_EVENT_TYPES).toHaveLength(16);
    const aggregate = seeded(3);
    const before = JSON.stringify(toPersistableEvents(aggregate));
    const snapshotBefore = JSON.stringify(aggregate.snapshot);

    for (const type of GOVERNED_EVENT_TYPES) {
      const result = appendEvent(
        aggregate,
        make(4, type, payloadByType[type], { actor: ASSISTANT }),
      );
      expect(result.outcome, type).toBe("rejected");
      if (result.outcome !== "rejected") continue;
      expect(result.reason, type).toBe("actor_not_permitted");
      // Identical aggregate reference, nothing appended, no recompute request.
      expect(result.aggregate, type).toBe(aggregate);
      expect(result.aggregate.events, type).toHaveLength(3);
      expect(result, type).not.toHaveProperty("recomputeRequests");
    }

    expect(JSON.stringify(toPersistableEvents(aggregate))).toBe(before);
    expect(JSON.stringify(aggregate.snapshot)).toBe(snapshotBefore);
  });

  it("refuses the assistant before identity, ordering or transition checks", () => {
    const aggregate = seeded(3);
    // Every other header field is invalid too; the actor rule still wins.
    const result = appendEvent(
      aggregate,
      make(99, "WorkExecuted", { executionId: "", workOrderId: "" }, {
        actor: ASSISTANT,
        eventId: "  ",
        occurredAt: "not-a-timestamp",
      }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") expect(result.reason).toBe("actor_not_permitted");
  });

  it("refuses an assistant retransmission of an already accepted event", () => {
    const aggregate = seeded(3);
    const replayed = { ...(k201History()[1] as GovernedEvent), actor: ASSISTANT };
    const result = appendEvent(aggregate, replayed as GovernedEvent);
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") expect(result.reason).toBe("actor_not_permitted");
  });

  it("cannot append an assistant-prepared draft", () => {
    const prepared = prepareEvent(
      {
        aggregateId: INIT.aggregateId,
        occurredAt: ANCHOR,
        asOf: ANCHOR,
        type: "ConditionSignalIngested",
        payload: {
          signalId: "sig-1",
          assetId: "K-201",
          capturedAt: ANCHOR,
          readingIds: [],
        },
      },
      "Prepared for a human to record.",
    );
    const aggregate = createAggregate(INIT);
    // @ts-expect-error a ProposedEvent is structurally not a GovernedEvent.
    const result = appendEvent(aggregate, prepared.proposed);
    expect(result.outcome).toBe("rejected");
    // It carries no actor, no eventId and no sequence, so it fails at the very
    // first structural gate and can never become history.
    if (result.outcome === "rejected") expect(result.reason).toBe("malformed_event");
    expect(aggregate.events).toHaveLength(0);
  });

  it("lets a persona or system actor reach the boundary", () => {
    expect(
      appendEvent(
        createAggregate(INIT),
        make(
          1,
          "ConditionSignalIngested",
          { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: [] },
          { actor: FEED },
        ),
      ).outcome,
    ).toBe("accepted");
  });

  it("rejects a malformed or incomplete actor", () => {
    const bad = appendEvent(
      createAggregate(INIT),
      make(
        1,
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "K-201", capturedAt: null, readingIds: [] },
        { actor: { kind: "persona", personaId: "" } as unknown as EventActor },
      ),
    );
    expect(bad.outcome).toBe("rejected");
    const unknown = appendEvent(
      createAggregate(INIT),
      make(
        1,
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "K-201", capturedAt: null, readingIds: [] },
        { actor: { kind: "robot" } as unknown as EventActor },
      ),
    );
    expect(unknown.outcome).toBe("rejected");
    if (unknown.outcome === "rejected") expect(unknown.reason).toBe("malformed_event");
  });
});

describe("no client-asserted authority", () => {
  const SOURCES = [
    "lifecycle.ts",
    "events.ts",
    "rejection.ts",
    "recompute.ts",
    "reducer.ts",
    "event-log.ts",
    "policy/exposure-threshold.ts",
  ];

  it("declares no capability, role or authority field anywhere in Slice 2.1b", () => {
    const banned = [
      "Capability",
      "capabilit",
      "role",
      "canApprove",
      "authority",
      "decidedBy",
      "endorsedBy",
      "recordedBy",
    ];
    for (const file of SOURCES) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const token of banned) {
        expect(source, `${file} must not mention ${token}`).not.toContain(token);
      }
    }
  });

  it("imports nothing from the persona capability or registry modules", () => {
    for (const file of SOURCES) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toContain("personas/capabilities");
      expect(source, file).not.toContain("personas/registry");
    }
  });
});

describe("deterministic header validation", () => {
  const cases: Array<[string, Partial<GovernedEvent>, string]> = [
    ["empty eventId", { eventId: "  " }, "invalid_event_id"],
    ["empty aggregateId", { aggregateId: " " }, "invalid_aggregate_id"],
    ["foreign aggregateId", { aggregateId: "agg-other" }, "aggregate_mismatch"],
    ["zero sequence", { sequence: 0, eventId: "evt-z" }, "invalid_sequence"],
    ["fractional sequence", { sequence: 1.5, eventId: "evt-f" }, "invalid_sequence"],
    ["gap in sequence", { sequence: 5, eventId: "evt-g" }, "non_contiguous_sequence"],
    [
      "non-canonical occurredAt",
      { occurredAt: "2026-07-27T00:00:00Z", eventId: "evt-t1" },
      "invalid_timestamp",
    ],
    [
      "impossible date",
      { occurredAt: "2026-02-30T00:00:00.000Z", eventId: "evt-t2" },
      "invalid_timestamp",
    ],
    [
      "non-canonical asOf",
      { asOf: "2026-07-27", eventId: "evt-t3" },
      "invalid_timestamp",
    ],
    [
      "occurredAt after asOf",
      { occurredAt: LATER, eventId: "evt-t4" },
      "occurred_at_after_as_of",
    ],
  ];

  for (const [label, overrides, reason] of cases) {
    it(`rejects ${label} with ${reason}`, () => {
      const aggregate = createAggregate(INIT);
      const result = appendEvent(
        aggregate,
        make(
          1,
          "ConditionSignalIngested",
          { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: [] },
          { actor: FEED, ...overrides },
        ),
      );
      expect(result.outcome).toBe("rejected");
      if (result.outcome === "rejected") expect(result.reason).toBe(reason);
    });
  }

  it("rejects an asOf that regresses below the last accepted event", () => {
    let aggregate = createAggregate(INIT);
    aggregate = accepted(
      aggregate,
      make(
        1,
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "K-201", capturedAt: LATER, readingIds: [] },
        { actor: FEED, occurredAt: LATER, asOf: LATER },
      ),
    );
    const result = appendEvent(
      aggregate,
      make(2, "AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: envelope(1_620_156),
      }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") expect(result.reason).toBe("as_of_regression");
  });

  it("allows a late-arriving occurredAt older than a prior event", () => {
    let aggregate = createAggregate(INIT);
    aggregate = accepted(
      aggregate,
      make(
        1,
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "K-201", capturedAt: LATER, readingIds: [] },
        { actor: FEED, occurredAt: LATER, asOf: LATER },
      ),
    );
    const result = appendEvent(
      aggregate,
      make(
        2,
        "ConditionSignalIngested",
        { signalId: "sig-2", assetId: "K-201", capturedAt: ANCHOR, readingIds: [] },
        { actor: FEED, occurredAt: ANCHOR, asOf: LATER },
      ),
    );
    expect(result.outcome).toBe("accepted");
  });

  it("rejects an unknown event type and a non-object payload", () => {
    const aggregate = createAggregate(INIT);
    const unknown = appendEvent(
      aggregate,
      make(1, "NotAnEvent" as GovernedEventType, {}, { actor: FEED }),
    );
    expect(unknown.outcome).toBe("rejected");
    if (unknown.outcome === "rejected") expect(unknown.reason).toBe("malformed_event");

    const badPayload = appendEvent(
      aggregate,
      make(1, "ConditionSignalIngested", null, { actor: FEED }),
    );
    expect(badPayload.outcome).toBe("rejected");
    if (badPayload.outcome === "rejected") expect(badPayload.reason).toBe("malformed_event");
  });

  it("rejects an empty identity field in the payload", () => {
    const result = appendEvent(
      createAggregate(INIT),
      make(
        1,
        "ConditionSignalIngested",
        { signalId: "  ", assetId: "K-201", capturedAt: null, readingIds: [] },
        { actor: FEED },
      ),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") expect(result.reason).toBe("invalid_payload");
  });
});

describe("envelope consistency", () => {
  it("requires the assessment envelope asOf to equal event.asOf", () => {
    const aggregate = seeded(1);
    const result = appendEvent(
      aggregate,
      make(2, "AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: envelope(1_620_156, LATER),
      }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.reason).toBe("envelope_as_of_mismatch");
    }
  });

  it("rejects a value that is not a governed envelope", () => {
    const aggregate = seeded(1);
    const result = appendEvent(
      aggregate,
      make(2, "AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: { value: 1_620_156 },
      }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") expect(result.reason).toBe("invalid_envelope");
  });

  it("never treats an unavailable envelope as zero", () => {
    const aggregate = seeded(1);
    const unavailable = makeEnvelope<number>({
      id: "value.k201.value-at-stake.missing",
      value: null,
      unavailableReason: "Exposure inputs are not available.",
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "missing",
      formulaVersion: "value-at-stake.v1",
      asOf: ANCHOR,
      capturedAt: null,
      producedAt: ANCHOR,
      createdByEventId: "evt-seed",
    });
    const next = accepted(
      aggregate,
      make(2, "AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: unavailable,
      }),
    );
    expect(next.snapshot?.valueAtStake).toBeNull();
    expect(next.snapshot?.assessmentEvidenceQuality).toBe("unavailable");
    expect(next.snapshot?.phase).toBe("SIGNAL_DETECTED");
  });
});

describe("duplicate semantics", () => {
  it("ignores a live retransmission without appending", () => {
    const aggregate = seeded(2);
    const result = appendEvent(aggregate, k201History()[1] as GovernedEvent);
    expect(result.outcome).toBe("ignored");
    if (result.outcome === "ignored") {
      expect(result.reason).toBe("duplicate_ignored");
      expect(result.aggregate).toBe(aggregate);
      expect(result.aggregate.events).toHaveLength(2);
    }
  });

  it("checks duplicates before sequence so a retransmission is never a gap", () => {
    const aggregate = seeded(2);
    const result = appendEvent(aggregate, k201History()[0] as GovernedEvent);
    expect(result.outcome).toBe("ignored");
  });

  it("treats a duplicate inside persisted history as corruption", () => {
    const history = k201History().slice(0, 3);
    const corrupted = [...history, history[1] as GovernedEvent];
    const result = replay(INIT, corrupted);
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.reason).toBe("duplicate_in_replay");
      expect(result.index).toBe(3);
    }
  });
});

describe("replay", () => {
  it("rebuilds a byte-identical aggregate from persisted events", () => {
    const live = seeded(12);
    const persisted = toPersistableEvents(live);
    const first = replay(INIT, persisted);
    const second = replay(INIT, persisted);
    expect(first.outcome).toBe("replayed");
    expect(second.outcome).toBe("replayed");
    if (first.outcome !== "replayed" || second.outcome !== "replayed") return;

    expect(JSON.stringify(first.aggregate.snapshot)).toBe(
      JSON.stringify(live.snapshot),
    );
    expect(JSON.stringify(toPersistableEvents(first.aggregate))).toBe(
      JSON.stringify(toPersistableEvents(second.aggregate)),
    );
    expect(JSON.stringify(first.recomputeRequests)).toBe(
      JSON.stringify(second.recomputeRequests),
    );
  });

  it("fails closed at the first mismatched reference and returns its index", () => {
    const history = k201History();
    (history[6] as { payload: { workOrderId: string } }).payload = {
      ...(history[6] as { payload: { workOrderId: string } }).payload,
      workOrderId: "wo-other",
    };
    const result = replay(INIT, history);
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.reason).toBe("subject_reference_mismatch");
      expect(result.index).toBe(6);
    }
  });

  it("fails closed on an out-of-order history", () => {
    const history = k201History().slice(0, 4);
    const swapped = [history[0], history[2], history[1], history[3]] as GovernedEvent[];
    const result = replay(INIT, swapped);
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.reason).toBe("non_contiguous_sequence");
      expect(result.index).toBe(1);
    }
  });

  it("fails closed on a missing sequence", () => {
    const history = k201History().slice(0, 4);
    const missing = [history[0], history[1], history[3]] as GovernedEvent[];
    const result = replay(INIT, missing);
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.reason).toBe("non_contiguous_sequence");
      expect(result.index).toBe(2);
    }
  });
});

describe("toPersistableEvents", () => {
  it("returns plain, serializable records without the private brands", () => {
    const persisted = toPersistableEvents(seeded(3));
    for (const event of persisted) {
      expect(Object.getOwnPropertySymbols(event)).toHaveLength(0);
    }
    expect(() => JSON.stringify(persisted)).not.toThrow();
    const roundTripped = JSON.parse(JSON.stringify(persisted)) as GovernedEvent[];
    expect(roundTripped).toHaveLength(3);
    const rebuilt = replay(INIT, roundTripped);
    expect(rebuilt.outcome).toBe("replayed");
  });

  it("is defensively owned — mutating the result cannot alter the aggregate", () => {
    const aggregate = seeded(7);
    const before = JSON.stringify(toPersistableEvents(aggregate));

    const persisted = toPersistableEvents(aggregate) as GovernedEvent[];
    persisted.push(persisted[0] as GovernedEvent);
    persisted.length = 3;
    (persisted[0] as { eventId: string }).eventId = "tampered";
    const nested = persisted[6] ?? persisted[persisted.length - 1];
    const payload = (persisted[2] as unknown as { payload: Record<string, unknown> })
      .payload;
    payload.workOrderId = "tampered";
    const materials = toPersistableEvents(aggregate)[6] as GovernedEvent;
    (materials.payload as unknown as { partIds: string[] }).partIds.push("tampered");
    expect(nested).toBeDefined();

    expect(JSON.stringify(toPersistableEvents(aggregate))).toBe(before);
    expect(aggregate.events).toHaveLength(7);
    expect(aggregate.events[0]?.event.eventId).toBe("evt-1");
    const storedMaterials = aggregate.events[6]?.event.payload as unknown as {
      partIds: string[];
    };
    expect(storedMaterials.partIds).toEqual(["p-1", "p-2"]);
  });
});

describe("no clock, no randomness", () => {
  it("contains no Date.now, new Date() or Math.random in the 2.1b sources", () => {
    const files = [
      "lifecycle.ts",
      "events.ts",
      "rejection.ts",
      "recompute.ts",
      "reducer.ts",
      "event-log.ts",
      "policy/exposure-threshold.ts",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source, file).not.toContain("Date.now(");
      expect(source, file).not.toContain("Math.random(");
      expect(source, file).not.toContain("new Date()");
      expect(source, file).not.toContain("performance.now(");
    }
  });
});
