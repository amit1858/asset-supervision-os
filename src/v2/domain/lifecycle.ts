import type { ValueEnvelope } from "./envelope";

/**
 * Slice 2.1b — the governed lifecycle phases (S1–S9) and the orthogonal status
 * axes (spec §2).
 *
 * A PHASE is a position in the supervision lifecycle and only ever moves
 * forward. A STATUS AXIS describes a qualification of the current phase and may
 * move in any direction. Conflating the two is what produced the earlier,
 * rejected twelve-member "state" union; `EVIDENCE_UNAVAILABLE`,
 * `PENDING_ENDORSEMENT` and `OUTCOME_VALIDATED` are axes, not phases.
 *
 * Nothing in this module reads a clock, performs a calculation or executes an
 * operational action.
 */

export type LifecyclePhase =
  | "SIGNAL_DETECTED"
  | "RISK_ASSESSED"
  | "DECISION_PROPOSED"
  | "DECISION_RECORDED"
  | "WORK_PLANNED"
  | "MATERIALS_CHECKED"
  | "TURNAROUND_SCOPE_RETAINED"
  | "EXECUTION_OUTCOME_PENDING"
  | "VALUE_VALIDATION_PENDING";

/** S1 → S9, in order. The index is the only ordering authority for phases. */
export const PHASE_ORDER: readonly LifecyclePhase[] = Object.freeze([
  "SIGNAL_DETECTED",
  "RISK_ASSESSED",
  "DECISION_PROPOSED",
  "DECISION_RECORDED",
  "WORK_PLANNED",
  "MATERIALS_CHECKED",
  "TURNAROUND_SCOPE_RETAINED",
  "EXECUTION_OUTCOME_PENDING",
  "VALUE_VALIDATION_PENDING",
] as const);

export function phaseIndex(phase: LifecyclePhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Decision axis.
 *
 * - `null`            — no decision object exists yet (owner decision B-1).
 * - `proposed`        — a recommendation awaits a human decision.
 * - `approved`        — approval IS recorded, but value at stake was
 *                       unavailable, so `exposure-threshold.v1` could not
 *                       determine whether endorsement is required. The
 *                       lifecycle is blocked at `DECISION_PROPOSED` (B-2).
 * - `pending_endorsement` — approved and above threshold; awaiting the Plant
 *                       Manager. Approval is NOT endorsement.
 * - `rejected`        — the decision or the endorsement was declined. This is
 *                       TERMINAL: a declined recommendation is never revised in
 *                       place; a fresh governed thread is required.
 * - `returned_for_rework` — the recommendation was returned to its author. This
 *                       is the ONLY governed re-entry: a revised recommendation
 *                       may then be generated.
 * - `recorded`        — the governed decision is complete.
 */
export type DecisionLifecycleStatus =
  | "proposed"
  | "approved"
  | "pending_endorsement"
  | "rejected"
  | "returned_for_rework"
  | "recorded";

/**
 * Evidence axis. It is ASSESSMENT-SCOPED: only `AssessmentComputed` can change
 * it, and it describes that assessment's evidence rather than the aggregate's
 * evidence in general. Missing evidence is a first-class state, never a zero.
 *
 * - `sufficient`  — the assessment envelope is POLICY-RESOLVABLE: available,
 *                   fresh, and evaluated at the governing instant.
 * - `stale`       — a real value arrived, but it is outside its freshness
 *                   window or was evaluated at a different instant. It is
 *                   recorded and disclosed, and it governs nothing: it cannot
 *                   resolve `exposure-threshold.v1`.
 * - `unavailable` — no value at all. Never read as zero.
 */
export type AssessmentEvidenceQuality = "sufficient" | "stale" | "unavailable";

/**
 * Legacy alias for `AssessmentEvidenceQuality`. It is the same type under its
 * former name, retained only so the module barrel keeps compiling; it is not a
 * second evidence axis and carries no independent meaning.
 */
export type EvidenceQuality = AssessmentEvidenceQuality;

/** Operating axis. Changed only by `SpeedReductionExecuted`; never a phase. */
export type OperatingState = "nominal" | "speed_reduced";

/** Outcome-validation axis. `null` until execution outcome evidence exists. */
export type OutcomeValidationStatus = "pending" | "confirmed";

/**
 * The complete derived state of one governed aggregate.
 *
 * Only IDENTITY REFERENCES are retained: no `Recommendation`, `HumanDecision`,
 * work order, execution, turnaround scope, evidence record or
 * `OperationalOutcome` is copied in, so existing domain entities are never
 * duplicated. `valueAtStake` is the single exception — the envelope itself is
 * required because `exposure-threshold.v1` cannot be evaluated from an ID.
 *
 * `realisedValue` is deliberately absent: realised value stays UNAVAILABLE —
 * not zero — until a governed `RealisedValueRecorded`, and projected value,
 * value at stake and realised value remain three separate quantities.
 */
export interface LifecycleSnapshot {
  readonly aggregateId: string;
  readonly assetId: string;
  readonly phase: LifecyclePhase;
  /** Sequence of the last accepted event. */
  readonly lastSequence: number;
  /** `asOf` of the last accepted event; monotonic, never from a clock. */
  readonly asOf: string;

  readonly decisionStatus: DecisionLifecycleStatus | null;
  /** Assessment-scoped: evidence quality of the latest assessment attempt. */
  readonly assessmentEvidenceQuality: AssessmentEvidenceQuality | null;
  readonly operatingState: OperatingState;
  readonly outcomeValidationStatus: OutcomeValidationStatus | null;

  /** Most recent assessment ATTEMPT, whether or not its evidence was available. */
  readonly latestAssessmentId: string | null;
  /**
   * Last assessment that was POLICY-RESOLVABLE — never overwritten by a failed
   * or stale attempt. This is what distinguishes the last VALID governed
   * assessment from the latest assessment attempt.
   */
  readonly governingAssessmentId: string | null;

  readonly currentRecommendationId: string | null;
  readonly currentDecisionId: string | null;
  readonly approvalEventId: string | null;
  readonly endorsementEventId: string | null;
  readonly supersededRecommendationIds: readonly string[];

  // Work-to-outcome reference chain. Identity pointers only.
  readonly currentWorkOrderId: string | null;
  readonly currentTurnaroundScopeId: string | null;
  readonly currentExecutionId: string | null;
  readonly currentOutcomeEvidenceRecordId: string | null;
  readonly currentOutcomeId: string | null;

  /** Governed value at stake from the last policy-resolvable assessment. */
  readonly valueAtStake: ValueEnvelope<number> | null;
  /** Once-guard: `decision_projected_value` is requested at most once. */
  readonly projectedValueEmitted: boolean;
}
