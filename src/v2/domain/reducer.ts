import { isAvailable } from "./envelope";
import type {
  GovernedEvent,
  GovernedEventType,
} from "./events";
import {
  PHASE_ORDER,
  phaseIndex,
  type AssessmentEvidenceQuality,
  type LifecyclePhase,
  type LifecycleSnapshot,
} from "./lifecycle";
import { isPolicyResolvable, requiresEndorsement } from "./policy/exposure-threshold";
import type { RejectionReason } from "./rejection";
import { makeRecomputeRequest, type RecomputeRequest } from "./recompute";

/**
 * Slice 2.1b — the pure, deterministic lifecycle reducer.
 *
 * `reduce` is a total function of `(snapshot, event)`. It reads no clock, no
 * environment, no repository and no random source; it performs no calculation
 * and no operational action. Replaying the same events in the same order always
 * produces a byte-identical snapshot.
 *
 * The reducer decides only WHAT the state becomes. Structural validation
 * (identity, sequence, timestamps, actor) belongs to the governed append
 * boundary in `event-log.ts`.
 */

export type ReduceResult =
  | {
      readonly ok: true;
      readonly snapshot: LifecycleSnapshot;
      readonly recomputeRequests: readonly RecomputeRequest[];
    }
  | { readonly ok: false; readonly reason: RejectionReason };

/**
 * Phases in which each event type may legally appear. Ingestion events are
 * permitted in every phase; everything else is bound to its point in the
 * lifecycle.
 */
export const PERMITTED_PHASES: Readonly<
  Record<GovernedEventType, readonly LifecyclePhase[]>
> = Object.freeze({
  ConditionSignalIngested: PHASE_ORDER,
  ProductionObservationIngested: PHASE_ORDER,
  AssessmentComputed: PHASE_ORDER,
  RecommendationGenerated: Object.freeze<LifecyclePhase[]>([
    "RISK_ASSESSED",
    "DECISION_PROPOSED",
  ]),
  DecisionApproved: Object.freeze<LifecyclePhase[]>(["DECISION_PROPOSED"]),
  DecisionRejected: Object.freeze<LifecyclePhase[]>(["DECISION_PROPOSED"]),
  EndorsementGranted: Object.freeze<LifecyclePhase[]>(["DECISION_PROPOSED"]),
  EndorsementDeclined: Object.freeze<LifecyclePhase[]>(["DECISION_PROPOSED"]),
  WorkOrderPlanned: Object.freeze<LifecyclePhase[]>(["DECISION_RECORDED"]),
  MaterialsChecked: Object.freeze<LifecyclePhase[]>(["WORK_PLANNED"]),
  TurnaroundScopeRetained: Object.freeze<LifecyclePhase[]>(["MATERIALS_CHECKED"]),
  SpeedReductionExecuted: Object.freeze<LifecyclePhase[]>([
    "DECISION_RECORDED",
    "WORK_PLANNED",
    "MATERIALS_CHECKED",
    "TURNAROUND_SCOPE_RETAINED",
    "EXECUTION_OUTCOME_PENDING",
    "VALUE_VALIDATION_PENDING",
  ]),
  WorkExecuted: Object.freeze<LifecyclePhase[]>(["TURNAROUND_SCOPE_RETAINED"]),
  OutcomeEvidenceRecorded: Object.freeze<LifecyclePhase[]>(["EXECUTION_OUTCOME_PENDING"]),
  OutcomeConfirmed: Object.freeze<LifecyclePhase[]>(["EXECUTION_OUTCOME_PENDING"]),
  RealisedValueRecorded: Object.freeze<LifecyclePhase[]>(["VALUE_VALIDATION_PENDING"]),
});

export function initialSnapshot(aggregateId: string, assetId: string): LifecycleSnapshot {
  return Object.freeze({
    aggregateId,
    assetId,
    phase: "SIGNAL_DETECTED" as LifecyclePhase,
    lastSequence: 0,
    asOf: "",
    decisionStatus: null,
    assessmentEvidenceQuality: null,
    operatingState: "nominal" as const,
    outcomeValidationStatus: null,
    latestAssessmentId: null,
    governingAssessmentId: null,
    currentRecommendationId: null,
    currentDecisionId: null,
    approvalEventId: null,
    endorsementEventId: null,
    supersededRecommendationIds: Object.freeze([] as string[]),
    currentWorkOrderId: null,
    currentTurnaroundScopeId: null,
    currentExecutionId: null,
    currentOutcomeEvidenceRecordId: null,
    currentOutcomeId: null,
    valueAtStake: null,
    projectedValueEmitted: false,
  });
}

const reject = (reason: RejectionReason): ReduceResult => ({ ok: false, reason });

const MISMATCH: ReduceResult = reject("subject_reference_mismatch");
const INVALID: ReduceResult = reject("invalid_transition");

/** Phases never regress: `advance` is monotonic by construction. */
function advance(current: LifecyclePhase, target: LifecyclePhase): LifecyclePhase {
  return phaseIndex(target) > phaseIndex(current) ? target : current;
}

function commit(
  base: LifecycleSnapshot,
  event: GovernedEvent,
  patch: Partial<LifecycleSnapshot>,
  recomputeRequests: readonly RecomputeRequest[] = [],
): ReduceResult {
  const next: LifecycleSnapshot = Object.freeze({
    ...base,
    ...patch,
    lastSequence: event.sequence,
    asOf: event.asOf,
  });
  return { ok: true, snapshot: next, recomputeRequests: Object.freeze([...recomputeRequests]) };
}

function request(
  kind: RecomputeRequest["kind"],
  snapshot: LifecycleSnapshot,
  event: GovernedEvent,
): RecomputeRequest {
  return makeRecomputeRequest({
    kind,
    assetId: snapshot.assetId,
    requestedByEventId: event.eventId,
    requestedByEventType: event.type,
    asOf: event.asOf,
  });
}

/**
 * Resolve a recorded approval against `exposure-threshold.v1`.
 *
 * This is deterministic POLICY resolution of an approval that has already been
 * given — never a second human act. The original `approvalEventId` is reused.
 *
 * The threshold is evaluated AT `event.asOf`, so only an assessment that is
 * available, fresh and evaluated at that same instant can resolve it. Stale
 * exposure leaves the approval blocked rather than silently deciding it.
 */
function resolveApproval(
  base: LifecycleSnapshot,
  event: GovernedEvent,
  patch: Partial<LifecycleSnapshot>,
): ReduceResult {
  const merged = { ...base, ...patch } as LifecycleSnapshot;
  const requirement = requiresEndorsement(merged.valueAtStake, event.asOf);

  if (requirement === "undeterminable") {
    // Approval IS recorded, but the threshold cannot be resolved from the
    // governed evidence, so the lifecycle stays blocked at DECISION_PROPOSED
    // (owner decision B-2, hardened in 2.1b.1: stale evidence blocks too).
    return commit(base, event, { ...patch, decisionStatus: "approved" });
  }
  if (requirement === "required") {
    return commit(base, event, { ...patch, decisionStatus: "pending_endorsement" });
  }

  const emit = merged.projectedValueEmitted
    ? []
    : [request("decision_projected_value", merged, event)];
  return commit(
    base,
    event,
    {
      ...patch,
      phase: advance(base.phase, "DECISION_RECORDED"),
      decisionStatus: "recorded",
      projectedValueEmitted: true,
    },
    emit,
  );
}

export function reduce(snapshot: LifecycleSnapshot, event: GovernedEvent): ReduceResult {
  if (!PERMITTED_PHASES[event.type].includes(snapshot.phase)) return INVALID;

  switch (event.type) {
    case "ConditionSignalIngested": {
      if (event.payload.assetId !== snapshot.assetId) return MISMATCH;
      return commit(snapshot, event, {}, [
        request("asset_assessment", snapshot, event),
      ]);
    }

    case "ProductionObservationIngested": {
      if (event.payload.assetId !== snapshot.assetId) return MISMATCH;
      return commit(snapshot, event, {}, [
        request("oee_reconciliation", snapshot, event),
      ]);
    }

    case "AssessmentComputed": {
      const { assessmentId, assetId, valueAtStake } = event.payload;
      if (assetId !== snapshot.assetId) return MISMATCH;

      // Three-way classification (2.1b.1). Only a POLICY-RESOLVABLE envelope
      // governs; a real but stale value is disclosed and holds.
      const resolvable = isPolicyResolvable(valueAtStake, event.asOf);
      const quality: AssessmentEvidenceQuality = resolvable
        ? "sufficient"
        : isAvailable(valueAtStake)
          ? "stale"
          : "unavailable";

      // The latest ATTEMPT is always recorded; the last VALID governed
      // assessment and its envelope are preserved when evidence is stale or
      // missing. A stale attempt touches these two fields and nothing else.
      const patch: Partial<LifecycleSnapshot> = resolvable
        ? {
            latestAssessmentId: assessmentId,
            governingAssessmentId: assessmentId,
            valueAtStake,
            assessmentEvidenceQuality: quality,
          }
        : { latestAssessmentId: assessmentId, assessmentEvidenceQuality: quality };

      if (snapshot.phase === "SIGNAL_DETECTED") {
        // A stale or failed initial assessment holds S1: there is no governed
        // assessment to advance on.
        if (!resolvable) return commit(snapshot, event, patch);
        return commit(snapshot, event, { ...patch, phase: "RISK_ASSESSED" });
      }

      // Deferred policy resolution: an approval blocked on unresolvable
      // exposure becomes resolvable the moment a governed value arrives that is
      // available, fresh and evaluated at this event's instant.
      if (
        resolvable &&
        snapshot.phase === "DECISION_PROPOSED" &&
        snapshot.decisionStatus === "approved"
      ) {
        return resolveApproval(snapshot, event, patch);
      }

      // Any other phase: update references in place, never regress, never
      // silently reattach projected value. Revisiting an already-recorded
      // decision is a later governed event and is out of scope for 2.1b.
      return commit(snapshot, event, patch);
    }

    case "RecommendationGenerated": {
      const { recommendationId, assessmentId } = event.payload;
      if (assessmentId !== snapshot.governingAssessmentId) return MISMATCH;

      if (snapshot.phase === "DECISION_PROPOSED") {
        // Rejection recovery is the ONLY re-entry: a revised recommendation
        // after a rejected decision. Reusing the rejected recommendation ID is
        // deterministically rejected as a subject reference mismatch.
        if (snapshot.decisionStatus !== "rejected") return INVALID;
        if (
          recommendationId === snapshot.currentRecommendationId ||
          snapshot.supersededRecommendationIds.includes(recommendationId)
        ) {
          return MISMATCH;
        }
        const superseded = snapshot.currentRecommendationId
          ? [...snapshot.supersededRecommendationIds, snapshot.currentRecommendationId]
          : [...snapshot.supersededRecommendationIds];
        return commit(snapshot, event, {
          currentRecommendationId: recommendationId,
          supersededRecommendationIds: Object.freeze(superseded),
          decisionStatus: "proposed",
          currentDecisionId: null,
          approvalEventId: null,
          endorsementEventId: null,
        });
      }

      return commit(snapshot, event, {
        phase: "DECISION_PROPOSED",
        currentRecommendationId: recommendationId,
        decisionStatus: "proposed",
      });
    }

    case "DecisionApproved": {
      if (snapshot.decisionStatus !== "proposed") return INVALID;
      if (event.payload.recommendationId !== snapshot.currentRecommendationId) {
        return MISMATCH;
      }
      return resolveApproval(snapshot, event, {
        currentDecisionId: event.payload.decisionId,
        approvalEventId: event.eventId,
      });
    }

    case "DecisionRejected": {
      if (snapshot.decisionStatus !== "proposed") return INVALID;
      if (event.payload.recommendationId !== snapshot.currentRecommendationId) {
        return MISMATCH;
      }
      return commit(snapshot, event, {
        currentDecisionId: event.payload.decisionId,
        decisionStatus: "rejected",
      });
    }

    case "EndorsementGranted": {
      if (snapshot.decisionStatus !== "pending_endorsement") return INVALID;
      if (
        event.payload.decisionId !== snapshot.currentDecisionId ||
        event.payload.approvalEventId !== snapshot.approvalEventId
      ) {
        return MISMATCH;
      }
      const emit = snapshot.projectedValueEmitted
        ? []
        : [request("decision_projected_value", snapshot, event)];
      return commit(
        snapshot,
        event,
        {
          phase: advance(snapshot.phase, "DECISION_RECORDED"),
          decisionStatus: "recorded",
          endorsementEventId: event.eventId,
          projectedValueEmitted: true,
        },
        emit,
      );
    }

    case "EndorsementDeclined": {
      if (snapshot.decisionStatus !== "pending_endorsement") return INVALID;
      if (
        event.payload.decisionId !== snapshot.currentDecisionId ||
        event.payload.approvalEventId !== snapshot.approvalEventId
      ) {
        return MISMATCH;
      }
      return commit(snapshot, event, {
        decisionStatus: "rejected",
        endorsementEventId: event.eventId,
      });
    }

    case "WorkOrderPlanned": {
      if (snapshot.decisionStatus !== "recorded") return INVALID;
      if (event.payload.decisionId !== snapshot.currentDecisionId) return MISMATCH;
      return commit(
        snapshot,
        event,
        {
          phase: "WORK_PLANNED",
          currentWorkOrderId: event.payload.workOrderId,
        },
        [request("work_readiness", snapshot, event)],
      );
    }

    case "MaterialsChecked": {
      if (event.payload.workOrderId !== snapshot.currentWorkOrderId) return MISMATCH;
      return commit(snapshot, event, { phase: "MATERIALS_CHECKED" }, [
        request("work_readiness", snapshot, event),
      ]);
    }

    case "TurnaroundScopeRetained": {
      if (event.payload.workOrderId !== snapshot.currentWorkOrderId) return MISMATCH;
      return commit(
        snapshot,
        event,
        {
          phase: "TURNAROUND_SCOPE_RETAINED",
          currentTurnaroundScopeId: event.payload.scopeId,
        },
        [request("turnaround_lead_time_fit", snapshot, event)],
      );
    }

    case "SpeedReductionExecuted": {
      // An interim protective action. It changes the operating axis only and
      // deliberately triggers NO assessment or risk recompute: the governed
      // assessment is driven by condition signals, not by the response to them.
      if (event.payload.assetId !== snapshot.assetId) return MISMATCH;
      return commit(snapshot, event, { operatingState: "speed_reduced" });
    }

    case "WorkExecuted": {
      if (event.payload.workOrderId !== snapshot.currentWorkOrderId) return MISMATCH;
      return commit(snapshot, event, {
        phase: "EXECUTION_OUTCOME_PENDING",
        currentExecutionId: event.payload.executionId,
        outcomeValidationStatus: "pending",
      });
    }

    case "OutcomeEvidenceRecorded": {
      if (event.payload.executionId !== snapshot.currentExecutionId) return MISMATCH;
      return commit(snapshot, event, {
        currentOutcomeEvidenceRecordId: event.payload.evidenceRecordId,
        outcomeValidationStatus: "pending",
      });
    }

    case "OutcomeConfirmed": {
      // An outcome is never confirmed without recorded evidence.
      if (snapshot.currentOutcomeEvidenceRecordId === null) return INVALID;
      if (event.payload.evidenceRecordId !== snapshot.currentOutcomeEvidenceRecordId) {
        return MISMATCH;
      }
      return commit(
        snapshot,
        event,
        {
          phase: "VALUE_VALIDATION_PENDING",
          currentOutcomeId: event.payload.outcomeId,
          outcomeValidationStatus: "confirmed",
        },
        [request("realised_value", snapshot, event)],
      );
    }

    case "RealisedValueRecorded": {
      if (snapshot.outcomeValidationStatus !== "confirmed") return INVALID;
      if (event.payload.outcomeId !== snapshot.currentOutcomeId) return MISMATCH;
      // Realised value is recorded in the calculation ledger (2.1c), not on the
      // snapshot: it stays a separate quantity from projected value and value
      // at stake, and is unavailable — not zero — until this event.
      return commit(snapshot, event, {});
    }
  }
}
