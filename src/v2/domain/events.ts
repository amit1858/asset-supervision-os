import type { PersonaId } from "@/personas/types";
import type { ValueEnvelope } from "./envelope";

/**
 * Slice 2.1b — the governed event catalogue.
 *
 * Every event is a PAST-TENSE record of something that already happened. There
 * are no `*Requested` command events: a request for a calculation is an
 * outbound `RecomputeRequest`, not an entry in the ledger.
 *
 * Events reference existing domain entities (`Recommendation`, `HumanDecision`,
 * work orders, executions, evidence, `OperationalOutcome`) by identity only;
 * none of those types is duplicated or re-declared here. The two exceptions are
 * `AssessmentComputed` and `RealisedValueRecorded`, which carry a governed
 * `ValueEnvelope` because the lifecycle must reason about the value itself.
 *
 * Nothing here reads a clock. `occurredAt` and `asOf` are always supplied.
 */

export type GovernedEventType =
  | "ConditionSignalIngested"
  | "ProductionObservationIngested"
  | "AssessmentComputed"
  | "RecommendationGenerated"
  | "DecisionApproved"
  | "DecisionRejected"
  | "DecisionReturned"
  | "EndorsementGranted"
  | "EndorsementDeclined"
  | "WorkOrderPlanned"
  | "MaterialsChecked"
  | "TurnaroundScopeRetained"
  | "SpeedReductionExecuted"
  | "WorkExecuted"
  | "OutcomeEvidenceRecorded"
  | "OutcomeConfirmed"
  | "RealisedValueRecorded";

/** Runtime membership test data for `malformed_event`. Exactly seventeen. */
export const GOVERNED_EVENT_TYPES: readonly GovernedEventType[] = Object.freeze([
  "ConditionSignalIngested",
  "ProductionObservationIngested",
  "AssessmentComputed",
  "RecommendationGenerated",
  "DecisionApproved",
  "DecisionRejected",
  "DecisionReturned",
  "EndorsementGranted",
  "EndorsementDeclined",
  "WorkOrderPlanned",
  "MaterialsChecked",
  "TurnaroundScopeRetained",
  "SpeedReductionExecuted",
  "WorkExecuted",
  "OutcomeEvidenceRecorded",
  "OutcomeConfirmed",
  "RealisedValueRecorded",
] as const);

/**
 * The six governed events that record a HUMAN decision, endorsement or outcome
 * validation. They can never be appended through the public boundary directly:
 * a decision, endorsement or outcome-validation event must progress through the
 * governed case, which resolves the deciding persona to a governed capability
 * and records deterministic audit evidence. See `appendEvent`.
 */
export const DECISION_GATED_EVENT_TYPES: readonly GovernedEventType[] = Object.freeze([
  "DecisionApproved",
  "DecisionRejected",
  "DecisionReturned",
  "EndorsementGranted",
  "EndorsementDeclined",
  "OutcomeConfirmed",
] as const);

const DECISION_GATED_SET: ReadonlySet<GovernedEventType> = new Set(
  DECISION_GATED_EVENT_TYPES,
);

/** True when a governed event records a gated human decision act. */
export function isDecisionGated(type: GovernedEventType): boolean {
  return DECISION_GATED_SET.has(type);
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/**
 * Who recorded a governed event.
 *
 * A discriminated union so the three kinds can never be confused: a human
 * persona, an automated system feed, and the assistant.
 *
 * This is ATTRIBUTION ONLY. Persona identity is NOT authorization: no role,
 * capability, authority or `canApprove` flag is carried here or in any payload,
 * because a client-asserted permission is not a governed permission. Slice 2.1d
 * resolves persona identity to server-governed capabilities.
 *
 * The one rule 2.1b enforces is that the assistant can never author a governed
 * event at all — see `appendEvent`.
 */
export type EventActor =
  | { readonly kind: "persona"; readonly personaId: PersonaId }
  | { readonly kind: "system"; readonly systemId: string }
  | { readonly kind: "assistant"; readonly assistantId: string };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface ConditionSignalIngestedPayload {
  readonly signalId: string;
  readonly assetId: string;
  /** Evidence timestamp of the underlying readings; may be null. */
  readonly capturedAt: string | null;
  readonly readingIds: readonly string[];
}

export interface ProductionObservationIngestedPayload {
  readonly observationId: string;
  readonly assetId: string;
  readonly runIds: readonly string[];
}

export interface AssessmentComputedPayload {
  readonly assessmentId: string;
  readonly assetId: string;
  /** Governed exposure. May be an explicitly unavailable envelope. */
  readonly valueAtStake: ValueEnvelope<number>;
}

/**
 * A recommendation deliberately carries NO projected value. Projected value is
 * a governed calculation requested via `decision_projected_value` once a
 * decision is actually recorded; attaching it here would conflate a proposal
 * with a governed value and duplicate the calculation ledger's job.
 */
export interface RecommendationGeneratedPayload {
  readonly recommendationId: string;
  /** The governing assessment this recommendation is grounded in. */
  readonly assessmentId: string;
}

export interface DecisionApprovedPayload {
  readonly decisionId: string;
  readonly recommendationId: string;
}

export interface DecisionRejectedPayload {
  readonly decisionId: string;
  readonly recommendationId: string;
}

/**
 * A recommendation returned to its author for rework. Unlike `DecisionRejected`
 * (a terminal decline of the recommendation), a return is the ONLY governed
 * re-entry: it moves the decision axis to `returned_for_rework`, from which a
 * revised recommendation may be generated.
 */
export interface DecisionReturnedPayload {
  readonly decisionId: string;
  readonly recommendationId: string;
}

export interface EndorsementGrantedPayload {
  readonly endorsementId: string;
  readonly decisionId: string;
  /** The approval event being endorsed. Endorsement is a SECOND governed act. */
  readonly approvalEventId: string;
}

export interface EndorsementDeclinedPayload {
  readonly endorsementId: string;
  readonly decisionId: string;
  readonly approvalEventId: string;
}

export interface WorkOrderPlannedPayload {
  readonly workOrderId: string;
  readonly decisionId: string;
}

export interface MaterialsCheckedPayload {
  readonly checkId: string;
  readonly workOrderId: string;
  readonly partIds: readonly string[];
}

export interface TurnaroundScopeRetainedPayload {
  readonly scopeId: string;
  readonly workOrderId: string;
}

export interface SpeedReductionExecutedPayload {
  readonly actionId: string;
  readonly assetId: string;
  /** Percentage reduction actually applied; > 0 and <= 100. */
  readonly reductionPct: number;
}

export interface WorkExecutedPayload {
  readonly executionId: string;
  readonly workOrderId: string;
}

export interface OutcomeEvidenceRecordedPayload {
  readonly evidenceRecordId: string;
  readonly executionId: string;
  /** Non-empty: an outcome is never validated without evidence. */
  readonly evidenceIds: readonly string[];
}

export interface OutcomeConfirmedPayload {
  readonly outcomeId: string;
  readonly evidenceRecordId: string;
}

export interface RealisedValueRecordedPayload {
  readonly outcomeId: string;
  readonly realisedValue: ValueEnvelope<number>;
}

export interface GovernedEventPayloads {
  ConditionSignalIngested: ConditionSignalIngestedPayload;
  ProductionObservationIngested: ProductionObservationIngestedPayload;
  AssessmentComputed: AssessmentComputedPayload;
  RecommendationGenerated: RecommendationGeneratedPayload;
  DecisionApproved: DecisionApprovedPayload;
  DecisionRejected: DecisionRejectedPayload;
  DecisionReturned: DecisionReturnedPayload;
  EndorsementGranted: EndorsementGrantedPayload;
  EndorsementDeclined: EndorsementDeclinedPayload;
  WorkOrderPlanned: WorkOrderPlannedPayload;
  MaterialsChecked: MaterialsCheckedPayload;
  TurnaroundScopeRetained: TurnaroundScopeRetainedPayload;
  SpeedReductionExecuted: SpeedReductionExecutedPayload;
  WorkExecuted: WorkExecutedPayload;
  OutcomeEvidenceRecorded: OutcomeEvidenceRecordedPayload;
  OutcomeConfirmed: OutcomeConfirmedPayload;
  RealisedValueRecorded: RealisedValueRecordedPayload;
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface GovernedEventHeader {
  readonly eventId: string;
  readonly aggregateId: string;
  /** Positive safe integer; the ONLY authoritative ordering axis. */
  readonly sequence: number;
  /** Canonical UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`. May arrive late. */
  readonly occurredAt: string;
  /** Canonical UTC ISO evaluation instant. Monotonic across the log. */
  readonly asOf: string;
  /**
   * Who recorded it. Attribution only — never authorization. The assistant can
   * never author a governed event; see `appendEvent`.
   */
  readonly actor: EventActor;
}

export type GovernedEventOf<K extends GovernedEventType> = GovernedEventHeader & {
  readonly type: K;
  readonly payload: GovernedEventPayloads[K];
};

export type GovernedEvent = {
  [K in GovernedEventType]: GovernedEventOf<K>;
}[GovernedEventType];

/**
 * Payload fields that must be non-empty strings after trimming, per event type.
 * Used for the deterministic `invalid_payload` check.
 */
export const PAYLOAD_IDENTITY_FIELDS: Readonly<
  Record<GovernedEventType, readonly string[]>
> = Object.freeze({
  ConditionSignalIngested: Object.freeze(["signalId", "assetId"]),
  ProductionObservationIngested: Object.freeze(["observationId", "assetId"]),
  AssessmentComputed: Object.freeze(["assessmentId", "assetId"]),
  RecommendationGenerated: Object.freeze(["recommendationId", "assessmentId"]),
  DecisionApproved: Object.freeze(["decisionId", "recommendationId"]),
  DecisionRejected: Object.freeze(["decisionId", "recommendationId"]),
  DecisionReturned: Object.freeze(["decisionId", "recommendationId"]),
  EndorsementGranted: Object.freeze(["endorsementId", "decisionId", "approvalEventId"]),
  EndorsementDeclined: Object.freeze(["endorsementId", "decisionId", "approvalEventId"]),
  WorkOrderPlanned: Object.freeze(["workOrderId", "decisionId"]),
  MaterialsChecked: Object.freeze(["checkId", "workOrderId"]),
  TurnaroundScopeRetained: Object.freeze(["scopeId", "workOrderId"]),
  SpeedReductionExecuted: Object.freeze(["actionId", "assetId"]),
  WorkExecuted: Object.freeze(["executionId", "workOrderId"]),
  OutcomeEvidenceRecorded: Object.freeze(["evidenceRecordId", "executionId"]),
  OutcomeConfirmed: Object.freeze(["outcomeId", "evidenceRecordId"]),
  RealisedValueRecorded: Object.freeze(["outcomeId"]),
});

/** Payload field carrying a `ValueEnvelope`, where one exists. */
export const ENVELOPE_FIELD_BY_TYPE: Readonly<
  Partial<Record<GovernedEventType, string>>
> = Object.freeze({
  AssessmentComputed: "valueAtStake",
  RealisedValueRecorded: "realisedValue",
});

// ---------------------------------------------------------------------------
// Assistant boundary
// ---------------------------------------------------------------------------

/**
 * The assistant's DRAFT of a governed event.
 *
 * It is structurally NOT a `GovernedEvent`: it has no `eventId`, no `sequence`
 * and no `actor`, so `appendEvent(aggregate, draft)` is a compile error, and if
 * forced through at runtime it fails identity validation. Governed identity and
 * ordering are minted only by the actor who actually records the fact.
 */
export type ProposedEvent = {
  [K in GovernedEventType]: {
    readonly aggregateId: string;
    readonly occurredAt: string;
    readonly asOf: string;
    readonly type: K;
    readonly payload: GovernedEventPayloads[K];
  };
}[GovernedEventType];

/**
 * A governed event the assistant has PREPARED. It is inert: it carries no
 * acceptance brand, wraps a `ProposedEvent` rather than a `GovernedEvent`, and
 * there is deliberately no promotion function and no path from here into
 * `appendEvent`. A human or system actor must construct and record the
 * authoritative event themselves.
 */
export interface PreparedEvent {
  readonly proposed: ProposedEvent;
  readonly preparedBy: "assistant";
  readonly rationale: string;
}

export function prepareEvent(proposed: ProposedEvent, rationale: string): PreparedEvent {
  return Object.freeze({ proposed, preparedBy: "assistant" as const, rationale });
}
