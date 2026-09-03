import { canonicalKey } from "./calculations/identity";
import { isCanonicalInstant, isNonEmpty } from "./event-log-core";
import {
  appendEvent,
  appendGovernedDecisionEvent,
  createAggregate,
  replay,
  type AggregateInit,
  type GovernedAggregate,
} from "./event-log";
import { isDecisionGated, type GovernedEvent, type GovernedEventPayloads } from "./events";
import type { DecisionLifecycleStatus } from "./lifecycle";
import type { RecomputeRequest } from "./recompute";
import {
  AUTHORITY_WORKFLOW_POLICY_VERSION,
  authorizationPolicyRef,
  isEndorsementAct,
  ruleForAct,
  type GovernedAct,
} from "./authority-policy";
import {
  evaluateAuthority,
  type AuthorityContext,
  type CapabilityResolver,
} from "./authority";
import {
  buildAuditRecord,
  commandFingerprint,
  type AuditAction,
  type AuditActorRecord,
  type AuditRecord,
  type AuditResult,
} from "./audit";

/**
 * Slice 2.2 — the branded governed case: the UNAVOIDABLE authority boundary.
 *
 * A `GovernedCase` bundles the event aggregate, the append-only audit trail and
 * the request-receipt idempotency index behind ONE runtime brand. Every gated
 * decision, endorsement and outcome validation must progress through this
 * module; the public event-log boundary rejects gated events outright, and the
 * internal seam that commits an authorised gated event is imported ONLY here
 * (proven by dependency boundary tests).
 *
 * Guarantees:
 *  - event append and audit append are atomic: a rejected authority evaluation
 *    appends audit evidence but never an event, and an accepted event always
 *    appends exactly one committed audit record — the two can never diverge;
 *  - identity, sequence, actor and occurrence are derived internally from the
 *    trusted command context, never from anything the caller asserts;
 *  - `requestId` gives idempotency: an identical retry returns the original
 *    result with no second event or audit; a reused id with different content
 *    fails closed (`request_id_conflict`);
 *  - replay re-runs the events and re-verifies authority against the recorded,
 *    versioned policy, rebuilding the receipt index.
 *
 * Nothing here reads a clock or a random source.
 */

const CASE: unique symbol = Symbol("governed-case");

interface RequestReceipt {
  readonly requestId: string;
  readonly fingerprint: string;
  readonly outcome: CommittedOrRejected;
  readonly eventId: string | null;
  readonly auditId: string | null;
}

export interface GovernedCase {
  readonly aggregate: GovernedAggregate;
  readonly trail: readonly AuditRecord[];
  readonly receipts: ReadonlyMap<string, RequestReceipt>;
  readonly [CASE]: true;
}

type CommittedOrRejected = "committed" | "rejected";

export type CaseOutcome =
  | "committed"
  | "rejected"
  | "idempotent"
  | "conflict"
  | "malformed";

export interface CaseResult {
  readonly outcome: CaseOutcome;
  readonly case: GovernedCase;
  readonly auditRecord: AuditRecord | null;
  readonly eventId: string | null;
  readonly rejectionReason: string | null;
  readonly recomputeRequests: readonly RecomputeRequest[];
}

/** Trusted, server-resolved context for a human governed command. */
export interface HumanCommandContext extends AuthorityContext {
  readonly kind: "human";
  readonly attemptedAt: string;
  readonly asOf: string;
  readonly requestId: string;
}

/** Trusted, server-resolved context for a system-authored governed fact. */
export interface SystemCommandContext {
  readonly kind: "system";
  readonly systemId: string;
  readonly attemptedAt: string;
  readonly asOf: string;
  readonly requestId: string;
}

export type CommandContext = HumanCommandContext | SystemCommandContext;

export type GatedPayload = GovernedEventPayloads[
  | "DecisionApproved"
  | "DecisionRejected"
  | "DecisionReturned"
  | "EndorsementGranted"
  | "EndorsementDeclined"
  | "OutcomeConfirmed"
];

export interface GovernedDecisionCommand {
  readonly act: GovernedAct;
  readonly payload: GatedPayload;
  readonly rationale: string;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function brandCase(
  aggregate: GovernedAggregate,
  trail: readonly AuditRecord[],
  receipts: ReadonlyMap<string, RequestReceipt>,
): GovernedCase {
  return Object.freeze({
    aggregate,
    trail: Object.freeze([...trail]),
    receipts,
    [CASE]: true as const,
  });
}

export function openCase(init: AggregateInit): GovernedCase {
  return brandCase(createAggregate(init), [], new Map());
}

export function isGovernedCase(value: unknown): value is GovernedCase {
  return typeof value === "object" && value !== null && (value as GovernedCase)[CASE] === true;
}

function assertCase(value: GovernedCase): void {
  if (!isGovernedCase(value)) {
    throw new TypeError("A governed case must come from openCase or replayCase.");
  }
}

export function caseAggregate(governed: GovernedCase): GovernedAggregate {
  assertCase(governed);
  return governed.aggregate;
}

export function caseTrail(governed: GovernedCase): readonly AuditRecord[] {
  assertCase(governed);
  return governed.trail;
}

export function caseReceipt(
  governed: GovernedCase,
  requestId: string,
): RequestReceipt | undefined {
  assertCase(governed);
  return governed.receipts.get(requestId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextSequence(aggregate: GovernedAggregate): number {
  return (aggregate.snapshot?.lastSequence ?? 0) + 1;
}

function mintEventId(aggregateId: string, sequence: number, type: string): string {
  return canonicalKey("governed-event", [aggregateId, String(sequence), type]);
}

function withReceipt(
  receipts: ReadonlyMap<string, RequestReceipt>,
  receipt: RequestReceipt,
): ReadonlyMap<string, RequestReceipt> {
  const next = new Map(receipts);
  next.set(receipt.requestId, receipt);
  return next;
}

function findRecord(
  trail: readonly AuditRecord[],
  auditId: string | null,
): AuditRecord | null {
  if (auditId === null) return null;
  return trail.find((record) => record.auditId === auditId) ?? null;
}

function targetProposalOf(payload: GatedPayload): string | null {
  const anyPayload = payload as unknown as Record<string, unknown>;
  const candidate = anyPayload.decisionId ?? anyPayload.outcomeId;
  return typeof candidate === "string" ? candidate : null;
}

function priorApproverPrincipalId(
  trail: readonly AuditRecord[],
  approvalEventId: string,
): string | null {
  for (const record of trail) {
    if (
      record.result === "committed" &&
      record.action.kind === "decision" &&
      record.action.act === "approve" &&
      record.resultingEventId === approvalEventId &&
      record.actor.kind === "human"
    ) {
      return record.actor.principalId;
    }
  }
  return null;
}

function malformed(governed: GovernedCase, reason: string): CaseResult {
  return {
    outcome: "malformed",
    case: governed,
    auditRecord: null,
    eventId: null,
    rejectionReason: reason,
    recomputeRequests: [],
  };
}

/**
 * Append an audit record and progress the case in one atomic step. Sequence and
 * identity are derived from the current trail so an audit can never be lost or
 * duplicated relative to an event.
 */
function appendAudit(
  aggregate: GovernedAggregate,
  trail: readonly AuditRecord[],
  receipts: ReadonlyMap<string, RequestReceipt>,
  fields: {
    readonly aggregateId: string;
    readonly requestId: string;
    readonly action: AuditAction;
    readonly result: AuditResult;
    readonly actor: AuditActorRecord;
    readonly attemptedAt: string;
    readonly rationale: string | null;
    readonly targetProposalId: string | null;
    readonly previousDecisionStatus: DecisionLifecycleStatus | null;
    readonly resultingEventId: string | null;
    readonly rejectionReason: string | null;
    readonly fingerprint: string;
    readonly usePolicyRef: boolean;
  },
): { readonly case: GovernedCase; readonly record: AuditRecord } {
  const record = buildAuditRecord({
    sequence: trail.length + 1,
    aggregateId: fields.aggregateId,
    requestId: fields.requestId,
    action: fields.action,
    result: fields.result,
    actor: fields.actor,
    attemptedAt: fields.attemptedAt,
    rationale: fields.rationale,
    targetProposalId: fields.targetProposalId,
    previousDecisionStatus: fields.previousDecisionStatus,
    resultingEventId: fields.resultingEventId,
    rejectionReason: fields.rejectionReason,
    policyRef: fields.usePolicyRef ? authorizationPolicyRef() : null,
    fingerprint: fields.fingerprint,
  });
  const receipt: RequestReceipt = {
    requestId: fields.requestId,
    fingerprint: fields.fingerprint,
    outcome: fields.result === "committed" ? "committed" : "rejected",
    eventId: fields.resultingEventId,
    auditId: record.auditId,
  };
  return {
    case: brandCase(aggregate, [...trail, record], withReceipt(receipts, receipt)),
    record,
  };
}

function contextWellFormed(context: CommandContext): boolean {
  return (
    isCanonicalInstant(context.attemptedAt) &&
    isCanonicalInstant(context.asOf) &&
    isNonEmpty(context.requestId)
  );
}

function idempotentHit(
  governed: GovernedCase,
  receipt: RequestReceipt,
  fingerprint: string,
): CaseResult | null {
  if (receipt.fingerprint === fingerprint) {
    return {
      outcome: "idempotent",
      case: governed,
      auditRecord: findRecord(governed.trail, receipt.auditId),
      eventId: receipt.eventId,
      rejectionReason: null,
      recomputeRequests: [],
    };
  }
  return {
    outcome: "conflict",
    case: governed,
    auditRecord: null,
    eventId: null,
    rejectionReason: "request_id_conflict",
    recomputeRequests: [],
  };
}

// ---------------------------------------------------------------------------
// Gated decisions
// ---------------------------------------------------------------------------

export function recordGovernedDecision(
  governed: GovernedCase,
  context: HumanCommandContext,
  command: GovernedDecisionCommand,
  resolver: CapabilityResolver,
): CaseResult {
  assertCase(governed);

  // Structurally malformed requests are rejected BEFORE they can become audit
  // evidence: without a trustworthy attempt time there is nothing to record.
  if (context.kind !== "human" || !contextWellFormed(context)) {
    return malformed(governed, "malformed_request");
  }

  const rule = ruleForAct(command.act);
  const action: AuditAction = { kind: "decision", act: command.act };
  const fingerprint = commandFingerprint({
    action,
    payload: command.payload,
    rationale: command.rationale,
    principalId: context.principalId,
    personaId: context.personaId,
    systemId: null,
    policyRef: authorizationPolicyRef(),
  });

  const existing = governed.receipts.get(context.requestId);
  if (existing) return idempotentHit(governed, existing, fingerprint) as CaseResult;

  const humanActor: AuditActorRecord = {
    kind: "human",
    principalId: context.principalId,
    personaId: context.personaId,
    authorization: context.authorization,
  };
  const previousDecisionStatus = governed.aggregate.snapshot?.decisionStatus ?? null;
  const targetProposalId = targetProposalOf(command.payload);

  const rejectDecision = (reason: string): CaseResult => {
    const appended = appendAudit(governed.aggregate, governed.trail, governed.receipts, {
      aggregateId: governed.aggregate.aggregateId,
      requestId: context.requestId,
      action,
      result: "rejected",
      actor: humanActor,
      attemptedAt: context.attemptedAt,
      rationale: command.rationale.trim() === "" ? null : command.rationale,
      targetProposalId,
      previousDecisionStatus,
      resultingEventId: null,
      rejectionReason: reason,
      fingerprint,
      usePolicyRef: true,
    });
    return {
      outcome: "rejected",
      case: appended.case,
      auditRecord: appended.record,
      eventId: null,
      rejectionReason: reason,
      recomputeRequests: [],
    };
  };

  // A rationale is mandatory for every human decision.
  if (!isNonEmpty(command.rationale)) return rejectDecision("rationale_required");

  // 1–3. Capability authority: assume-persona, policy-permits-persona, holds-capability.
  const authority = evaluateAuthority(command.act, context, resolver);
  if (!authority.ok) return rejectDecision(authority.reason);

  // 4. Self-endorsement prevention — the endorser may not be the approver.
  if (isEndorsementAct(command.act)) {
    const approvalEventId = (command.payload as unknown as { approvalEventId?: unknown }).approvalEventId;
    if (typeof approvalEventId === "string") {
      const approver = priorApproverPrincipalId(governed.trail, approvalEventId);
      if (approver !== null && approver === context.principalId) {
        return rejectDecision("self_endorsement_forbidden");
      }
    }
  }

  // 5. Mint and commit the gated event through the internal authorised seam.
  const sequence = nextSequence(governed.aggregate);
  const event = {
    eventId: mintEventId(governed.aggregate.aggregateId, sequence, rule.gatedEventType),
    aggregateId: governed.aggregate.aggregateId,
    sequence,
    occurredAt: context.asOf,
    asOf: context.asOf,
    actor: { kind: "persona", personaId: context.personaId },
    type: rule.gatedEventType,
    payload: command.payload,
  } as GovernedEvent;

  const append = appendGovernedDecisionEvent(governed.aggregate, event);
  if (append.outcome !== "accepted") {
    const reason = append.outcome === "ignored" ? "duplicate_ignored" : append.reason;
    return rejectDecision(reason);
  }

  const committed = appendAudit(append.aggregate, governed.trail, governed.receipts, {
    aggregateId: governed.aggregate.aggregateId,
    requestId: context.requestId,
    action,
    result: "committed",
    actor: humanActor,
    attemptedAt: context.attemptedAt,
    rationale: command.rationale,
    targetProposalId,
    previousDecisionStatus,
    resultingEventId: event.eventId,
    rejectionReason: null,
    fingerprint,
    usePolicyRef: true,
  });
  return {
    outcome: "committed",
    case: committed.case,
    auditRecord: committed.record,
    eventId: event.eventId,
    rejectionReason: null,
    recomputeRequests: append.recomputeRequests,
  };
}

// ---------------------------------------------------------------------------
// Ungated governed facts
// ---------------------------------------------------------------------------

export function recordGovernedFact(
  governed: GovernedCase,
  context: CommandContext,
  event: GovernedEvent,
): CaseResult {
  assertCase(governed);

  if (!contextWellFormed(context)) return malformed(governed, "malformed_request");
  if (isDecisionGated(event.type)) {
    return malformed(governed, "gated_event_not_appendable");
  }

  const action: AuditAction = { kind: "fact", eventType: event.type };
  const actor: AuditActorRecord =
    context.kind === "human"
      ? {
          kind: "human",
          principalId: context.principalId,
          personaId: context.personaId,
          authorization: context.authorization,
        }
      : { kind: "system", systemId: context.systemId };
  const principalId = context.kind === "human" ? context.principalId : "";
  const systemId = context.kind === "system" ? context.systemId : null;
  const personaId = context.kind === "human" ? context.personaId : null;

  const fingerprint = commandFingerprint({
    action,
    payload: event.payload,
    rationale: null,
    principalId,
    personaId,
    systemId,
    policyRef: null,
  });

  const existing = governed.receipts.get(context.requestId);
  if (existing) return idempotentHit(governed, existing, fingerprint) as CaseResult;

  const previousDecisionStatus = governed.aggregate.snapshot?.decisionStatus ?? null;
  const append = appendEvent(governed.aggregate, event);

  if (append.outcome === "accepted") {
    const committed = appendAudit(append.aggregate, governed.trail, governed.receipts, {
      aggregateId: governed.aggregate.aggregateId,
      requestId: context.requestId,
      action,
      result: "committed",
      actor,
      attemptedAt: context.attemptedAt,
      rationale: null,
      targetProposalId: null,
      previousDecisionStatus,
      resultingEventId: event.eventId,
      rejectionReason: null,
      fingerprint,
      usePolicyRef: false,
    });
    return {
      outcome: "committed",
      case: committed.case,
      auditRecord: committed.record,
      eventId: event.eventId,
      rejectionReason: null,
      recomputeRequests: append.recomputeRequests,
    };
  }

  if (append.outcome === "ignored") {
    // A live retransmission of an already-accepted fact is idempotent.
    return {
      outcome: "idempotent",
      case: governed,
      auditRecord: null,
      eventId: event.eventId,
      rejectionReason: append.reason,
      recomputeRequests: [],
    };
  }

  // A well-formed but rejected fact attempt is retained as audit evidence.
  const rejected = appendAudit(governed.aggregate, governed.trail, governed.receipts, {
    aggregateId: governed.aggregate.aggregateId,
    requestId: context.requestId,
    action,
    result: "rejected",
    actor,
    attemptedAt: context.attemptedAt,
    rationale: null,
    targetProposalId: null,
    previousDecisionStatus,
    resultingEventId: null,
    rejectionReason: append.reason,
    fingerprint,
    usePolicyRef: false,
  });
  return {
    outcome: "rejected",
    case: rejected.case,
    auditRecord: rejected.record,
    eventId: null,
    rejectionReason: append.reason,
    recomputeRequests: [],
  };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type ReplayCaseResult =
  | { readonly outcome: "replayed"; readonly case: GovernedCase }
  | { readonly outcome: "rejected"; readonly reason: string; readonly index: number };

/**
 * Rebuild a governed case from persisted events and audit records. Events are
 * re-run through the append boundary; each committed decision audit is
 * re-verified structurally and against the versioned authority policy it names,
 * and the receipt index is rebuilt. Trusted server storage integrity is assumed;
 * this is structural and policy revalidation, NOT cryptographic tamper proof.
 */
export function replayCase(
  init: AggregateInit,
  events: readonly GovernedEvent[],
  audits: readonly AuditRecord[],
  resolver: CapabilityResolver,
): ReplayCaseResult {
  const rebuilt = replay(init, events);
  if (rebuilt.outcome !== "replayed") {
    return { outcome: "rejected", reason: rebuilt.reason, index: rebuilt.index };
  }
  const aggregate = rebuilt.aggregate;
  const eventIds = new Set(aggregate.events.map((accepted) => accepted.event.eventId));

  let receipts: ReadonlyMap<string, RequestReceipt> = new Map();
  for (let index = 0; index < audits.length; index += 1) {
    const record = audits[index] as AuditRecord;

    // Structural integrity: contiguous sequence, matching derived id, canonical time.
    if (record.sequence !== index + 1) {
      return { outcome: "rejected", reason: "audit_sequence_broken", index };
    }
    if (record.aggregateId !== init.aggregateId) {
      return { outcome: "rejected", reason: "audit_aggregate_mismatch", index };
    }
    if (!isCanonicalInstant(record.attemptedAt)) {
      return { outcome: "rejected", reason: "audit_timestamp_invalid", index };
    }

    if (record.action.kind === "decision" && record.result === "committed") {
      // The committed event must exist in the replayed aggregate.
      if (record.resultingEventId === null || !eventIds.has(record.resultingEventId)) {
        return { outcome: "rejected", reason: "missing_audit_proof", index };
      }
      // Versioned-policy revalidation.
      if (
        record.policyRef === null ||
        record.policyRef.version !== AUTHORITY_WORKFLOW_POLICY_VERSION
      ) {
        return { outcome: "rejected", reason: "policy_version_mismatch", index };
      }
      // Authority re-evaluation against the recorded actor.
      if (record.actor.kind !== "human") {
        return { outcome: "rejected", reason: "actor_not_human", index };
      }
      const context: AuthorityContext = {
        principalId: record.actor.principalId,
        personaId: record.actor.personaId,
        authorization: record.actor.authorization,
      };
      const authority = evaluateAuthority(record.action.act, context, resolver);
      if (!authority.ok) {
        return { outcome: "rejected", reason: authority.reason, index };
      }
    }

    receipts = withReceipt(receipts, {
      requestId: record.requestId,
      fingerprint: record.fingerprint,
      outcome: record.result === "committed" ? "committed" : "rejected",
      eventId: record.resultingEventId,
      auditId: record.auditId,
    });
  }

  return { outcome: "replayed", case: brandCase(aggregate, audits, receipts) };
}
