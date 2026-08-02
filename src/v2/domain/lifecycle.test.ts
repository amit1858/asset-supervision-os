import { describe, expect, it } from "vitest";
import {
  PHASE_ORDER,
  phaseIndex,
  type LifecyclePhase,
  type LifecycleSnapshot,
} from "./lifecycle";

/**
 * Slice 2.1b — phases are ordered and forward-only; status axes are orthogonal
 * to them and are never phases.
 */

describe("LifecyclePhase", () => {
  it("declares exactly the nine approved S1–S9 phases in order", () => {
    expect(PHASE_ORDER).toEqual([
      "SIGNAL_DETECTED",
      "RISK_ASSESSED",
      "DECISION_PROPOSED",
      "DECISION_RECORDED",
      "WORK_PLANNED",
      "MATERIALS_CHECKED",
      "TURNAROUND_SCOPE_RETAINED",
      "EXECUTION_OUTCOME_PENDING",
      "VALUE_VALIDATION_PENDING",
    ]);
    expect(PHASE_ORDER).toHaveLength(9);
  });

  it("does not model evidence, endorsement or outcome validation as phases", () => {
    const forbidden = [
      "EVIDENCE_UNAVAILABLE",
      "PENDING_ENDORSEMENT",
      "OUTCOME_VALIDATED",
    ];
    for (const phase of forbidden) {
      expect(PHASE_ORDER).not.toContain(phase);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(PHASE_ORDER)).toBe(true);
  });

  it("indexes phases strictly monotonically", () => {
    const indices = PHASE_ORDER.map((phase) => phaseIndex(phase));
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("orders every earlier phase before every later phase", () => {
    for (let i = 0; i < PHASE_ORDER.length; i += 1) {
      for (let j = i + 1; j < PHASE_ORDER.length; j += 1) {
        expect(phaseIndex(PHASE_ORDER[i] as LifecyclePhase)).toBeLessThan(
          phaseIndex(PHASE_ORDER[j] as LifecyclePhase),
        );
      }
    }
  });
});

describe("LifecycleSnapshot contract", () => {
  it("retains identity references and never duplicates domain entities", () => {
    const snapshot: LifecycleSnapshot = {
      aggregateId: "agg-1",
      assetId: "K-201",
      phase: "DECISION_RECORDED",
      lastSequence: 7,
      asOf: "2026-07-27T00:00:00.000Z",
      decisionStatus: "recorded",
      assessmentEvidenceQuality: "sufficient",
      operatingState: "nominal",
      outcomeValidationStatus: null,
      latestAssessmentId: "assess-2",
      governingAssessmentId: "assess-2",
      currentRecommendationId: "rec-2",
      currentDecisionId: "dec-1",
      approvalEventId: "evt-5",
      endorsementEventId: "evt-6",
      supersededRecommendationIds: ["rec-1"],
      currentWorkOrderId: null,
      currentTurnaroundScopeId: null,
      currentExecutionId: null,
      currentOutcomeEvidenceRecordId: null,
      currentOutcomeId: null,
      valueAtStake: null,
      projectedValueEmitted: true,
    };

    const keys = Object.keys(snapshot);
    // Only identity strings plus the one governed envelope — no embedded
    // Recommendation, HumanDecision or OperationalOutcome object.
    expect(keys).not.toContain("recommendation");
    expect(keys).not.toContain("decision");
    expect(keys).not.toContain("outcome");
    // Realised value is deliberately not part of derived lifecycle state.
    expect(keys).not.toContain("realisedValue");
    expect(keys).not.toContain("projectedValue");
    // Work-to-outcome chain references are identity pointers only.
    expect(keys).toContain("currentWorkOrderId");
    expect(keys).toContain("currentTurnaroundScopeId");
    expect(keys).toContain("currentExecutionId");
    expect(keys).toContain("currentOutcomeEvidenceRecordId");
    expect(keys).toContain("currentOutcomeId");
    expect(keys).not.toContain("workOrder");
    expect(keys).not.toContain("execution");
    expect(keys).not.toContain("evidence");
  });
});
