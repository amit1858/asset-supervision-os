import { describe, expect, it } from "vitest";
import { ANCHOR_NOW } from "@/data/constants";
import { makeEnvelope, type ValueEnvelope } from "./envelope";
import type { EventActor, GovernedEvent, GovernedEventType } from "./events";
import type { LifecycleSnapshot } from "./lifecycle";
import { initialSnapshot, PERMITTED_PHASES, reduce, type ReduceResult } from "./reducer";
import { EXPOSURE_THRESHOLD_USD } from "./policy/exposure-threshold";

/**
 * Slice 2.1b — the deterministic lifecycle reducer.
 *
 * These tests exercise policy, transitions, the work-to-outcome reference chain
 * and the governed value separation. Structural validation lives in
 * `event-log.test.ts`.
 */

const ANCHOR = ANCHOR_NOW;
const ENGINEER: EventActor = { kind: "persona", personaId: "reliability_engineer" };
const FEED: EventActor = { kind: "system", systemId: "condition-feed" };

let seq = 0;

function envelope(value: number | null, asOf: string = ANCHOR): ValueEnvelope<number> {
  if (value === null) {
    return makeEnvelope<number>({
      id: `value.k201.value-at-stake.${asOf}`,
      value: null,
      unavailableReason: "Exposure inputs are not available.",
      provenance: "deterministic",
      sourceMode: "local",
      freshness: "missing",
      formulaVersion: "value-at-stake.v1",
      asOf,
      capturedAt: null,
      producedAt: asOf,
      createdByEventId: "evt-seed",
    });
  }
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

function event<K extends GovernedEventType>(
  type: K,
  payload: GovernedEvent extends infer E
    ? E extends { type: K; payload: infer P }
      ? P
      : never
    : never,
  overrides: Partial<{ asOf: string; actor: EventActor; eventId: string }> = {},
): GovernedEvent {
  seq += 1;
  const asOf = overrides.asOf ?? ANCHOR;
  return {
    eventId: overrides.eventId ?? `evt-${seq}`,
    aggregateId: "agg-k201",
    sequence: seq,
    occurredAt: asOf,
    asOf,
    actor: overrides.actor ?? ENGINEER,
    type,
    payload,
  } as GovernedEvent;
}

function ok(result: ReduceResult): {
  snapshot: LifecycleSnapshot;
  recomputeRequests: ReadonlyArray<{ kind: string }>;
} {
  if (!result.ok) {
    throw new Error(`expected acceptance, received ${result.reason}`);
  }
  return result;
}

function base(): LifecycleSnapshot {
  seq = 0;
  return initialSnapshot("agg-k201", "K-201");
}

/** Drive an aggregate to DECISION_RECORDED with a sub-threshold exposure. */
function toRecorded(value = 500_000): LifecycleSnapshot {
  let snapshot = base();
  snapshot = ok(
    reduce(
      snapshot,
      event("AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: envelope(value),
      }),
    ),
  ).snapshot;
  snapshot = ok(
    reduce(
      snapshot,
      event("RecommendationGenerated", {
        recommendationId: "rec-1",
        assessmentId: "assess-1",
      }),
    ),
  ).snapshot;
  snapshot = ok(
    reduce(
      snapshot,
      event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
    ),
  ).snapshot;
  return snapshot;
}

// ---------------------------------------------------------------------------

describe("initialSnapshot", () => {
  it("starts at S1 with every governed reference empty", () => {
    const snapshot = base();
    expect(snapshot.phase).toBe("SIGNAL_DETECTED");
    expect(snapshot.decisionStatus).toBeNull();
    expect(snapshot.assessmentEvidenceQuality).toBeNull();
    expect(snapshot.operatingState).toBe("nominal");
    expect(snapshot.outcomeValidationStatus).toBeNull();
    expect(snapshot.latestAssessmentId).toBeNull();
    expect(snapshot.governingAssessmentId).toBeNull();
    expect(snapshot.currentWorkOrderId).toBeNull();
    expect(snapshot.currentTurnaroundScopeId).toBeNull();
    expect(snapshot.currentExecutionId).toBeNull();
    expect(snapshot.currentOutcomeEvidenceRecordId).toBeNull();
    expect(snapshot.currentOutcomeId).toBeNull();
    expect(snapshot.valueAtStake).toBeNull();
  });

  it("is frozen", () => {
    expect(Object.isFrozen(base())).toBe(true);
  });
});

describe("ingestion", () => {
  it("requests an asset assessment for a condition signal in any phase", () => {
    const snapshot = base();
    const result = ok(
      reduce(
        snapshot,
        event(
          "ConditionSignalIngested",
          { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
          { actor: FEED },
        ),
      ),
    );
    expect(result.recomputeRequests.map((r) => r.kind)).toEqual(["asset_assessment"]);
    expect(result.snapshot.phase).toBe("SIGNAL_DETECTED");
  });

  it("requests an OEE reconciliation for a production observation", () => {
    const result = ok(
      reduce(
        base(),
        event(
          "ProductionObservationIngested",
          { observationId: "obs-1", assetId: "K-201", runIds: ["run-1"] },
          { actor: FEED },
        ),
      ),
    );
    expect(result.recomputeRequests.map((r) => r.kind)).toEqual(["oee_reconciliation"]);
  });

  it("rejects a signal for a different asset", () => {
    const result = reduce(
      base(),
      event(
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "P-114", capturedAt: null, readingIds: [] },
        { actor: FEED },
      ),
    );
    expect(result).toEqual({ ok: false, reason: "subject_reference_mismatch" });
  });

  it("permits both ingestion events in every phase", () => {
    expect(PERMITTED_PHASES.ConditionSignalIngested).toHaveLength(9);
    expect(PERMITTED_PHASES.ProductionObservationIngested).toHaveLength(9);
  });
});

describe("assessment and evidence", () => {
  it("advances S1 to RISK_ASSESSED when exposure is available", () => {
    const result = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    );
    expect(result.snapshot.phase).toBe("RISK_ASSESSED");
    expect(result.snapshot.assessmentEvidenceQuality).toBe("sufficient");
    expect(result.snapshot.governingAssessmentId).toBe("assess-1");
    expect(result.snapshot.valueAtStake?.value).toBe(1_620_156);
  });

  it("holds S1 and marks evidence unavailable when the initial exposure is missing", () => {
    const result = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(null),
        }),
      ),
    );
    expect(result.snapshot.phase).toBe("SIGNAL_DETECTED");
    expect(result.snapshot.assessmentEvidenceQuality).toBe("unavailable");
    expect(result.snapshot.latestAssessmentId).toBe("assess-1");
    expect(result.snapshot.governingAssessmentId).toBeNull();
    expect(result.snapshot.valueAtStake).toBeNull();
  });

  it("preserves the last valid governed assessment when a later attempt fails", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-2",
          assetId: "K-201",
          valueAtStake: envelope(null),
        }),
      ),
    ).snapshot;

    expect(snapshot.latestAssessmentId).toBe("assess-2");
    expect(snapshot.governingAssessmentId).toBe("assess-1");
    expect(snapshot.valueAtStake?.value).toBe(1_620_156);
    expect(snapshot.assessmentEvidenceQuality).toBe("unavailable");
    expect(snapshot.phase).toBe("RISK_ASSESSED");
  });

  it("never regresses the phase on reassessment", () => {
    const recorded = toRecorded();
    const result = ok(
      reduce(
        recorded,
        event("AssessmentComputed", {
          assessmentId: "assess-9",
          assetId: "K-201",
          valueAtStake: envelope(2_304_156),
        }),
      ),
    );
    expect(result.snapshot.phase).toBe("DECISION_RECORDED");
    expect(result.snapshot.decisionStatus).toBe("recorded");
    // The recorded decision is not revoked, rewritten or re-endorsed.
    expect(result.snapshot.approvalEventId).toBe(recorded.approvalEventId);
    expect(result.recomputeRequests).toHaveLength(0);
  });
});

describe("approval, endorsement and the exposure threshold", () => {
  it("records a sub-threshold decision and requests projected value once", () => {
    const snapshot = toRecorded(999_999);
    expect(snapshot.phase).toBe("DECISION_RECORDED");
    expect(snapshot.decisionStatus).toBe("recorded");
    expect(snapshot.projectedValueEmitted).toBe(true);
  });

  it("requires endorsement at exactly USD 1,000,000", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(EXPOSURE_THRESHOLD_USD),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    const approved = ok(
      reduce(
        snapshot,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    );
    expect(approved.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(approved.snapshot.decisionStatus).toBe("pending_endorsement");
    expect(approved.recomputeRequests).toHaveLength(0);
  });

  it("requires endorsement for the K-201 exposure of USD 1,620,156", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    ).snapshot;
    expect(snapshot.decisionStatus).toBe("pending_endorsement");

    // Approval is NOT endorsement: the lifecycle is still at DECISION_PROPOSED.
    expect(snapshot.phase).toBe("DECISION_PROPOSED");
    expect(snapshot.endorsementEventId).toBeNull();

    const endorsed = ok(
      reduce(
        snapshot,
        event("EndorsementGranted", {
          endorsementId: "end-1",
          decisionId: "dec-1",
          approvalEventId: snapshot.approvalEventId as string,
        }),
      ),
    );
    expect(endorsed.snapshot.phase).toBe("DECISION_RECORDED");
    expect(endorsed.snapshot.decisionStatus).toBe("recorded");
    expect(endorsed.recomputeRequests.map((r) => r.kind)).toEqual([
      "decision_projected_value",
    ]);
  });

  it("rejects an endorsement that references the wrong approval event", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    ).snapshot;

    expect(
      reduce(
        snapshot,
        event("EndorsementGranted", {
          endorsementId: "end-1",
          decisionId: "dec-1",
          approvalEventId: "evt-not-the-approval",
        }),
      ),
    ).toEqual({ ok: false, reason: "subject_reference_mismatch" });
  });

  it("blocks at DECISION_PROPOSED when exposure is undeterminable", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    // A later assessment loses evidence, but the governing envelope survives, so
    // the approval below is still determinable. Force undeterminable instead by
    // starting from an aggregate whose governing envelope never became available.
    const undeterminable: LifecycleSnapshot = Object.freeze({
      ...snapshot,
      valueAtStake: null,
      assessmentEvidenceQuality: "unavailable" as const,
    });
    const approved = ok(
      reduce(
        undeterminable,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    );
    expect(approved.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(approved.snapshot.decisionStatus).toBe("approved");
    expect(approved.snapshot.approvalEventId).not.toBeNull();
  });

  it("resolves a blocked approval deterministically when exposure arrives", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(750_000),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    const blocked: LifecycleSnapshot = Object.freeze({
      ...ok(
        reduce(
          Object.freeze({ ...snapshot, valueAtStake: null }),
          event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
        ),
      ).snapshot,
    });
    expect(blocked.decisionStatus).toBe("approved");
    const approvalEventId = blocked.approvalEventId;

    // Above threshold → pending endorsement, same approval, no second approval.
    const high = ok(
      reduce(
        blocked,
        event("AssessmentComputed", {
          assessmentId: "a2",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    );
    expect(high.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(high.snapshot.decisionStatus).toBe("pending_endorsement");
    expect(high.snapshot.approvalEventId).toBe(approvalEventId);
    expect(high.recomputeRequests).toHaveLength(0);

    // Below threshold → recorded, projected value emitted exactly once.
    const low = ok(
      reduce(
        blocked,
        event("AssessmentComputed", {
          assessmentId: "a3",
          assetId: "K-201",
          valueAtStake: envelope(900_000),
        }),
      ),
    );
    expect(low.snapshot.phase).toBe("DECISION_RECORDED");
    expect(low.snapshot.decisionStatus).toBe("recorded");
    expect(low.snapshot.approvalEventId).toBe(approvalEventId);
    expect(low.recomputeRequests.map((r) => r.kind)).toEqual(["decision_projected_value"]);
  });

  it("treats a declined endorsement as a rejection, not a recording", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    ).snapshot;
    const declined = ok(
      reduce(
        snapshot,
        event("EndorsementDeclined", {
          endorsementId: "end-1",
          decisionId: "dec-1",
          approvalEventId: snapshot.approvalEventId as string,
        }),
      ),
    );
    expect(declined.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(declined.snapshot.decisionStatus).toBe("rejected");
    expect(declined.snapshot.projectedValueEmitted).toBe(false);
  });
});

describe("rejection recovery", () => {
  function rejectedAggregate(): LifecycleSnapshot {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    return ok(
      reduce(
        snapshot,
        event("DecisionRejected", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    ).snapshot;
  }

  it("accepts a revised recommendation and resets the decision axis", () => {
    const rejectedSnapshot = rejectedAggregate();
    expect(rejectedSnapshot.decisionStatus).toBe("rejected");

    const revised = ok(
      reduce(
        rejectedSnapshot,
        event("RecommendationGenerated", { recommendationId: "rec-2", assessmentId: "a1" }),
      ),
    );
    expect(revised.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(revised.snapshot.decisionStatus).toBe("proposed");
    expect(revised.snapshot.currentRecommendationId).toBe("rec-2");
    expect(revised.snapshot.currentDecisionId).toBeNull();
    expect(revised.snapshot.approvalEventId).toBeNull();
    expect(revised.snapshot.endorsementEventId).toBeNull();
    expect(revised.snapshot.supersededRecommendationIds).toEqual(["rec-1"]);
  });

  it("deterministically rejects reuse of the rejected recommendation id", () => {
    expect(
      reduce(
        rejectedAggregate(),
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).toEqual({ ok: false, reason: "subject_reference_mismatch" });
  });

  it("rejects a revised recommendation while a decision is merely proposed", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-1", assessmentId: "a1" }),
      ),
    ).snapshot;
    expect(
      reduce(
        snapshot,
        event("RecommendationGenerated", { recommendationId: "rec-2", assessmentId: "a1" }),
      ),
    ).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("rejects a recommendation that does not reference the governing assessment", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "a1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;
    expect(
      reduce(
        snapshot,
        event("RecommendationGenerated", {
          recommendationId: "rec-1",
          assessmentId: "a-other",
        }),
      ),
    ).toEqual({ ok: false, reason: "subject_reference_mismatch" });
  });
});

describe("interim protective action", () => {
  it("changes only the operating axis and requests no recompute", () => {
    const result = ok(
      reduce(
        toRecorded(),
        event("SpeedReductionExecuted", {
          actionId: "act-1",
          assetId: "K-201",
          reductionPct: 20,
        }),
      ),
    );
    expect(result.snapshot.operatingState).toBe("speed_reduced");
    expect(result.snapshot.phase).toBe("DECISION_RECORDED");
    expect(result.recomputeRequests).toHaveLength(0);
  });
});

describe("work-to-outcome reference chain", () => {
  function chain(snapshot: LifecycleSnapshot) {
    const steps: Array<{ result: ReduceResult; label: string }> = [];
    let current = snapshot;
    const push = (label: string, result: ReduceResult) => {
      steps.push({ result, label });
      if (result.ok) current = result.snapshot;
    };
    push(
      "WorkOrderPlanned",
      reduce(current, event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" })),
    );
    push(
      "MaterialsChecked",
      reduce(
        current,
        event("MaterialsChecked", { checkId: "chk-1", workOrderId: "wo-1", partIds: ["p-1"] }),
      ),
    );
    push(
      "TurnaroundScopeRetained",
      reduce(
        current,
        event("TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
      ),
    );
    push(
      "WorkExecuted",
      reduce(current, event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" })),
    );
    push(
      "OutcomeEvidenceRecorded",
      reduce(
        current,
        event("OutcomeEvidenceRecorded", {
          evidenceRecordId: "ev-1",
          executionId: "exec-1",
          evidenceIds: ["e-1"],
        }),
      ),
    );
    push(
      "OutcomeConfirmed",
      reduce(current, event("OutcomeConfirmed", { outcomeId: "out-1", evidenceRecordId: "ev-1" })),
    );
    push(
      "RealisedValueRecorded",
      reduce(
        current,
        event("RealisedValueRecorded", {
          outcomeId: "out-1",
          realisedValue: envelope(1_094_400),
        }),
      ),
    );
    return { steps, snapshot: current };
  }

  it("accepts the complete matching K-201 chain and retains every reference", () => {
    const { steps, snapshot } = chain(toRecorded());
    for (const step of steps) {
      expect(step.result.ok, step.label).toBe(true);
    }
    expect(snapshot.phase).toBe("VALUE_VALIDATION_PENDING");
    expect(snapshot.currentWorkOrderId).toBe("wo-1");
    expect(snapshot.currentTurnaroundScopeId).toBe("scope-1");
    expect(snapshot.currentExecutionId).toBe("exec-1");
    expect(snapshot.currentOutcomeEvidenceRecordId).toBe("ev-1");
    expect(snapshot.currentOutcomeId).toBe("out-1");
    expect(snapshot.outcomeValidationStatus).toBe("confirmed");
  });

  it("emits the approved recompute kinds along the chain", () => {
    const { steps } = chain(toRecorded());
    const kinds = steps.flatMap((step) =>
      step.result.ok ? step.result.recomputeRequests.map((r) => r.kind) : [],
    );
    expect(kinds).toEqual([
      "work_readiness",
      "work_readiness",
      "turnaround_lead_time_fit",
      "realised_value",
    ]);
  });

  it("rejects each mismatched link independently and preserves state", () => {
    const recorded = toRecorded();

    const mismatches: Array<[string, () => ReduceResult, LifecycleSnapshot]> = [];

    // 1. WorkOrderPlanned.decisionId must match currentDecisionId.
    mismatches.push([
      "WorkOrderPlanned",
      () =>
        reduce(
          recorded,
          event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-other" }),
        ),
      recorded,
    ]);

    const planned = ok(
      reduce(recorded, event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" })),
    ).snapshot;
    mismatches.push([
      "MaterialsChecked",
      () =>
        reduce(
          planned,
          event("MaterialsChecked", {
            checkId: "chk-1",
            workOrderId: "wo-other",
            partIds: [],
          }),
        ),
      planned,
    ]);

    const checked = ok(
      reduce(
        planned,
        event("MaterialsChecked", { checkId: "chk-1", workOrderId: "wo-1", partIds: [] }),
      ),
    ).snapshot;
    mismatches.push([
      "TurnaroundScopeRetained",
      () =>
        reduce(
          checked,
          event("TurnaroundScopeRetained", { scopeId: "s-1", workOrderId: "wo-other" }),
        ),
      checked,
    ]);

    const retained = ok(
      reduce(
        checked,
        event("TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
      ),
    ).snapshot;
    mismatches.push([
      "WorkExecuted",
      () =>
        reduce(
          retained,
          event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-other" }),
        ),
      retained,
    ]);

    const executed = ok(
      reduce(retained, event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" })),
    ).snapshot;
    mismatches.push([
      "OutcomeEvidenceRecorded",
      () =>
        reduce(
          executed,
          event("OutcomeEvidenceRecorded", {
            evidenceRecordId: "ev-1",
            executionId: "exec-other",
            evidenceIds: ["e-1"],
          }),
        ),
      executed,
    ]);

    const evidenced = ok(
      reduce(
        executed,
        event("OutcomeEvidenceRecorded", {
          evidenceRecordId: "ev-1",
          executionId: "exec-1",
          evidenceIds: ["e-1"],
        }),
      ),
    ).snapshot;
    mismatches.push([
      "OutcomeConfirmed",
      () =>
        reduce(
          evidenced,
          event("OutcomeConfirmed", { outcomeId: "out-1", evidenceRecordId: "ev-other" }),
        ),
      evidenced,
    ]);

    const confirmed = ok(
      reduce(
        evidenced,
        event("OutcomeConfirmed", { outcomeId: "out-1", evidenceRecordId: "ev-1" }),
      ),
    ).snapshot;
    mismatches.push([
      "RealisedValueRecorded",
      () =>
        reduce(
          confirmed,
          event("RealisedValueRecorded", {
            outcomeId: "out-other",
            realisedValue: envelope(1_094_400),
          }),
        ),
      confirmed,
    ]);

    expect(mismatches).toHaveLength(7);
    for (const [label, run, before] of mismatches) {
      const snapshotBefore = { ...before };
      const result = run();
      expect(result, label).toEqual({ ok: false, reason: "subject_reference_mismatch" });
      // Rejection returns nothing new and mutates nothing.
      expect(before, label).toEqual(snapshotBefore);
    }
  });

  it("never confirms an outcome without recorded evidence", () => {
    const recorded = toRecorded();
    const planned = ok(
      reduce(recorded, event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" })),
    ).snapshot;
    const checked = ok(
      reduce(
        planned,
        event("MaterialsChecked", { checkId: "chk-1", workOrderId: "wo-1", partIds: [] }),
      ),
    ).snapshot;
    const retained = ok(
      reduce(
        checked,
        event("TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
      ),
    ).snapshot;
    const executed = ok(
      reduce(retained, event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" })),
    ).snapshot;
    expect(
      reduce(
        executed,
        event("OutcomeConfirmed", { outcomeId: "out-1", evidenceRecordId: "ev-1" }),
      ),
    ).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("keeps realised value out of the snapshot until it is recorded", () => {
    const { snapshot } = chain(toRecorded());
    expect(snapshot).not.toHaveProperty("realisedValue");
    expect(snapshot).not.toHaveProperty("projectedValue");
    // Value at stake remains the only governed envelope on the snapshot.
    expect(snapshot.valueAtStake?.value).toBe(500_000);
  });
});

describe("determinism", () => {
  it("produces a byte-identical snapshot across repeated reduction", () => {
    const first = JSON.stringify(toRecorded());
    const second = JSON.stringify(toRecorded());
    expect(first).toBe(second);
  });

  it("returns frozen snapshots so history cannot be edited in place", () => {
    expect(Object.isFrozen(toRecorded())).toBe(true);
  });

  it("rejects an out-of-phase event without altering the snapshot", () => {
    const snapshot = base();
    const result = reduce(
      snapshot,
      event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" }),
    );
    expect(result).toEqual({ ok: false, reason: "invalid_transition" });
    expect(snapshot.phase).toBe("SIGNAL_DETECTED");
  });
});
