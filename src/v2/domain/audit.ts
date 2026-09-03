import type { PersonaId } from "@/personas/types";
import { canonicalKey } from "./calculations/identity";
import { deepFreeze } from "./event-log-core";
import type { GovernedEventType } from "./events";
import type { DecisionLifecycleStatus } from "./lifecycle";
import type { AuthorizationPolicyRef, GovernedAct } from "./authority-policy";
import type { AuditActor } from "./authority";

/**
 * Slice 2.2 — governed audit records.
 *
 * The audit trail is the "what changed" source of record. Every ACCEPTED
 * governed event has exactly one committed audit record; a well-formed but
 * rejected attempt is retained as `rejected` audit evidence WITHOUT changing
 * lifecycle state. Fact audits carry the actual `GovernedEventType` rather than
 * a single undifferentiated label, so the trail distinguishes an ingested
 * signal from a recorded work order.
 *
 * Records are deterministic: `auditId`, sequence and the request fingerprint are
 * derived, never generated from a clock or random source. `attemptedAt` is an
 * injected canonical instant, never read from an implicit clock.
 */

/** A gated human decision act, or an ungated governed fact by its event type. */
export type AuditAction =
  | { readonly kind: "decision"; readonly act: GovernedAct }
  | { readonly kind: "fact"; readonly eventType: GovernedEventType };

export type AuditResult = "committed" | "rejected" | "attempted";

export type AuditActorRecord =
  | ({ readonly kind: "human" } & AuditActor)
  | { readonly kind: "system"; readonly systemId: string };

export interface AuditRecord {
  readonly auditId: string;
  /** Position in the case audit trail; 1-based and contiguous. */
  readonly sequence: number;
  readonly aggregateId: string;
  readonly requestId: string;
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly actor: AuditActorRecord;
  /** Injected canonical UTC instant of the attempt. Never a clock read. */
  readonly attemptedAt: string;
  readonly rationale: string | null;
  /** The proposal / decision / outcome this act targeted, if any. */
  readonly targetProposalId: string | null;
  readonly previousDecisionStatus: DecisionLifecycleStatus | null;
  /** Set only for a committed action. */
  readonly resultingEventId: string | null;
  /** Set only for a rejected or attempted action. */
  readonly rejectionReason: string | null;
  readonly policyRef: AuthorizationPolicyRef | null;
  /** Canonical semantic fingerprint of the command (request receipt). */
  readonly fingerprint: string;
}

/** Deterministic audit identity, unique within the case. */
export function auditIdOf(aggregateId: string, sequence: number): string {
  return canonicalKey("audit", [aggregateId, String(sequence)]);
}

/** Stable, key-sorted JSON serialisation for canonical fingerprints. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export interface FingerprintInput {
  readonly action: AuditAction;
  readonly payload: unknown;
  readonly rationale: string | null;
  readonly principalId: string;
  readonly personaId: PersonaId | null;
  readonly systemId: string | null;
  readonly policyRef: AuthorizationPolicyRef | null;
}

/**
 * Canonical fingerprint over ALL semantic command content — act/event type,
 * canonical payload, trimmed rationale, principal, persona and policy reference.
 * The server attempt time is deliberately excluded so a legitimate retry with a
 * later transport timestamp still matches the original receipt.
 */
export function commandFingerprint(input: FingerprintInput): string {
  const actionKey =
    input.action.kind === "decision"
      ? `decision:${input.action.act}`
      : `fact:${input.action.eventType}`;
  return canonicalKey("command-fingerprint.v1", [
    actionKey,
    stableStringify(input.payload),
    (input.rationale ?? "").trim(),
    input.principalId,
    input.personaId ?? "",
    input.systemId ?? "",
    input.policyRef ? `${input.policyRef.id}@${input.policyRef.version}` : "",
  ]);
}

export interface BuildAuditRecordInput {
  readonly sequence: number;
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
  readonly policyRef: AuthorizationPolicyRef | null;
  readonly fingerprint: string;
}

/** Build a deeply frozen, deterministic audit record. */
export function buildAuditRecord(input: BuildAuditRecordInput): AuditRecord {
  return deepFreeze({
    auditId: auditIdOf(input.aggregateId, input.sequence),
    sequence: input.sequence,
    aggregateId: input.aggregateId,
    requestId: input.requestId,
    action: input.action,
    result: input.result,
    actor: input.actor,
    attemptedAt: input.attemptedAt,
    rationale: input.rationale,
    targetProposalId: input.targetProposalId,
    previousDecisionStatus: input.previousDecisionStatus,
    resultingEventId: input.resultingEventId,
    rejectionReason: input.rejectionReason,
    policyRef: input.policyRef,
    fingerprint: input.fingerprint,
  }) as AuditRecord;
}
