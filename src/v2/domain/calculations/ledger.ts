import { GovernedIntegrityError } from "../event-log";
import type { ProposedEvent } from "../events";
import type { CalculationRejectionReason } from "./failure";
import {
  calculationIdOf,
  ledgerScopeKeyOf,
  requestIdOf,
  slotKey,
  type CalculationId,
  type CalculationSlot,
} from "./identity";
import { freezeInputSnapshot } from "./inputs";
import {
  validateOutput,
  validateRecordShape,
  type CalculationRecord,
} from "./record";
import {
  isSubjectInScope,
  subjectIdentityParts,
  REQUIRED_SUBJECT_KIND,
  VALID_TRIGGERS,
  type LedgerScope,
} from "./subject";

/**
 * Slice 2.1c — the append-only calculation ledger.
 *
 * The ledger holds every calculation ATTEMPT, in order, for one scope. It is
 * the audit surface: a superseded value is still there, an unavailable answer is
 * still there, and an engine outage is still there. Nothing is rewritten and
 * nothing is backward-stamped.
 *
 * Two heads are tracked per slot, and the distinction is the point:
 *
 * - `latestAttemptBySlot` — the most recent attempt of any outcome. This is the
 *   operational "what happened last".
 * - `latestProducedBySlot` — the most recent attempt that actually produced a
 *   value. This is the governed answer.
 *
 * An unavailable or failed attempt therefore NEVER displaces a good value: it
 * advances the attempt head only. Collapsing the two would let a transient
 * engine outage silently erase the last known exposure.
 *
 * Runtime branding follows the Slice 2.1b event-log pattern: acceptance is
 * carried by private, non-exported `unique symbol`s, so an `AcceptedCalculation`
 * or a `CalculationLedger` can only come from `createLedger`,
 * `appendCalculation` or `replayCalculations`. A cast or a deserialized literal
 * fails closed with `GovernedIntegrityError` — the SAME error class the event
 * log uses, not a parallel one.
 *
 * Nothing here reads a clock, generates a UUID or performs arithmetic on a
 * governed value.
 */

const ACCEPTED: unique symbol = Symbol("accepted-calculation-record");
const LEDGER: unique symbol = Symbol("calculation-ledger");

export interface AcceptedCalculationRecord {
  readonly record: CalculationRecord;
  readonly [ACCEPTED]: true;
}

export interface CalculationLedger {
  readonly scope: LedgerScope;
  readonly records: readonly AcceptedCalculationRecord[];
  readonly latestAttemptBySlot: Readonly<Record<CalculationSlot, CalculationId>>;
  readonly latestProducedBySlot: Readonly<Record<CalculationSlot, CalculationId>>;
  readonly [LEDGER]: true;
}

export type AppendCalculationResult =
  | {
      readonly outcome: "accepted";
      readonly ledger: CalculationLedger;
      readonly record: CalculationRecord;
      /**
       * Candidate governed events the calculation offers back to the Slice 2.1b
       * append boundary. Always the EXISTING `ProposedEvent`; never appended
       * here, never promoted here.
       */
      readonly proposedEvents: readonly ProposedEvent[];
    }
  | {
      readonly outcome: "ignored";
      readonly reason: Extract<CalculationRejectionReason, "duplicate_calculation_ignored">;
      readonly detail: string;
      readonly ledger: CalculationLedger;
      readonly proposedEvents: readonly ProposedEvent[];
    }
  | {
      readonly outcome: "rejected";
      readonly reason: CalculationRejectionReason;
      readonly detail: string;
      readonly ledger: CalculationLedger;
      readonly proposedEvents: readonly ProposedEvent[];
    };

export type ReplayCalculationsResult =
  | { readonly outcome: "replayed"; readonly ledger: CalculationLedger }
  | {
      readonly outcome: "rejected";
      readonly reason: CalculationRejectionReason;
      readonly detail: string;
      readonly index: number;
    };

const NO_EVENTS: readonly ProposedEvent[] = Object.freeze([]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function brandRecord(record: CalculationRecord): AcceptedCalculationRecord {
  // Defensive ownership: the accepted record is a deeply frozen clone, so a
  // caller that keeps and mutates the object it submitted cannot alter history.
  const cloned = structuredClone(record) as CalculationRecord;
  const owned: CalculationRecord = {
    ...cloned,
    inputs: freezeInputSnapshot(cloned.inputs),
  };
  return Object.freeze({ record: deepFreeze(owned), [ACCEPTED]: true as const });
}

function brandLedger(
  scope: LedgerScope,
  records: readonly AcceptedCalculationRecord[],
  latestAttemptBySlot: Readonly<Record<CalculationSlot, CalculationId>>,
  latestProducedBySlot: Readonly<Record<CalculationSlot, CalculationId>>,
): CalculationLedger {
  return Object.freeze({
    scope,
    records: Object.freeze([...records]),
    latestAttemptBySlot: Object.freeze({ ...latestAttemptBySlot }),
    latestProducedBySlot: Object.freeze({ ...latestProducedBySlot }),
    [LEDGER]: true as const,
  });
}

export function createLedger(scope: LedgerScope): CalculationLedger {
  if (typeof scope !== "object" || scope === null) {
    throw new TypeError("A calculation ledger requires a scope.");
  }
  // Throws when an identity component is blank; a ledger without identity could
  // never enforce scope admission.
  ledgerScopeKeyOf(scope);
  return brandLedger(deepFreeze({ ...scope }) as LedgerScope, [], {}, {});
}

export function isCalculationLedger(value: unknown): value is CalculationLedger {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<PropertyKey, unknown>;
  if (candidate[LEDGER] !== true) return false;
  return (
    typeof candidate.scope === "object" &&
    candidate.scope !== null &&
    Array.isArray(candidate.records)
  );
}

function assertLedger(ledger: unknown): asserts ledger is CalculationLedger {
  if (!isCalculationLedger(ledger)) {
    throw new GovernedIntegrityError(
      "a calculation ledger must come from createLedger, appendCalculation or replayCalculations.",
    );
  }
}

function rejected(
  ledger: CalculationLedger,
  reason: CalculationRejectionReason,
  detail: string,
): AppendCalculationResult {
  return { outcome: "rejected", reason, detail, ledger, proposedEvents: NO_EVENTS };
}

function lastRecord(ledger: CalculationLedger): CalculationRecord | null {
  const last = ledger.records[ledger.records.length - 1];
  return last ? last.record : null;
}

/**
 * Append one calculation attempt.
 *
 * Ordering of the checks matters: everything decidable about admissibility is
 * decided before the record can touch the heads, and a rejection or an ignored
 * duplicate always returns the IDENTICAL ledger reference so a caller cannot
 * mistake a refusal for a state change.
 */
export function appendCalculation(
  ledger: CalculationLedger,
  record: CalculationRecord,
): AppendCalculationResult {
  assertLedger(ledger);

  // 1. Structural shape, timestamps, sequence type and input snapshot.
  const shapeFailure = validateRecordShape(record);
  if (shapeFailure) return rejected(ledger, shapeFailure.reason, shapeFailure.detail);

  // 2. Kind and trigger compatibility. Defence in depth: `executeRecompute`
  //    checks this too, but a record can also arrive from persistence.
  const triggers = VALID_TRIGGERS[record.kind];
  if (!triggers) {
    return rejected(
      ledger,
      "unknown_calculation_kind",
      `Unknown calculation kind "${String(record.kind)}".`,
    );
  }
  if (!triggers.includes(record.requestedByEventType)) {
    return rejected(
      ledger,
      "recompute_trigger_mismatch",
      `"${record.kind}" cannot be emitted by "${record.requestedByEventType}".`,
    );
  }

  // 3. Subject identity, kind and scope.
  if (subjectIdentityParts(record.subject) === null) {
    return rejected(
      ledger,
      "missing_subject_identity",
      "Every calculation subject identity component must be non-empty.",
    );
  }
  if (REQUIRED_SUBJECT_KIND[record.kind] !== record.subject.kind) {
    return rejected(
      ledger,
      "calculation_subject_kind_mismatch",
      `"${record.kind}" requires a "${REQUIRED_SUBJECT_KIND[record.kind]}" subject; received "${record.subject.kind}".`,
    );
  }
  if (!isSubjectInScope(ledger.scope, record.subject)) {
    return rejected(
      ledger,
      "subject_out_of_ledger_scope",
      `A "${record.subject.kind}" subject does not belong to this "${ledger.scope.kind}" ledger.`,
    );
  }
  if (record.ledgerScopeKey !== ledgerScopeKeyOf(ledger.scope)) {
    return rejected(
      ledger,
      "subject_out_of_ledger_scope",
      "The record's ledgerScopeKey does not match this ledger.",
    );
  }

  // 4. Derived identity must be exactly reproducible from the governed facts.
  const expectedRequestId = requestIdOf(
    record.kind,
    record.subject,
    record.requestedByEventId,
  );
  if (record.requestId !== expectedRequestId) {
    return rejected(
      ledger,
      "calculation_identity_mismatch",
      "requestId is not the canonical identity of this kind, subject and triggering event.",
    );
  }
  const expectedSlot = slotKey(record.kind, record.subject);
  if (record.slot !== expectedSlot) {
    return rejected(
      ledger,
      "calculation_identity_mismatch",
      "slot is not the canonical slot of this kind and subject.",
    );
  }
  const expectedCalculationId = calculationIdOf(
    record.requestId,
    record.formulaSetVersion,
  );
  if (record.calculationId !== expectedCalculationId) {
    return rejected(
      ledger,
      "calculation_identity_mismatch",
      "calculationId is not the canonical identity of this request and formula set.",
    );
  }

  // 5. The same governed question may not be re-answered at a different instant.
  //    `asOf` is bound to the request, so this is an identity conflict — never a
  //    valid supersession. This is checked BEFORE duplicate detection, because
  //    `asOf` is deliberately not part of the calculation identity: a retry at a
  //    new instant would otherwise be silently swallowed as idempotent.
  const conflicting = ledger.records.find(
    (r) => r.record.requestId === record.requestId && r.record.asOf !== record.asOf,
  );
  if (conflicting) {
    return rejected(
      ledger,
      "calculation_request_identity_conflict",
      `Request "${record.requestId}" was already evaluated at "${conflicting.record.asOf}"; "${record.asOf}" conflicts.`,
    );
  }

  // 6. Duplicate identity is idempotent, not an error, and appends nothing.
  if (ledger.records.some((r) => r.record.calculationId === record.calculationId)) {
    return {
      outcome: "ignored",
      reason: "duplicate_calculation_ignored",
      detail: `Calculation "${record.calculationId}" has already been accepted.`,
      ledger,
      proposedEvents: NO_EVENTS,
    };
  }

  // 7. Ordering and monotonic time.
  if (record.sequence !== ledger.records.length + 1) {
    return rejected(
      ledger,
      "non_contiguous_sequence",
      `Expected sequence ${ledger.records.length + 1}; received ${record.sequence}.`,
    );
  }
  const previous = lastRecord(ledger);
  if (previous && record.asOf < previous.asOf) {
    return rejected(
      ledger,
      "calculation_as_of_regression",
      `asOf "${record.asOf}" regresses below "${previous.asOf}".`,
    );
  }

  // 8. Output, formula registry and envelope consistency.
  const outputFailure = validateOutput(record);
  if (outputFailure) return rejected(ledger, outputFailure.reason, outputFailure.detail);

  // 9. Supersession. A produced result advances the produced head and must point
  //    at exactly the head it replaces. An unavailable or failed attempt has
  //    nothing to supersede and must say so with `null`.
  const produced = record.output.outcome === "produced";
  const producedHead = ledger.latestProducedBySlot[record.slot] ?? null;
  if (produced) {
    if (record.supersedesCalculationId !== producedHead) {
      return rejected(
        ledger,
        "invalid_supersession",
        `A produced calculation must supersede the current produced head (${String(producedHead)}); received ${String(record.supersedesCalculationId)}.`,
      );
    }
  } else if (record.supersedesCalculationId !== null) {
    return rejected(
      ledger,
      "invalid_supersession",
      "An unavailable or failed calculation must not supersede a prior result.",
    );
  }

  // 10. Accept.
  const accepted = brandRecord(record);
  const latestAttemptBySlot = {
    ...ledger.latestAttemptBySlot,
    [record.slot]: record.calculationId,
  };
  const latestProducedBySlot = produced
    ? { ...ledger.latestProducedBySlot, [record.slot]: record.calculationId }
    : ledger.latestProducedBySlot;

  const next = brandLedger(
    ledger.scope,
    [...ledger.records, accepted],
    latestAttemptBySlot,
    latestProducedBySlot,
  );
  return {
    outcome: "accepted",
    ledger: next,
    record: accepted.record,
    proposedEvents: NO_EVENTS,
  };
}

/**
 * Rebuild a ledger from persisted records.
 *
 * Replay FAILS CLOSED at the first corrupt record — no skipping and no partial
 * ledger. A repeated `calculationId` inside persisted input is corruption, not
 * idempotency: unlike a live retransmission it is never tolerated.
 */
export function replayCalculations(
  scope: LedgerScope,
  records: readonly CalculationRecord[],
): ReplayCalculationsResult {
  let ledger = createLedger(scope);
  const seen = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as CalculationRecord;
    const calculationId = (record as { calculationId?: unknown })?.calculationId;
    if (typeof calculationId === "string" && seen.has(calculationId)) {
      return {
        outcome: "rejected",
        reason: "duplicate_calculation_in_replay",
        detail: `Persisted history repeats calculation "${calculationId}".`,
        index,
      };
    }

    const result = appendCalculation(ledger, record);
    if (result.outcome !== "accepted") {
      return {
        outcome: "rejected",
        reason:
          result.outcome === "ignored"
            ? "duplicate_calculation_in_replay"
            : result.reason,
        detail: result.detail,
        index,
      };
    }
    if (typeof calculationId === "string") seen.add(calculationId);
    ledger = result.ledger;
  }

  return { outcome: "replayed", ledger };
}

/**
 * Independently mutable deep clones for persistence. The ledger keeps its own
 * frozen originals, so a caller can serialise, reorder or mutate the returned
 * array without any possibility of reaching back into accepted history.
 */
export function toPersistableCalculations(
  ledger: CalculationLedger,
): CalculationRecord[] {
  if (!isCalculationLedger(ledger)) {
    throw new GovernedIntegrityError("not a calculation ledger.");
  }
  return ledger.records.map((r) => structuredClone(r.record) as CalculationRecord);
}

/** The governed answer for a slot, or `null` when none has ever been produced. */
export function latestProduced(
  ledger: CalculationLedger,
  slot: CalculationSlot,
): CalculationRecord | null {
  const id = ledger.latestProducedBySlot[slot];
  if (id === undefined) return null;
  return ledger.records.find((r) => r.record.calculationId === id)?.record ?? null;
}

/** The most recent attempt for a slot, whatever its outcome. */
export function latestAttempt(
  ledger: CalculationLedger,
  slot: CalculationSlot,
): CalculationRecord | null {
  const id = ledger.latestAttemptBySlot[slot];
  if (id === undefined) return null;
  return ledger.records.find((r) => r.record.calculationId === id)?.record ?? null;
}
