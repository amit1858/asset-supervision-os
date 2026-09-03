import type { ValueEnvelope } from "./envelope";
import {
  ENVELOPE_FIELD_BY_TYPE,
  GOVERNED_EVENT_TYPES,
  isDecisionGated,
  PAYLOAD_IDENTITY_FIELDS,
  type EventActor,
  type GovernedEvent,
} from "./events";
import type { LifecycleSnapshot } from "./lifecycle";
import type { RecomputeRequest } from "./recompute";
import { initialSnapshot, reduce } from "./reducer";
import type { RejectionReason } from "./rejection";
import { deepFreeze, isCanonicalInstant, isNonEmpty } from "./event-log-core";

/** Identity of the asset supervision case an aggregate represents. */
export interface AggregateInit {
  readonly aggregateId: string;
  readonly assetId: string;
}

/**
 * Slice 2.1b — the append-only governed event log.
 *
 * `appendEvent` is the DETERMINISTIC LIFECYCLE APPEND BOUNDARY. It proves an
 * event is well-formed, correctly ordered and lifecycle-legal before it becomes
 * history. It is NOT the authorisation boundary: the `actor` is carried for
 * attribution and only ONE actor rule binds here — the assistant may never
 * author ANY of the sixteen governed events. That a persona or system actor
 * reaches this boundary establishes nothing about permission; capability
 * enforcement is Slice 2.1d.
 *
 * Runtime integrity is enforced with two module-private symbols. They are never
 * exported, so `AcceptedGovernedEvent` and `GovernedAggregate` are inhabitable
 * only through `createAggregate`, `appendEvent` and `replay` — a caller cannot
 * fabricate either through the public TypeScript API, and a plain object that
 * merely looks right is rejected at runtime.
 *
 * Serialization honesty: symbols do NOT survive `JSON.stringify`. Persistence
 * stores plain `GovernedEvent` records; the only supported rehydration path is
 * `replay`, which re-validates every record and mints newly branded accepted
 * events. Callers must never cast or deserialize into `AcceptedGovernedEvent`
 * or `GovernedAggregate`.
 *
 * Nothing here reads a clock or a random source.
 */

const ACCEPTED: unique symbol = Symbol("accepted-governed-event");
const AGGREGATE: unique symbol = Symbol("governed-aggregate");

/**
 * Fail-closed integrity failure. Raised — never returned — when the aggregate
 * argument itself is not a genuine governed aggregate, because in that case
 * there is no trustworthy state to hand back in a result.
 */
export class GovernedIntegrityError extends TypeError {
  readonly reason: Extract<RejectionReason, "invalid_aggregate">;

  constructor(detail: string) {
    super(`invalid_aggregate: ${detail}`);
    this.name = "GovernedIntegrityError";
    this.reason = "invalid_aggregate";
  }
}

/** A governed event that has passed every validation and transition check. */
export interface AcceptedGovernedEvent {
  readonly event: GovernedEvent;
  readonly [ACCEPTED]: true;
}

export interface GovernedAggregate {
  readonly aggregateId: string;
  readonly assetId: string;
  readonly events: readonly AcceptedGovernedEvent[];
  /** `null` until the first governed event initialises the lifecycle. */
  readonly snapshot: LifecycleSnapshot | null;
  readonly [AGGREGATE]: true;
}

export type AppendResult =
  | {
      readonly outcome: "accepted";
      readonly aggregate: GovernedAggregate;
      readonly recomputeRequests: readonly RecomputeRequest[];
    }
  | {
      readonly outcome: "ignored";
      readonly reason: "duplicate_ignored";
      readonly detail: string;
      readonly aggregate: GovernedAggregate;
    }
  | {
      readonly outcome: "rejected";
      readonly reason: RejectionReason;
      readonly detail: string;
      readonly aggregate: GovernedAggregate;
    };

export type ReplayResult =
  | {
      readonly outcome: "replayed";
      readonly aggregate: GovernedAggregate;
      readonly recomputeRequests: readonly RecomputeRequest[];
    }
  | {
      readonly outcome: "rejected";
      readonly reason: RejectionReason;
      readonly detail: string;
      readonly index: number;
    };

/** Canonical UTC instant validation lives in `event-log-core.ts`. */

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function brandEvent(event: GovernedEvent): AcceptedGovernedEvent {
  // Defensive ownership: the accepted record is a deeply frozen clone, so a
  // caller that keeps and mutates the object it submitted cannot alter history.
  return Object.freeze({ event: deepFreeze(structuredClone(event)), [ACCEPTED]: true as const });
}

function brandAggregate(
  aggregateId: string,
  assetId: string,
  events: readonly AcceptedGovernedEvent[],
  snapshot: LifecycleSnapshot | null,
): GovernedAggregate {
  return Object.freeze({
    aggregateId,
    assetId,
    events: Object.freeze([...events]),
    snapshot,
    [AGGREGATE]: true as const,
  });
}

/**
 * Start a new, empty aggregate. One aggregate represents one asset's supervision
 * case; `snapshot` stays `null` until the first `ConditionSignalIngested`, so no
 * fictitious pre-signal state is ever fabricated.
 */
export function createAggregate(init: AggregateInit): GovernedAggregate {
  if (!isNonEmpty(init?.aggregateId)) {
    throw new TypeError("A governed aggregate requires a non-empty aggregateId.");
  }
  if (!isNonEmpty(init?.assetId)) {
    throw new TypeError("A governed aggregate requires a non-empty assetId.");
  }
  return brandAggregate(init.aggregateId, init.assetId, [], null);
}

function isGovernedAggregate(value: unknown): value is GovernedAggregate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<PropertyKey, unknown>;
  if (candidate[AGGREGATE] !== true) return false;
  return (
    typeof candidate.aggregateId === "string" &&
    typeof candidate.assetId === "string" &&
    Array.isArray(candidate.events)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface Failure {
  readonly reason: RejectionReason;
  readonly detail: string;
}

function isEnvelopeShaped(value: unknown): value is ValueEnvelope<number> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.version === "number" &&
    (candidate.status === "available" || candidate.status === "unavailable") &&
    typeof candidate.asOf === "string"
  );
}

/**
 * Validate only what the LOG is responsible for: the 2.1a availability contract
 * and structural shape. Trust classification, freshness and `producedAt` /
 * `capturedAt` plausibility belong to the 2.1a constructor and are deliberately
 * not re-derived here — duplicating them could contradict them.
 */
function validateEnvelope(envelope: unknown, field: string): Failure | null {
  if (!isEnvelopeShaped(envelope)) {
    return {
      reason: "invalid_envelope",
      detail: `${field} is not a value envelope.`,
    };
  }
  if (envelope.status === "available") {
    if (envelope.value === null || envelope.value === undefined) {
      return {
        reason: "invalid_envelope",
        detail: `${field} is available but carries no value.`,
      };
    }
    if (envelope.unavailableReason !== undefined) {
      return {
        reason: "invalid_envelope",
        detail: `${field} is available but carries an unavailable reason.`,
      };
    }
    return null;
  }
  if (envelope.value !== null) {
    return {
      reason: "invalid_envelope",
      detail: `${field} is unavailable but carries a value.`,
    };
  }
  if (!isNonEmpty(envelope.unavailableReason)) {
    return {
      reason: "invalid_envelope",
      detail: `${field} is unavailable and requires a non-empty reason.`,
    };
  }
  return null;
}

function validatePayload(event: GovernedEvent): Failure | null {
  const payload = event.payload as unknown;
  if (typeof payload !== "object" || payload === null) {
    return { reason: "malformed_event", detail: "Event payload must be an object." };
  }
  const record = payload as Record<string, unknown>;

  for (const field of PAYLOAD_IDENTITY_FIELDS[event.type]) {
    if (!isNonEmpty(record[field])) {
      return {
        reason: "invalid_payload",
        detail: `${event.type}.${field} must be a non-empty string.`,
      };
    }
  }

  const envelopeField = ENVELOPE_FIELD_BY_TYPE[event.type];
  if (envelopeField) {
    const envelopeFailure = validateEnvelope(record[envelopeField], envelopeField);
    if (envelopeFailure) return envelopeFailure;
    const envelope = record[envelopeField] as ValueEnvelope<number>;
    if (envelope.asOf !== event.asOf) {
      return {
        reason: "envelope_as_of_mismatch",
        detail: `${envelopeField}.asOf "${envelope.asOf}" must equal event.asOf "${event.asOf}".`,
      };
    }
  }

  return null;
}

/**
 * Validate the actor and enforce the ONE governance rule this boundary owns.
 *
 * Every one of the sixteen `GovernedEvent` variants is an authoritative
 * append-only fact, so the assistant may author NONE of them — not a decision,
 * not an endorsement, and not an apparently innocuous `AssessmentComputed`,
 * `WorkOrderPlanned` or `MaterialsChecked`. There is deliberately no permitted
 * subset: a selective list is exactly how an assistant ends up authoring a fact.
 * The assistant's only output is a `ProposedEvent` inside a `PreparedEvent`,
 * which is structurally not a `GovernedEvent`.
 *
 * A persona or system actor may REACH this boundary, but reaching it is not
 * authorization. Persona identity carries no role, capability or authority
 * here; Slice 2.1d resolves identity to server-governed capabilities.
 */
function validateActor(event: GovernedEvent): Failure | null {
  const actor = event.actor as EventActor | undefined;
  if (typeof actor !== "object" || actor === null) {
    return { reason: "malformed_event", detail: "Event actor must be an object." };
  }
  if (actor.kind === "assistant") {
    return {
      reason: "actor_not_permitted",
      detail: "The assistant cannot author a governed event; it may only prepare one.",
    };
  }
  if (actor.kind === "persona") {
    if (!isNonEmpty(actor.personaId)) {
      return {
        reason: "invalid_payload",
        detail: "A persona actor requires a non-empty personaId.",
      };
    }
    return null;
  }
  if (actor.kind === "system") {
    if (!isNonEmpty(actor.systemId)) {
      return {
        reason: "invalid_payload",
        detail: "A system actor requires a non-empty systemId.",
      };
    }
    return null;
  }
  return {
    reason: "malformed_event",
    detail: `Unknown actor kind "${String((actor as { kind?: unknown }).kind)}".`,
  };
}

function validateHeader(
  aggregate: GovernedAggregate,
  event: GovernedEvent,
): Failure | null {
  const snapshot = aggregate.snapshot;

  if (!Number.isSafeInteger(event.sequence) || event.sequence <= 0) {
    return {
      reason: "invalid_sequence",
      detail: `sequence must be a positive safe integer, received ${String(event.sequence)}.`,
    };
  }
  const expected = (snapshot?.lastSequence ?? 0) + 1;
  if (event.sequence !== expected) {
    return {
      reason: "non_contiguous_sequence",
      detail: `expected sequence ${expected}, received ${event.sequence}.`,
    };
  }
  if (!isCanonicalInstant(event.occurredAt)) {
    return {
      reason: "invalid_timestamp",
      detail: `occurredAt "${String(event.occurredAt)}" is not canonical UTC ISO.`,
    };
  }
  if (!isCanonicalInstant(event.asOf)) {
    return {
      reason: "invalid_timestamp",
      detail: `asOf "${String(event.asOf)}" is not canonical UTC ISO.`,
    };
  }
  // Canonical fixed-width UTC compares correctly lexicographically.
  if (event.occurredAt > event.asOf) {
    return {
      reason: "occurred_at_after_as_of",
      detail: "occurredAt must not be later than asOf.",
    };
  }
  if (snapshot && event.asOf < snapshot.asOf) {
    return {
      reason: "as_of_regression",
      detail: `asOf "${event.asOf}" regresses below "${snapshot.asOf}".`,
    };
  }
  // A late-arriving occurredAt older than a prior event is explicitly allowed:
  // sequence is the only ordering authority.
  return null;
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

function rejected(
  aggregate: GovernedAggregate,
  reason: RejectionReason,
  detail: string,
): AppendResult {
  return { outcome: "rejected", reason, detail, aggregate };
}

/**
 * Append one governed event. Checks run in a fixed order and stop at the first
 * failure. Every result carries the aggregate, so a rejected or ignored append
 * is provably state-preserving: history is append-only and is never rewritten.
 *
 * `appendGoverned` is the internal implementation. The PUBLIC `appendEvent`
 * calls it with `allowGated = false`, so a decision, endorsement or
 * outcome-validation event can never reach history through the public boundary:
 * it must progress through the governed case, which resolves the deciding
 * persona to a governed capability and records deterministic audit evidence.
 * `appendGovernedDecisionEvent` is the internal seam the governed case uses to
 * commit a gated event AFTER authority evaluation; it is never reachable from a
 * client path (proven by the dependency boundary tests).
 */
function appendGoverned(
  aggregate: GovernedAggregate,
  event: GovernedEvent,
  allowGated: boolean,
): AppendResult {
  // 1. Runtime integrity of the aggregate itself.
  if (!isGovernedAggregate(aggregate)) {
    throw new GovernedIntegrityError(
      "a governed aggregate must come from createAggregate, appendEvent or replay.",
    );
  }

  // 2. Event shape.
  if (typeof event !== "object" || event === null) {
    return rejected(aggregate, "malformed_event", "Event must be an object.");
  }
  if (!GOVERNED_EVENT_TYPES.includes((event as GovernedEvent).type)) {
    return rejected(
      aggregate,
      "malformed_event",
      `Unknown event type "${String((event as { type?: unknown }).type)}".`,
    );
  }

  // 3. Actor. The assistant prohibition is unconditional and is checked before
  //    identity, duplication, ordering and any reducer/transition processing.
  const actorFailure = validateActor(event);
  if (actorFailure) {
    return rejected(aggregate, actorFailure.reason, actorFailure.detail);
  }

  // 3a. Authority boundary. A gated decision event may never be appended
  //     directly: only the governed case, having evaluated capability and
  //     recorded audit evidence, may commit one via the internal seam.
  if (!allowGated && isDecisionGated(event.type)) {
    return rejected(
      aggregate,
      "gated_event_not_appendable",
      `${event.type} must be committed through the governed case, which evaluates the deciding persona and records governed audit evidence.`,
    );
  }

  // 4–5. Identity.
  if (!isNonEmpty(event.eventId)) {
    return rejected(aggregate, "invalid_event_id", "eventId must be non-empty.");
  }
  if (!isNonEmpty(event.aggregateId)) {
    return rejected(aggregate, "invalid_aggregate_id", "aggregateId must be non-empty.");
  }

  // 6. Aggregate match.
  if (event.aggregateId !== aggregate.aggregateId) {
    return rejected(
      aggregate,
      "aggregate_mismatch",
      `Event targets "${event.aggregateId}", aggregate is "${aggregate.aggregateId}".`,
    );
  }

  // 7. Duplicate identity, checked BEFORE sequence: a live retransmission is
  //    idempotent, not an error, and nothing is appended.
  if (aggregate.events.some((accepted) => accepted.event.eventId === event.eventId)) {
    return {
      outcome: "ignored",
      reason: "duplicate_ignored",
      detail: `Event "${event.eventId}" has already been accepted.`,
      aggregate,
    };
  }

  // 8–12. Ordering and time.
  const headerFailure = validateHeader(aggregate, event);
  if (headerFailure) {
    return rejected(aggregate, headerFailure.reason, headerFailure.detail);
  }

  // 13–15. Payload and envelope.
  const payloadFailure = validatePayload(event);
  if (payloadFailure) {
    return rejected(aggregate, payloadFailure.reason, payloadFailure.detail);
  }

  // 16–19. Lifecycle permission, reference chain and status derivation.
  const base =
    aggregate.snapshot ?? initialSnapshot(aggregate.aggregateId, aggregate.assetId);
  const result = reduce(base, event);
  if (!result.ok) {
    return rejected(
      aggregate,
      result.reason,
      `${event.type} is not permitted from phase "${base.phase}" in the current governed state.`,
    );
  }

  const next = brandAggregate(
    aggregate.aggregateId,
    aggregate.assetId,
    [...aggregate.events, brandEvent(event)],
    result.snapshot,
  );
  return {
    outcome: "accepted",
    aggregate: next,
    recomputeRequests: result.recomputeRequests,
  };
}

/**
 * Public append boundary. Rejects the six gated decision events outright — they
 * must be committed through the governed case. Every ungated fact flows through
 * the same deterministic checks as before.
 */
export function appendEvent(
  aggregate: GovernedAggregate,
  event: GovernedEvent,
): AppendResult {
  return appendGoverned(aggregate, event, false);
}

/**
 * INTERNAL seam — commit a gated decision event that the governed case has
 * already authorised. Not part of any client-reachable barrel; a dependency
 * boundary test proves only `governed-case.ts` imports it.
 */
export function appendGovernedDecisionEvent(
  aggregate: GovernedAggregate,
  event: GovernedEvent,
): AppendResult {
  return appendGoverned(aggregate, event, true);
}

/**
 * Rebuild an aggregate from persisted raw events.
 *
 * Replay FAILS CLOSED at the first rejection — no skipping, no partial state.
 * A repeated `eventId` inside persisted input is corruption
 * (`duplicate_in_replay`), not idempotency; unlike a live retransmission it is
 * never tolerated. Neither kind of duplicate is ever appended.
 */
export function replay(
  init: AggregateInit,
  events: readonly GovernedEvent[],
): ReplayResult {
  let aggregate = createAggregate(init);
  const requests: RecomputeRequest[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as GovernedEvent;
    const eventId = (event as { eventId?: unknown })?.eventId;
    if (typeof eventId === "string" && seen.has(eventId)) {
      return {
        outcome: "rejected",
        reason: "duplicate_in_replay",
        detail: `Persisted history repeats event "${eventId}".`,
        index,
      };
    }

    const result = appendGoverned(aggregate, event, true);
    if (result.outcome !== "accepted") {
      return {
        outcome: "rejected",
        reason: result.reason,
        detail: result.detail,
        index,
      };
    }
    if (typeof eventId === "string") seen.add(eventId);
    aggregate = result.aggregate;
    requests.push(...result.recomputeRequests);
  }

  return {
    outcome: "replayed",
    aggregate,
    recomputeRequests: Object.freeze(requests),
  };
}

/**
 * Read the raw, unbranded history — the only supported persistence form.
 *
 * The result is DEFENSIVELY OWNED: every record, and every nested payload array
 * inside it, is a fresh structure. Mutating anything returned here cannot reach
 * the branded aggregate or its accepted history. The private brands do not
 * survive serialization by design; the only supported rehydration path is
 * `replay`, which re-validates and re-brands.
 */
export function toPersistableEvents(
  aggregate: GovernedAggregate,
): readonly GovernedEvent[] {
  if (!isGovernedAggregate(aggregate)) {
    throw new GovernedIntegrityError("not a governed aggregate.");
  }
  return aggregate.events.map((accepted) => structuredClone(accepted.event));
}
