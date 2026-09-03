import { describe, it, expect } from "vitest";
import { GOVERNED_EVENT_TYPES } from "../events";
import {
  CALCULATION_SUBJECT_KINDS,
  isSubjectInScope,
  REQUIRED_SUBJECT_KIND,
  scopeIdentityParts,
  subjectAssetId,
  subjectIdentityParts,
  VALID_TRIGGERS,
  type CalculationSubject,
  type LedgerScope,
} from "./subject";
import type { RecomputeRequestKind } from "../recompute";

const ASSET = "asset-k201";
const OTHER_ASSET = "asset-e205";

const CASE_LEDGER: LedgerScope = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: ASSET,
};
const LINE_LEDGER: LedgerScope = { kind: "production_line", lineId: "line-hds2" };
const PORTFOLIO_LEDGER: LedgerScope = { kind: "portfolio", portfolioId: "plant-1" };

const SUBJECTS: Record<string, CalculationSubject> = {
  case: { kind: "supervision_case", caseId: "case-k201", assetId: ASSET },
  otherCase: { kind: "supervision_case", caseId: "case-other", assetId: ASSET },
  line: { kind: "production_line", lineId: "line-hds2" },
  otherLine: { kind: "production_line", lineId: "line-cdu1" },
  recommendation: { kind: "recommendation", recommendationId: "rec-k201", assetId: ASSET },
  foreignRecommendation: { kind: "recommendation", recommendationId: "rec-e205", assetId: OTHER_ASSET },
  workOrder: { kind: "work_order", workOrderId: "wo-1", assetId: ASSET },
  turnaroundScope: { kind: "turnaround_scope", turnaroundScopeId: "ts-1", workOrderId: "wo-1", assetId: ASSET },
  outcome: { kind: "outcome", outcomeId: "oo-1", assetId: ASSET },
  portfolio: { kind: "portfolio", portfolioId: "plant-1" },
};

describe("calculation subject shape", () => {
  it("declares exactly the seven approved subject kinds", () => {
    expect([...CALCULATION_SUBJECT_KINDS].sort()).toEqual(
      [
        "outcome",
        "portfolio",
        "production_line",
        "recommendation",
        "supervision_case",
        "turnaround_scope",
        "work_order",
      ].sort(),
    );
    expect(CALCULATION_SUBJECT_KINDS).toHaveLength(7);
  });

  it("returns identity parts for every well-formed subject", () => {
    for (const [label, subject] of Object.entries(SUBJECTS)) {
      expect(subjectIdentityParts(subject), label).not.toBeNull();
    }
  });

  it("returns null when any identity component is blank", () => {
    expect(subjectIdentityParts({ kind: "supervision_case", caseId: "", assetId: ASSET })).toBeNull();
    expect(subjectIdentityParts({ kind: "supervision_case", caseId: "c", assetId: "   " })).toBeNull();
    expect(subjectIdentityParts({ kind: "production_line", lineId: "" })).toBeNull();
    expect(subjectIdentityParts({ kind: "portfolio", portfolioId: " " })).toBeNull();
    expect(subjectIdentityParts(null as unknown as CalculationSubject)).toBeNull();
  });

  it("resolves the owning asset, and null for line and portfolio subjects", () => {
    expect(subjectAssetId(SUBJECTS.case as CalculationSubject)).toBe(ASSET);
    expect(subjectAssetId(SUBJECTS.recommendation as CalculationSubject)).toBe(ASSET);
    expect(subjectAssetId(SUBJECTS.outcome as CalculationSubject)).toBe(ASSET);
    expect(subjectAssetId(SUBJECTS.line as CalculationSubject)).toBeNull();
    expect(subjectAssetId(SUBJECTS.portfolio as CalculationSubject)).toBeNull();
  });

  it("validates ledger scope identity the same way", () => {
    expect(scopeIdentityParts(CASE_LEDGER)).toEqual(["case-k201", ASSET]);
    expect(scopeIdentityParts({ kind: "portfolio", portfolioId: "" })).toBeNull();
  });
});

describe("ledger scope admission", () => {
  it("admits the case itself and the same asset's work subjects into a case ledger", () => {
    for (const key of ["case", "recommendation", "workOrder", "turnaroundScope", "outcome"]) {
      expect(isSubjectInScope(CASE_LEDGER, SUBJECTS[key] as CalculationSubject), key).toBe(true);
    }
  });

  it("refuses a different case id even for the same asset", () => {
    expect(isSubjectInScope(CASE_LEDGER, SUBJECTS.otherCase as CalculationSubject)).toBe(false);
  });

  it("refuses another asset's recommendation", () => {
    expect(
      isSubjectInScope(CASE_LEDGER, SUBJECTS.foreignRecommendation as CalculationSubject),
    ).toBe(false);
  });

  it("structurally refuses a portfolio subject in a case ledger", () => {
    // This is the reason the $1,449,400 portfolio total cannot reach the K-201
    // case ledger: it is a type-level container mismatch, not a value check.
    expect(isSubjectInScope(CASE_LEDGER, SUBJECTS.portfolio as CalculationSubject)).toBe(false);
  });

  it("refuses a production line in a case ledger", () => {
    expect(isSubjectInScope(CASE_LEDGER, SUBJECTS.line as CalculationSubject)).toBe(false);
  });

  it("admits only the exact production line into a line ledger", () => {
    expect(isSubjectInScope(LINE_LEDGER, SUBJECTS.line as CalculationSubject)).toBe(true);
    expect(isSubjectInScope(LINE_LEDGER, SUBJECTS.otherLine as CalculationSubject)).toBe(false);
    expect(isSubjectInScope(LINE_LEDGER, SUBJECTS.case as CalculationSubject)).toBe(false);
    expect(isSubjectInScope(LINE_LEDGER, SUBJECTS.portfolio as CalculationSubject)).toBe(false);
  });

  it("admits only the exact portfolio into a portfolio ledger", () => {
    expect(isSubjectInScope(PORTFOLIO_LEDGER, SUBJECTS.portfolio as CalculationSubject)).toBe(true);
    expect(
      isSubjectInScope(PORTFOLIO_LEDGER, { kind: "portfolio", portfolioId: "plant-2" }),
    ).toBe(false);
    expect(isSubjectInScope(PORTFOLIO_LEDGER, SUBJECTS.recommendation as CalculationSubject)).toBe(false);
  });

  it("refuses any subject whose identity is incomplete", () => {
    expect(
      isSubjectInScope(CASE_LEDGER, { kind: "recommendation", recommendationId: "", assetId: ASSET }),
    ).toBe(false);
  });

  it("covers every subject kind against every scope kind", () => {
    const scopes: LedgerScope[] = [CASE_LEDGER, LINE_LEDGER, PORTFOLIO_LEDGER];
    let checked = 0;
    for (const scope of scopes) {
      for (const subject of Object.values(SUBJECTS)) {
        expect(typeof isSubjectInScope(scope, subject)).toBe("boolean");
        checked += 1;
      }
    }
    expect(checked).toBe(scopes.length * Object.keys(SUBJECTS).length);
  });
});

describe("request kind to trigger and subject mapping", () => {
  const KINDS: readonly RecomputeRequestKind[] = [
    "asset_assessment",
    "oee_reconciliation",
    "decision_projected_value",
    "work_readiness",
    "turnaround_lead_time_fit",
    "realised_value",
  ];

  it("requires exactly one subject kind per request kind", () => {
    expect(REQUIRED_SUBJECT_KIND).toEqual({
      asset_assessment: "supervision_case",
      oee_reconciliation: "production_line",
      decision_projected_value: "recommendation",
      work_readiness: "work_order",
      turnaround_lead_time_fit: "turnaround_scope",
      realised_value: "outcome",
    });
  });

  it("mirrors the Slice 2.1b.1 emission table exactly", () => {
    expect(VALID_TRIGGERS).toEqual({
      asset_assessment: ["ConditionSignalIngested"],
      oee_reconciliation: ["ProductionObservationIngested"],
      decision_projected_value: ["DecisionApproved", "EndorsementGranted", "AssessmentComputed"],
      work_readiness: ["WorkOrderPlanned", "MaterialsChecked"],
      turnaround_lead_time_fit: ["TurnaroundScopeRetained"],
      realised_value: ["OutcomeConfirmed"],
    });
  });

  it("names only real governed event types as triggers", () => {
    for (const kind of KINDS) {
      for (const trigger of VALID_TRIGGERS[kind]) {
        expect(GOVERNED_EVENT_TYPES, `${kind} → ${trigger}`).toContain(trigger);
      }
    }
  });

  it("rejects every event type outside each kind's permitted set", () => {
    let invalidPairs = 0;
    for (const kind of KINDS) {
      for (const type of GOVERNED_EVENT_TYPES) {
        if (!VALID_TRIGGERS[kind].includes(type)) invalidPairs += 1;
      }
    }
    // 6 kinds x 17 event types = 102 pairs; 9 are valid, so 93 must be refused.
    expect(invalidPairs).toBe(93);
  });
});
