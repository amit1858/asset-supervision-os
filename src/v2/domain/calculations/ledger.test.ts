import { describe, it, expect } from "vitest";
import { GovernedIntegrityError } from "../event-log";
import { makeEnvelope, type ValueEnvelope } from "../envelope";
import { findFormulaSet } from "./formula";
import { calculationIdOf, ledgerScopeKeyOf, requestIdOf, slotKey } from "./identity";
import { makeReferencedOnlyInputSnapshot } from "./inputs";
import {
  appendCalculation,
  createLedger,
  isCalculationLedger,
  latestAttempt,
  latestProduced,
  replayCalculations,
  toPersistableCalculations,
  type CalculationLedger,
} from "./ledger";
import type { CalculationOutputField, CalculationRecord } from "./record";
import type { CalculationSubject, LedgerScope } from "./subject";

const AS_OF = "2026-07-27T00:00:00.000Z";
const LATER = "2026-07-28T00:00:00.000Z";
const CASE: CalculationSubject = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: "asset-k201",
};
const SCOPE: LedgerScope = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: "asset-k201",
};
const REC: CalculationSubject = {
  kind: "recommendation",
  recommendationId: "rec-k201",
  assetId: "asset-k201",
};

const INPUTS = makeReferencedOnlyInputSnapshot({
  limitation: "Sensor readings are referenced, not retained.",
  reproductionRequires: "The seeded dataset at the same anchor.",
  references: [{ kind: "asset", id: "asset-k201", description: "K-201" }],
});

function envelopeFor(
  name: string,
  value: number | null,
  provenance: string,
  formulaVersion: string,
  asOf: string,
): ValueEnvelope<number> {
  const base = {
    id: `env-${name}-${asOf}`,
    provenance: provenance as never,
    sourceMode: "local" as const,
    freshness: "fresh" as const,
    formulaVersion,
    evidenceIds: ["sensor-k201-vibration"],
    asOf,
    producedAt: asOf,
    createdByEventId: "evt-x",
  };
  return value === null
    ? makeEnvelope<number>({ ...base, value: null, unavailableReason: "no_engine_data" })
    : makeEnvelope<number>({ ...base, value });
}

function fieldsFor(
  kind: "asset_assessment" | "decision_projected_value",
  version: string,
  asOf: string,
  available: boolean,
): CalculationOutputField[] {
  const set =
    findFormulaSet(kind, version) ??
    findFormulaSet(
      kind,
      kind === "asset_assessment" ? "asset-assessment.v1" : "projected-value.v1",
    )!;
  return set.fields.map((definition) => ({
    name: definition.name,
    formula: definition.formula,
    valueStatus: available ? definition.valueStatus : null,
    envelope: envelopeFor(
      definition.name,
      available ? 100 : null,
      definition.provenance,
      definition.formula.version,
      asOf,
    ),
  }));
}

interface Build {
  kind?: "asset_assessment" | "decision_projected_value";
  subject?: CalculationSubject;
  eventId?: string;
  eventType?: string;
  asOf?: string;
  sequence?: number;
  version?: string;
  outcome?: "produced" | "unavailable" | "failed";
  supersedes?: string | null;
  scope?: LedgerScope;
}

function build(init: Build = {}): CalculationRecord {
  const kind = init.kind ?? "asset_assessment";
  const subject = init.subject ?? (kind === "asset_assessment" ? CASE : REC);
  const eventId = init.eventId ?? "evt-1";
  const eventType =
    init.eventType ?? (kind === "asset_assessment" ? "ConditionSignalIngested" : "DecisionApproved");
  const asOf = init.asOf ?? AS_OF;
  const version =
    init.version ?? (kind === "asset_assessment" ? "asset-assessment.v1" : "projected-value.v1");
  const outcome = init.outcome ?? "produced";
  const requestId = requestIdOf(kind, subject, eventId);

  const output =
    outcome === "failed"
      ? { outcome: "failed" as const, failureReason: "engine_execution_failed", detail: "boom" }
      : outcome === "unavailable"
        ? {
            outcome: "unavailable" as const,
            unavailableReason: "no_engine_data",
            fields: fieldsFor(kind, version, asOf, false),
          }
        : { outcome: "produced" as const, fields: fieldsFor(kind, version, asOf, true) };

  return {
    calculationId: calculationIdOf(requestId, version),
    requestId,
    slot: slotKey(kind, subject),
    ledgerScopeKey: ledgerScopeKeyOf(init.scope ?? SCOPE),
    subject,
    sequence: init.sequence ?? 1,
    kind,
    requestedByEventId: eventId,
    requestedByEventType: eventType as never,
    asOf,
    formulaSetVersion: version,
    inputs: INPUTS,
    output,
    supersedesCalculationId: init.supersedes ?? null,
  };
}

function accept(ledger: CalculationLedger, record: CalculationRecord): CalculationLedger {
  const result = appendCalculation(ledger, record);
  if (result.outcome !== "accepted") {
    throw new Error(`expected acceptance, got ${result.outcome}: ${result.detail}`);
  }
  return result.ledger;
}

describe("ledger creation and integrity branding", () => {
  it("starts empty with both head maps empty", () => {
    const ledger = createLedger(SCOPE);
    expect(ledger.records).toHaveLength(0);
    expect(ledger.latestAttemptBySlot).toEqual({});
    expect(ledger.latestProducedBySlot).toEqual({});
    expect(isCalculationLedger(ledger)).toBe(true);
  });

  it("refuses a scope with a blank identity component", () => {
    expect(() => createLedger({ kind: "portfolio", portfolioId: " " })).toThrow(TypeError);
    expect(() => createLedger(null as never)).toThrow(TypeError);
  });

  it("throws GovernedIntegrityError on a forged ledger literal", () => {
    const forged = { scope: SCOPE, records: [], latestAttemptBySlot: {}, latestProducedBySlot: {} };
    expect(() => appendCalculation(forged as never, build())).toThrow(GovernedIntegrityError);
    expect(() => toPersistableCalculations(forged as never)).toThrow(GovernedIntegrityError);
    expect(isCalculationLedger(forged)).toBe(false);
  });

  it("reuses the event log's integrity error class rather than a parallel one", () => {
    try {
      appendCalculation({} as never, build());
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GovernedIntegrityError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("freezes the ledger and its records", () => {
    const ledger = accept(createLedger(SCOPE), build());
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger.records)).toBe(true);
    expect(Object.isFrozen(ledger.records[0]?.record)).toBe(true);
    expect(Object.isFrozen(ledger.latestProducedBySlot)).toBe(true);
  });
});

describe("append admissibility", () => {
  it("accepts a well-formed produced calculation and advances both heads", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const slot = slotKey("asset_assessment", CASE);
    expect(ledger.records).toHaveLength(1);
    expect(ledger.latestAttemptBySlot[slot]).toBe(ledger.records[0]?.record.calculationId);
    expect(ledger.latestProducedBySlot[slot]).toBe(ledger.records[0]?.record.calculationId);
  });

  it("rejects an event type that cannot emit the request kind", () => {
    const result = appendCalculation(
      createLedger(SCOPE),
      build({ eventType: "OutcomeConfirmed" }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("recompute_trigger_mismatch");
  });

  it("rejects an unknown calculation kind", () => {
    const record = { ...build(), kind: "guesswork" } as unknown as CalculationRecord;
    const result = appendCalculation(createLedger(SCOPE), record);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("unknown_calculation_kind");
  });

  it("rejects a subject of the wrong kind for the request", () => {
    const subject: CalculationSubject = {
      kind: "recommendation",
      recommendationId: "rec-k201",
      assetId: "asset-k201",
    };
    const result = appendCalculation(createLedger(SCOPE), build({ subject }));
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("calculation_subject_kind_mismatch");
  });

  it("rejects a subject with a blank identity component", () => {
    const record = {
      ...build(),
      subject: { kind: "supervision_case", caseId: " ", assetId: "asset-k201" },
    } as CalculationRecord;
    const result = appendCalculation(createLedger(SCOPE), record);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("missing_subject_identity");
  });

  it("rejects a subject that belongs to another scope", () => {
    const subject: CalculationSubject = {
      kind: "supervision_case",
      caseId: "case-other",
      assetId: "asset-k201",
    };
    const result = appendCalculation(createLedger(SCOPE), build({ subject }));
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("subject_out_of_ledger_scope");
  });

  it("rejects a mismatched ledgerScopeKey even when the subject is admissible", () => {
    const record = build({ scope: { kind: "portfolio", portfolioId: "plant-1" } });
    const result = appendCalculation(createLedger(SCOPE), record);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("subject_out_of_ledger_scope");
  });

  it("rejects forged request, slot and calculation identities", () => {
    for (const key of ["requestId", "slot", "calculationId"] as const) {
      const result = appendCalculation(
        createLedger(SCOPE),
        { ...build(), [key]: "forged" } as CalculationRecord,
      );
      expect(result.outcome, key).toBe("rejected");
      if (result.outcome !== "rejected") throw new Error("unreachable");
      expect(result.reason, key).toBe("calculation_identity_mismatch");
    }
  });

  it("rejects a non-contiguous sequence", () => {
    const result = appendCalculation(createLedger(SCOPE), build({ sequence: 2 }));
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("non_contiguous_sequence");
  });

  it("rejects an asOf that regresses below the previous record", () => {
    const ledger = accept(createLedger(SCOPE), build({ asOf: LATER }));
    const result = appendCalculation(
      ledger,
      build({ kind: "decision_projected_value", eventId: "evt-2", asOf: AS_OF, sequence: 2 }),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("calculation_as_of_regression");
  });

  it("returns the identical ledger reference on every rejection", () => {
    const ledger = createLedger(SCOPE);
    const result = appendCalculation(ledger, build({ sequence: 9 }));
    expect(result.ledger).toBe(ledger);
    expect(result.proposedEvents).toEqual([]);
  });
});

describe("idempotency and request identity conflict", () => {
  it("ignores an identical retransmission without appending", () => {
    const first = accept(createLedger(SCOPE), build());
    const result = appendCalculation(first, build({ sequence: 2 }));
    expect(result.outcome).toBe("ignored");
    if (result.outcome !== "ignored") throw new Error("unreachable");
    expect(result.reason).toBe("duplicate_calculation_ignored");
    expect(result.ledger).toBe(first);
    expect(result.ledger.records).toHaveLength(1);
  });

  it("treats the same trigger evaluated at a different asOf as an identity conflict", () => {
    const first = accept(createLedger(SCOPE), build());
    const result = appendCalculation(first, build({ asOf: LATER, sequence: 2 }));
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("calculation_request_identity_conflict");
    expect(result.ledger.records).toHaveLength(1);
  });

  it("does not treat a different formula set version as a duplicate", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const other = build({ version: "asset-assessment.v2", sequence: 2 });
    const result = appendCalculation(ledger, other);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    // A distinct calculationId, refused because that formula set is not governed.
    expect(result.reason).toBe("formula_set_not_registered");
  });
});

describe("supersession and the two heads", () => {
  it("requires a produced result to supersede exactly the current produced head", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const head = ledger.records[0]!.record.calculationId;

    const wrong = appendCalculation(
      ledger,
      build({ eventId: "evt-2", sequence: 2, supersedes: null }),
    );
    expect(wrong.outcome).toBe("rejected");
    if (wrong.outcome !== "rejected") throw new Error("unreachable");
    expect(wrong.reason).toBe("invalid_supersession");

    const right = accept(
      ledger,
      build({ eventId: "evt-2", sequence: 2, supersedes: head }),
    );
    const slot = slotKey("asset_assessment", CASE);
    expect(right.latestProducedBySlot[slot]).not.toBe(head);
    expect(right.records).toHaveLength(2);
    expect(right.records[0]!.record.calculationId).toBe(head);
  });

  it("refuses a supersession pointer on an unavailable or failed attempt", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const head = ledger.records[0]!.record.calculationId;
    for (const outcome of ["unavailable", "failed"] as const) {
      const result = appendCalculation(
        ledger,
        build({ eventId: "evt-2", sequence: 2, outcome, supersedes: head }),
      );
      expect(result.outcome, outcome).toBe("rejected");
      if (result.outcome !== "rejected") throw new Error("unreachable");
      expect(result.reason, outcome).toBe("invalid_supersession");
    }
  });

  it("never lets an unavailable attempt displace a good produced value", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = accept(createLedger(SCOPE), build());
    const head = first.latestProducedBySlot[slot];
    const after = accept(first, build({ eventId: "evt-2", sequence: 2, outcome: "unavailable" }));

    expect(after.latestProducedBySlot[slot]).toBe(head);
    expect(after.latestAttemptBySlot[slot]).not.toBe(head);
    expect(latestProduced(after, slot)?.output.outcome).toBe("produced");
    expect(latestAttempt(after, slot)?.output.outcome).toBe("unavailable");
  });

  it("never lets a failed attempt displace a good produced value", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = accept(createLedger(SCOPE), build());
    const head = first.latestProducedBySlot[slot];
    const after = accept(first, build({ eventId: "evt-2", sequence: 2, outcome: "failed" }));
    expect(after.latestProducedBySlot[slot]).toBe(head);
    expect(latestAttempt(after, slot)?.output.outcome).toBe("failed");
  });

  it("keeps heads per slot, so one kind cannot shadow another", () => {
    const assessmentSlot = slotKey("asset_assessment", CASE);
    const projectedSlot = slotKey("decision_projected_value", REC);
    let ledger = accept(createLedger(SCOPE), build());
    ledger = accept(
      ledger,
      build({ kind: "decision_projected_value", eventId: "evt-2", sequence: 2 }),
    );
    expect(ledger.latestProducedBySlot[assessmentSlot]).toBeDefined();
    expect(ledger.latestProducedBySlot[projectedSlot]).toBeDefined();
    expect(ledger.latestProducedBySlot[assessmentSlot]).not.toBe(
      ledger.latestProducedBySlot[projectedSlot],
    );
  });

  it("returns null heads for a slot that has never been calculated", () => {
    const ledger = createLedger(SCOPE);
    expect(latestProduced(ledger, slotKey("realised_value", CASE))).toBeNull();
    expect(latestAttempt(ledger, slotKey("realised_value", CASE))).toBeNull();
  });
});

describe("immutability and history preservation", () => {
  it("takes ownership of the submitted record so later mutation cannot alter history", () => {
    const submitted = build();
    const ledger = accept(createLedger(SCOPE), submitted);
    (submitted as { asOf: string }).asOf = "1999-01-01T00:00:00.000Z";
    expect(ledger.records[0]!.record.asOf).toBe(AS_OF);
    expect(ledger.records[0]!.record).not.toBe(submitted);
  });

  it("returns independently mutable persistence copies", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const persisted = toPersistableCalculations(ledger);
    expect(persisted).toHaveLength(1);
    (persisted[0] as { asOf: string }).asOf = "1999-01-01T00:00:00.000Z";
    expect(ledger.records[0]!.record.asOf).toBe(AS_OF);
    expect(toPersistableCalculations(ledger)[0]!.asOf).toBe(AS_OF);
  });

  it("preserves every superseded calculation in full", () => {
    const first = accept(createLedger(SCOPE), build());
    const head = first.records[0]!.record.calculationId;
    const second = accept(first, build({ eventId: "evt-2", sequence: 2, supersedes: head }));
    expect(second.records).toHaveLength(2);
    expect(second.records[0]!.record.calculationId).toBe(head);
    expect(second.records[1]!.record.supersedesCalculationId).toBe(head);
    // The earlier ledger value is untouched by the later append.
    expect(first.records).toHaveLength(1);
  });
});

describe("replay", () => {
  it("rebuilds an identical ledger from persisted records", () => {
    let ledger = accept(createLedger(SCOPE), build());
    const head = ledger.records[0]!.record.calculationId;
    ledger = accept(ledger, build({ eventId: "evt-2", sequence: 2, supersedes: head }));
    ledger = accept(ledger, build({ eventId: "evt-3", sequence: 3, outcome: "unavailable" }));

    const result = replayCalculations(SCOPE, toPersistableCalculations(ledger));
    expect(result.outcome).toBe("replayed");
    if (result.outcome !== "replayed") throw new Error("unreachable");
    expect(toPersistableCalculations(result.ledger)).toEqual(toPersistableCalculations(ledger));
    expect(result.ledger.latestProducedBySlot).toEqual(ledger.latestProducedBySlot);
    expect(result.ledger.latestAttemptBySlot).toEqual(ledger.latestAttemptBySlot);
  });

  it("is deterministic across repeated replays", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const persisted = toPersistableCalculations(ledger);
    const a = replayCalculations(SCOPE, persisted);
    const b = replayCalculations(SCOPE, persisted);
    if (a.outcome !== "replayed" || b.outcome !== "replayed") throw new Error("unreachable");
    expect(toPersistableCalculations(a.ledger)).toEqual(toPersistableCalculations(b.ledger));
  });

  it("fails closed at the first corrupt record and reports its index", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const persisted = toPersistableCalculations(ledger);
    persisted.push({ ...build({ eventId: "evt-2", sequence: 9 }) });
    const result = replayCalculations(SCOPE, persisted);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("non_contiguous_sequence");
    expect(result.index).toBe(1);
  });

  it("treats a repeated calculationId in persisted history as corruption, not idempotency", () => {
    const ledger = accept(createLedger(SCOPE), build());
    const persisted = toPersistableCalculations(ledger);
    const result = replayCalculations(SCOPE, [...persisted, ...persisted]);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("duplicate_calculation_in_replay");
    expect(result.index).toBe(1);
  });

  it("replays an empty history into an empty ledger", () => {
    const result = replayCalculations(SCOPE, []);
    expect(result.outcome).toBe("replayed");
    if (result.outcome !== "replayed") throw new Error("unreachable");
    expect(result.ledger.records).toHaveLength(0);
  });
});

describe("event boundary", () => {
  it("never emits a proposed event from the ledger itself", () => {
    const accepted = appendCalculation(createLedger(SCOPE), build());
    expect(accepted.proposedEvents).toEqual([]);
    expect(Object.isFrozen(accepted.proposedEvents)).toBe(true);
  });
});
