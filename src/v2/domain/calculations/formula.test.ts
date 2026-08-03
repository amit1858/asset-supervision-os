import { describe, it, expect } from "vitest";
import { trustFromProvenance } from "../trust";
import { FRESHNESS_WINDOWS_MS } from "../policy/freshness";
import {
  DEFAULT_FORMULA_SET_VERSION,
  findFormulaSet,
  formulaFieldDefinition,
  FORMULA_SETS,
  isFormulaReference,
} from "./formula";
import type { RecomputeRequestKind } from "../recompute";

const KINDS: readonly RecomputeRequestKind[] = [
  "asset_assessment",
  "oee_reconciliation",
  "decision_projected_value",
  "work_readiness",
  "turnaround_lead_time_fit",
  "realised_value",
];

describe("formula registry coverage", () => {
  it("registers a formula set for every request kind", () => {
    for (const kind of KINDS) {
      expect(FORMULA_SETS[kind].length, kind).toBeGreaterThan(0);
      expect(findFormulaSet(kind, DEFAULT_FORMULA_SET_VERSION[kind]), kind).not.toBeNull();
    }
  });

  it("returns null for an unregistered formula set version", () => {
    expect(findFormulaSet("asset_assessment", "asset-assessment.v99")).toBeNull();
    expect(findFormulaSet("asset_assessment", "")).toBeNull();
  });

  it("binds every set to its own kind", () => {
    for (const kind of KINDS) {
      for (const set of FORMULA_SETS[kind]) {
        expect(set.kind, set.formulaSetVersion).toBe(kind);
      }
    }
  });

  it("names a real engine entry point and a governed freshness class for every field", () => {
    for (const kind of KINDS) {
      for (const set of FORMULA_SETS[kind]) {
        for (const field of set.fields) {
          expect(isFormulaReference(field.formula), field.name).toBe(true);
          expect(field.formula.engineEntryPoint, field.name).toMatch(/^@\/(engines|data)\//);
          expect(Object.keys(FRESHNESS_WINDOWS_MS), field.name).toContain(field.freshnessClass);
        }
      }
    }
  });

  it("keeps field names unique inside a set", () => {
    for (const kind of KINDS) {
      for (const set of FORMULA_SETS[kind]) {
        const names = set.fields.map((f) => f.name);
        expect(new Set(names).size, set.formulaSetVersion).toBe(names.length);
      }
    }
  });

  it("is frozen, so a caller cannot register a formula at runtime", () => {
    expect(Object.isFrozen(FORMULA_SETS)).toBe(true);
    expect(Object.isFrozen(FORMULA_SETS.asset_assessment)).toBe(true);
    expect(Object.isFrozen(FORMULA_SETS.asset_assessment[0])).toBe(true);
  });
});

describe("asset assessment formula set", () => {
  const set = findFormulaSet("asset_assessment", "asset-assessment.v1")!;

  it("declares exactly health, risk, time-to-critical and value at stake", () => {
    expect(set.fields.map((f) => f.name)).toEqual([
      "healthScore",
      "riskScore",
      "timeToCriticalDays",
      "valueAtStakeUsd",
    ]);
  });

  it("classifies time-to-critical as a statistical PREDICTION", () => {
    const ttc = formulaFieldDefinition(set, "timeToCriticalDays")!;
    expect(ttc.provenance).toBe("statistical");
    expect(trustFromProvenance(ttc.provenance)).toBe("prediction");
    expect(ttc.formula.family).toBe("time_to_critical");
  });

  it("keeps health, risk and value at stake deterministic calculations", () => {
    for (const name of ["healthScore", "riskScore", "valueAtStakeUsd"]) {
      const field = formulaFieldDefinition(set, name)!;
      expect(field.provenance, name).toBe("deterministic");
      expect(trustFromProvenance(field.provenance), name).toBe("deterministic_calculation");
    }
  });

  it("gives value at stake no value-realisation status", () => {
    // The existing `ValueStatus` union is `projected | validated | realised` —
    // the value-REALISATION lifecycle. Value at stake is exposure under
    // decision, not enabled value, and has no member to map onto.
    expect(formulaFieldDefinition(set, "valueAtStakeUsd")!.valueStatus).toBeNull();
  });

  it("gives health, risk and time-to-critical no value-realisation status", () => {
    for (const name of ["healthScore", "riskScore", "timeToCriticalDays"]) {
      expect(formulaFieldDefinition(set, name)!.valueStatus, name).toBeNull();
    }
  });
});

describe("oee, projected value and realised value formula sets", () => {
  it("keeps every OEE field deterministic with no value status", () => {
    const set = findFormulaSet("oee_reconciliation", "oee-reconciliation.v1")!;
    expect(set.fields).toHaveLength(7);
    for (const field of set.fields) {
      expect(field.provenance, field.name).toBe("deterministic");
      expect(field.valueStatus, field.name).toBeNull();
      expect(["oee", "oee_loss"], field.name).toContain(field.formula.family);
    }
  });

  it("marks projected value with the existing projected status", () => {
    const set = findFormulaSet("decision_projected_value", "projected-value.v1")!;
    const field = formulaFieldDefinition(set, "projectedValueEnabledUsd")!;
    expect(field.valueStatus).toBe("projected");
    expect(field.provenance).toBe("deterministic");
    expect(trustFromProvenance(field.provenance)).toBe("deterministic_calculation");
  });

  it("marks realised value with the existing realised status", () => {
    const set = findFormulaSet("realised_value", "realised-value.v1")!;
    const field = formulaFieldDefinition(set, "realisedValueUsd")!;
    expect(field.valueStatus).toBe("realised");
  });

  it("uses only members of the existing ValueStatus union", () => {
    for (const kind of KINDS) {
      for (const set of FORMULA_SETS[kind]) {
        for (const field of set.fields) {
          expect([null, "projected", "validated", "realised"], field.name).toContain(
            field.valueStatus,
          );
        }
      }
    }
  });
});

describe("deferred engines", () => {
  it("registers field-less sets for work readiness and lead-time fit", () => {
    const readiness = findFormulaSet("work_readiness", "work-readiness.deferred.v1")!;
    const fit = findFormulaSet("turnaround_lead_time_fit", "turnaround-lead-time-fit.deferred.v1")!;
    expect(readiness.fields).toHaveLength(0);
    expect(fit.fields).toHaveLength(0);
  });

  it("names the deferring slice in both versions", () => {
    expect(DEFAULT_FORMULA_SET_VERSION.work_readiness).toContain("deferred");
    expect(DEFAULT_FORMULA_SET_VERSION.turnaround_lead_time_fit).toContain("deferred");
  });

  it("registers no field that could carry a readiness or fit verdict", () => {
    for (const kind of ["work_readiness", "turnaround_lead_time_fit"] as const) {
      for (const set of FORMULA_SETS[kind]) {
        expect(set.fields, kind).toHaveLength(0);
      }
    }
  });
});

describe("formula reference guard", () => {
  it("accepts a complete reference and rejects partial ones", () => {
    expect(isFormulaReference({ family: "oee", version: "v", engineEntryPoint: "e" })).toBe(true);
    expect(isFormulaReference({ family: "oee", version: "v" })).toBe(false);
    expect(isFormulaReference(null)).toBe(false);
    expect(isFormulaReference("oee")).toBe(false);
  });
});
