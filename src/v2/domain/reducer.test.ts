import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ANCHOR_NOW } from "@/data/constants";
import { makeEnvelope, type ValueEnvelope } from "./envelope";
import type { EventActor, GovernedEvent, GovernedEventType } from "./events";
import type { LifecycleSnapshot } from "./lifecycle";
import { initialSnapshot, PERMITTED_PHASES, reduce, type ReduceResult } from "./reducer";
import { EXPOSURE_THRESHOLD_USD } from "./policy/exposure-threshold";
import type { RecomputeRequest } from "./recompute";

/**
 * Slice 2.1b — the deterministic lifecycle reducer.
 *
 * These tests exercise policy, transitions, the work-to-outcome reference chain
 * and the governed value separation. Structural validation lives in
 * `event-log.test.ts`.
 */

const ANCHOR = ANCHOR_NOW;
const LATER = "2026-07-28T00:00:00.000Z";
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

/**
 * A real, available exposure that is NOT policy-resolvable: the value exists
 * but its evidence is outside the freshness window.
 */
function staleEnvelope(value: number, asOf: string = ANCHOR): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: `value.k201.value-at-stake.stale.${asOf}.${value}`,
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "stale",
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
  recomputeRequests: readonly RecomputeRequest[];
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

// ---------------------------------------------------------------------------
// Slice 2.1b.1 — stale-evidence hardening
// ---------------------------------------------------------------------------

describe("stale assessment evidence", () => {
  it("holds S1 on a stale initial assessment and governs nothing", () => {
    const result = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: staleEnvelope(1_620_156),
        }),
      ),
    );
    expect(result.snapshot.phase).toBe("SIGNAL_DETECTED");
    expect(result.snapshot.assessmentEvidenceQuality).toBe("stale");
    expect(result.snapshot.latestAssessmentId).toBe("assess-1");
    expect(result.snapshot.governingAssessmentId).toBeNull();
    expect(result.snapshot.valueAtStake).toBeNull();
  });

  it("classifies an available fresh matching-asOf assessment as sufficient", () => {
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
    expect(result.snapshot.assessmentEvidenceQuality).toBe("sufficient");
    expect(result.snapshot.governingAssessmentId).toBe("assess-1");
  });

  it("classifies a real value evaluated at another instant as stale, not sufficient", () => {
    const result = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156, LATER),
        }),
      ),
    );
    expect(result.snapshot.assessmentEvidenceQuality).toBe("stale");
    expect(result.snapshot.governingAssessmentId).toBeNull();
  });

  it("distinguishes stale from unavailable on the one evidence axis", () => {
    const staleResult = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: staleEnvelope(1_620_156),
        }),
      ),
    );
    const missingResult = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(null),
        }),
      ),
    );
    expect(staleResult.snapshot.assessmentEvidenceQuality).toBe("stale");
    expect(missingResult.snapshot.assessmentEvidenceQuality).toBe("unavailable");
  });

  it("updates only latestAssessmentId and evidence quality among assessment fields", () => {
    const governed = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(1_620_156),
        }),
      ),
    ).snapshot;

    const after = ok(
      reduce(
        governed,
        event("AssessmentComputed", {
          assessmentId: "assess-2",
          assetId: "K-201",
          valueAtStake: staleEnvelope(9_999_999),
        }),
      ),
    ).snapshot;

    expect(after.latestAssessmentId).toBe("assess-2");
    expect(after.assessmentEvidenceQuality).toBe("stale");
    // The last VALID governed assessment and its envelope survive verbatim.
    expect(after.governingAssessmentId).toBe("assess-1");
    expect(after.valueAtStake).toBe(governed.valueAtStake);
    expect(after.valueAtStake?.value).toBe(1_620_156);
    expect(after.phase).toBe(governed.phase);
  });

  it("never regresses the phase on a stale reassessment", () => {
    const recorded = toRecorded();
    const after = ok(
      reduce(
        recorded,
        event("AssessmentComputed", {
          assessmentId: "assess-9",
          assetId: "K-201",
          valueAtStake: staleEnvelope(2_000_000),
        }),
      ),
    ).snapshot;
    expect(after.phase).toBe(recorded.phase);
    expect(after.decisionStatus).toBe(recorded.decisionStatus);
    expect(after.governingAssessmentId).toBe(recorded.governingAssessmentId);
  });

  it("emits no recompute request of its own for a stale assessment", () => {
    const result = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: staleEnvelope(1_620_156),
        }),
      ),
    );
    expect(result.recomputeRequests).toEqual([]);
  });
});

describe("stale evidence and the endorsement threshold", () => {
  /** An approval blocked because exposure was unavailable at approval time. */
  function blockedApproval(): LifecycleSnapshot {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(500_000),
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
    // A later unavailable assessment leaves the governing envelope in place,
    // so approve against an aggregate whose exposure cannot be resolved by
    // driving the approval at a DIFFERENT instant than the assessment.
    return snapshot;
  }

  it("does not resolve a deferred approval on a stale assessment", () => {
    // Approve at LATER, when the ANCHOR-dated exposure is no longer resolvable.
    let snapshot = blockedApproval();
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    expect(snapshot.decisionStatus).toBe("approved");
    expect(snapshot.phase).toBe("DECISION_PROPOSED");

    const approvalEventId = snapshot.approvalEventId;
    const afterStale = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );

    expect(afterStale.snapshot.decisionStatus).toBe("approved");
    expect(afterStale.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(afterStale.snapshot.projectedValueEmitted).toBe(false);
    expect(afterStale.recomputeRequests).toEqual([]);
    expect(afterStale.snapshot.approvalEventId).toBe(approvalEventId);
  });

  it("resolves the same approval on a subsequent fresh, matching-asOf assessment", () => {
    let snapshot = blockedApproval();
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    const approvalEventId = snapshot.approvalEventId;
    expect(snapshot.decisionStatus).toBe("approved");

    const resolved = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-3",
            assetId: "K-201",
            valueAtStake: envelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );

    expect(resolved.snapshot.decisionStatus).toBe("recorded");
    expect(resolved.snapshot.phase).toBe("DECISION_RECORDED");
    expect(resolved.snapshot.governingAssessmentId).toBe("assess-3");
    // The ORIGINAL approval is reused: no second human act.
    expect(resolved.snapshot.approvalEventId).toBe(approvalEventId);
    expect(resolved.snapshot.endorsementEventId).toBeNull();
    expect(resolved.recomputeRequests.map((r) => r.kind)).toEqual([
      "decision_projected_value",
    ]);
  });

  it("requires endorsement — never records — when the fresh exposure is at threshold", () => {
    let snapshot = blockedApproval();
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    ).snapshot;

    const resolved = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-3",
            assetId: "K-201",
            valueAtStake: envelope(EXPOSURE_THRESHOLD_USD, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );
    expect(resolved.snapshot.decisionStatus).toBe("pending_endorsement");
    expect(resolved.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(resolved.recomputeRequests).toEqual([]);
  });

  it("blocks the approval itself when exposure is stale at approval time", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(500_000),
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

    // Sub-threshold exposure would normally record immediately; approving at a
    // later instant makes it unresolvable, so the approval stays blocked.
    const result = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    );
    expect(result.snapshot.decisionStatus).toBe("approved");
    expect(result.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(result.snapshot.projectedValueEmitted).toBe(false);
    expect(result.recomputeRequests).toEqual([]);
  });

  it("emits decision_projected_value at most once across a stale-then-fresh sequence", () => {
    let snapshot = blockedApproval();
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    const first = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-3",
            assetId: "K-201",
            valueAtStake: envelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );
    expect(first.recomputeRequests).toHaveLength(1);
    expect(first.snapshot.projectedValueEmitted).toBe(true);

    const second = ok(
      reduce(
        first.snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-4",
            assetId: "K-201",
            valueAtStake: envelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );
    expect(second.recomputeRequests).toEqual([]);
  });
});

describe("recompute request provenance", () => {
  it("stamps every request with the exact event type that emitted it", () => {
    const signal = ok(
      reduce(
        base(),
        event(
          "ConditionSignalIngested",
          { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
          { actor: FEED },
        ),
      ),
    );
    expect(signal.recomputeRequests[0]?.requestedByEventType).toBe(
      "ConditionSignalIngested",
    );

    const observation = ok(
      reduce(
        base(),
        event(
          "ProductionObservationIngested",
          { observationId: "obs-1", assetId: "K-201", runIds: ["run-1"] },
          { actor: FEED },
        ),
      ),
    );
    expect(observation.recomputeRequests[0]?.requestedByEventType).toBe(
      "ProductionObservationIngested",
    );
  });

  it("stamps the work and turnaround requests with their own triggers", () => {
    let snapshot = toRecorded();
    const planned = ok(
      reduce(
        snapshot,
        event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" }),
      ),
    );
    expect(planned.recomputeRequests[0]?.requestedByEventType).toBe("WorkOrderPlanned");
    snapshot = planned.snapshot;

    const checked = ok(
      reduce(
        snapshot,
        event("MaterialsChecked", {
          checkId: "chk-1",
          workOrderId: "wo-1",
          partIds: ["sp-1"],
        }),
      ),
    );
    expect(checked.recomputeRequests[0]?.requestedByEventType).toBe("MaterialsChecked");
    snapshot = checked.snapshot;

    const retained = ok(
      reduce(
        snapshot,
        event("TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
      ),
    );
    expect(retained.recomputeRequests[0]?.requestedByEventType).toBe(
      "TurnaroundScopeRetained",
    );
  });

  it("stamps decision_projected_value with the approval that resolved it", () => {
    const recorded = ok(
      reduce(
        ok(
          reduce(
            ok(
              reduce(
                base(),
                event("AssessmentComputed", {
                  assessmentId: "assess-1",
                  assetId: "K-201",
                  valueAtStake: envelope(500_000),
                }),
              ),
            ).snapshot,
            event("RecommendationGenerated", {
              recommendationId: "rec-1",
              assessmentId: "assess-1",
            }),
          ),
        ).snapshot,
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    );
    expect(recorded.recomputeRequests[0]?.kind).toBe("decision_projected_value");
    expect(recorded.recomputeRequests[0]?.requestedByEventType).toBe("DecisionApproved");
  });

  it("carries the request id and asOf alongside the type", () => {
    const signal = ok(
      reduce(
        base(),
        event(
          "ConditionSignalIngested",
          { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: [] },
          { actor: FEED, eventId: "evt-sig" },
        ),
      ),
    );
    const request = signal.recomputeRequests[0];
    expect(request?.requestedByEventId).toBe("evt-sig");
    expect(request?.requestedByEventType).toBe("ConditionSignalIngested");
    expect(request?.asOf).toBe(ANCHOR);
    expect(request?.assetId).toBe("K-201");
  });
});

describe("stale exposure at approval time never crosses the threshold", () => {
  /** RISK_ASSESSED → DECISION_PROPOSED with a governing envelope at ANCHOR. */
  function proposed(governing: number): LifecycleSnapshot {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(governing),
        }),
      ),
    ).snapshot;
    return ok(
      reduce(
        snapshot,
        event("RecommendationGenerated", {
          recommendationId: "rec-1",
          assessmentId: "assess-1",
        }),
      ),
    ).snapshot;
  }

  it("stale high exposure cannot move to pending_endorsement", () => {
    let snapshot = proposed(1_620_156);
    // Replace the governing evidence with a stale attempt, then approve.
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(1_620_156, LATER),
          },
          { asOf: LATER },
        ),
      ),
    ).snapshot;

    const result = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    );
    expect(result.snapshot.decisionStatus).toBe("approved");
    expect(result.snapshot.decisionStatus).not.toBe("pending_endorsement");
    expect(result.snapshot.phase).toBe("DECISION_PROPOSED");
  });

  it("stale sub-threshold exposure cannot move to DECISION_RECORDED", () => {
    let snapshot = proposed(500_000);
    snapshot = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    ).snapshot;

    const result = ok(
      reduce(
        snapshot,
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    );
    expect(result.snapshot.decisionStatus).toBe("approved");
    expect(result.snapshot.phase).toBe("DECISION_PROPOSED");
    expect(result.snapshot.projectedValueEmitted).toBe(false);
    expect(result.recomputeRequests).toEqual([]);
  });

  it("records a policy-resolvable sub-threshold approval as before", () => {
    const result = ok(
      reduce(
        proposed(500_000),
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    );
    expect(result.snapshot.decisionStatus).toBe("recorded");
    expect(result.snapshot.phase).toBe("DECISION_RECORDED");
  });

  it("requires endorsement for a policy-resolvable K-201 exposure", () => {
    const result = ok(
      reduce(
        proposed(1_620_156),
        event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }),
      ),
    );
    expect(result.snapshot.decisionStatus).toBe("pending_endorsement");
    expect(result.snapshot.phase).toBe("DECISION_PROPOSED");
  });

  it("keeps the governing envelope byte-identical after a stale attempt", () => {
    const governed = proposed(1_620_156);
    const before = JSON.stringify(governed.valueAtStake);
    const after = ok(
      reduce(
        governed,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(42, LATER),
          },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    expect(JSON.stringify(after.valueAtStake)).toBe(before);
    expect(after.governingAssessmentId).toBe("assess-1");
  });

  it("keeps the governing envelope byte-identical after an unavailable attempt", () => {
    const governed = proposed(1_620_156);
    const before = JSON.stringify(governed.valueAtStake);
    const after = ok(
      reduce(
        governed,
        event("AssessmentComputed", {
          assessmentId: "assess-2",
          assetId: "K-201",
          valueAtStake: envelope(null),
        }),
      ),
    ).snapshot;
    expect(JSON.stringify(after.valueAtStake)).toBe(before);
    expect(after.governingAssessmentId).toBe("assess-1");
    expect(after.assessmentEvidenceQuality).toBe("unavailable");
  });

  it("still advances generic accepted-event fields on a stale assessment", () => {
    const governed = proposed(1_620_156);
    const staleEvent = event(
      "AssessmentComputed",
      {
        assessmentId: "assess-2",
        assetId: "K-201",
        valueAtStake: staleEnvelope(42, LATER),
      },
      { asOf: LATER },
    );
    const after = ok(reduce(governed, staleEvent)).snapshot;
    expect(after.lastSequence).toBe(staleEvent.sequence);
    expect(after.asOf).toBe(LATER);
  });
});

describe("reducer purity under 2.1b.1", () => {
  it("introduces no clock and no randomness", () => {
    const files = [
      "src/v2/domain/reducer.ts",
      "src/v2/domain/lifecycle.ts",
      "src/v2/domain/recompute.ts",
      "src/v2/domain/policy/exposure-threshold.ts",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const banned of [
        "Date.now",
        "new Date",
        "Math.random",
        "performance.now",
        "crypto.randomUUID",
      ]) {
        expect(source.includes(banned), `${file} contains ${banned}`).toBe(false);
      }
    }
  });

  it("replays a stale-then-fresh sequence to a byte-identical snapshot", () => {
    function run(): LifecycleSnapshot {
      let snapshot = base();
      snapshot = ok(
        reduce(
          snapshot,
          event("AssessmentComputed", {
            assessmentId: "assess-1",
            assetId: "K-201",
            valueAtStake: envelope(500_000),
          }),
        ),
      ).snapshot;
      snapshot = ok(
        reduce(
          snapshot,
          event("AssessmentComputed", {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: staleEnvelope(700_000),
          }),
        ),
      ).snapshot;
      return ok(
        reduce(
          snapshot,
          event("AssessmentComputed", {
            assessmentId: "assess-3",
            assetId: "K-201",
            valueAtStake: envelope(900_000),
          }),
        ),
      ).snapshot;
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("never mutates the input snapshot when classifying a stale assessment", () => {
    const governed = ok(
      reduce(
        base(),
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(500_000),
        }),
      ),
    ).snapshot;
    const before = JSON.stringify(governed);
    reduce(
      governed,
      event(
        "AssessmentComputed",
        {
          assessmentId: "assess-2",
          assetId: "K-201",
          valueAtStake: staleEnvelope(1, LATER),
        },
        { asOf: LATER },
      ),
    );
    expect(JSON.stringify(governed)).toBe(before);
  });
});

describe("recompute kind / emitting event compatibility", () => {
  /** The approved Slice 2.1b.1 compatibility table. */
  const PERMITTED: Readonly<Record<string, readonly GovernedEventType[]>> = {
    asset_assessment: ["ConditionSignalIngested"],
    oee_reconciliation: ["ProductionObservationIngested"],
    decision_projected_value: [
      "DecisionApproved",
      "EndorsementGranted",
      "AssessmentComputed",
    ],
    work_readiness: ["WorkOrderPlanned", "MaterialsChecked"],
    turnaround_lead_time_fit: ["TurnaroundScopeRetained"],
    realised_value: ["OutcomeConfirmed"],
  };

  /** Every request emitted by a full K-201 chain above the endorsement threshold. */
  function driveFullChain(): readonly RecomputeRequest[] {
    const emitted: RecomputeRequest[] = [];
    let snapshot = base();
    const step = (e: GovernedEvent) => {
      const result = ok(reduce(snapshot, e));
      snapshot = result.snapshot;
      emitted.push(...result.recomputeRequests);
    };

    step(
      event(
        "ConditionSignalIngested",
        { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
        { actor: FEED },
      ),
    );
    step(
      event(
        "ProductionObservationIngested",
        { observationId: "obs-1", assetId: "K-201", runIds: ["run-1"] },
        { actor: FEED },
      ),
    );
    step(
      event("AssessmentComputed", {
        assessmentId: "assess-1",
        assetId: "K-201",
        valueAtStake: envelope(1_620_156),
      }),
    );
    step(
      event("RecommendationGenerated", {
        recommendationId: "rec-1",
        assessmentId: "assess-1",
      }),
    );
    step(event("DecisionApproved", { decisionId: "dec-1", recommendationId: "rec-1" }));
    const approvalEventId = snapshot.approvalEventId as string;
    step(
      event("EndorsementGranted", {
        endorsementId: "end-1",
        decisionId: "dec-1",
        approvalEventId,
      }),
    );
    step(event("WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" }));
    step(
      event("MaterialsChecked", {
        checkId: "chk-1",
        workOrderId: "wo-1",
        partIds: ["sp-1"],
      }),
    );
    step(event("TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }));
    step(event("WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" }));
    step(
      event("OutcomeEvidenceRecorded", {
        evidenceRecordId: "ev-1",
        executionId: "exec-1",
        evidenceIds: ["obs-ev-1"],
      }),
    );
    step(event("OutcomeConfirmed", { outcomeId: "out-1", evidenceRecordId: "ev-1" }));
    return emitted;
  }

  it("emits only permitted (kind, event type) pairs across a full chain", () => {
    for (const request of driveFullChain()) {
      expect(PERMITTED[request.kind]).toContain(request.requestedByEventType);
    }
  });

  it("exercises every recompute kind except the two never reached by this chain", () => {
    const kinds = new Set(driveFullChain().map((r) => r.kind));
    expect(kinds).toContain("asset_assessment");
    expect(kinds).toContain("oee_reconciliation");
    expect(kinds).toContain("decision_projected_value");
    expect(kinds).toContain("work_readiness");
    expect(kinds).toContain("turnaround_lead_time_fit");
    expect(kinds).toContain("realised_value");
  });

  it("stamps decision_projected_value with EndorsementGranted on the endorsed path", () => {
    const projected = driveFullChain().filter(
      (r) => r.kind === "decision_projected_value",
    );
    expect(projected).toHaveLength(1);
    expect(projected[0]?.requestedByEventType).toBe("EndorsementGranted");
  });

  it("stamps realised_value with OutcomeConfirmed", () => {
    const realised = driveFullChain().filter((r) => r.kind === "realised_value");
    expect(realised).toHaveLength(1);
    expect(realised[0]?.requestedByEventType).toBe("OutcomeConfirmed");
  });

  it("stamps decision_projected_value with AssessmentComputed on deferred resolution", () => {
    let snapshot = base();
    snapshot = ok(
      reduce(
        snapshot,
        event("AssessmentComputed", {
          assessmentId: "assess-1",
          assetId: "K-201",
          valueAtStake: envelope(500_000),
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
        event(
          "DecisionApproved",
          { decisionId: "dec-1", recommendationId: "rec-1" },
          { asOf: LATER },
        ),
      ),
    ).snapshot;
    expect(snapshot.decisionStatus).toBe("approved");

    const resolved = ok(
      reduce(
        snapshot,
        event(
          "AssessmentComputed",
          {
            assessmentId: "assess-2",
            assetId: "K-201",
            valueAtStake: envelope(500_000, LATER),
          },
          { asOf: LATER },
        ),
      ),
    );
    expect(resolved.recomputeRequests).toHaveLength(1);
    expect(resolved.recomputeRequests[0]?.kind).toBe("decision_projected_value");
    expect(resolved.recomputeRequests[0]?.requestedByEventType).toBe(
      "AssessmentComputed",
    );
  });
});
