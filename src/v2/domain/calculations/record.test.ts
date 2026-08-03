import { describe, it, expect } from "vitest";
import { makeEnvelope, type ValueEnvelope } from "../envelope";
import { findFormulaSet } from "./formula";
import { calculationIdOf, ledgerScopeKeyOf, requestIdOf, slotKey } from "./identity";
import { makeReferencedOnlyInputSnapshot } from "./inputs";
import {
  isCanonicalInstant,
  isEnvelopeShaped,
  validateOutput,
  validateRecordShape,
  type CalculationOutput,
  type CalculationOutputField,
  type CalculationRecord,
} from "./record";
import type { CalculationSubject, LedgerScope } from "./subject";

const AS_OF = "2026-07-27T00:00:00.000Z";
const EVENT_ID = "evt-1";
const CASE: CalculationSubject = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: "asset-k201",
};
const SCOPE: LedgerScope = {
  kind: "supervision_case",
  caseId: "case-k201",
  assetId: "asset-k201",
};

const INPUTS = makeReferencedOnlyInputSnapshot({
  limitation: "Sensor readings are referenced, not retained.",
  reproductionRequires: "The seeded dataset at the same anchor.",
  references: [{ kind: "asset", id: "asset-k201", description: "K-201" }],
});

function envelope(init: {
  name: string;
  value: number | null;
  provenance: "deterministic" | "statistical";
  formulaVersion: string;
  asOf?: string;
  unavailableReason?: string;
}): ValueEnvelope<number> {
  const base = {
    id: `env-${init.name}`,
    provenance: init.provenance,
    sourceMode: "local" as const,
    freshness: "fresh" as const,
    formulaVersion: init.formulaVersion,
    evidenceIds: ["sensor-k201-vibration"],
    asOf: init.asOf ?? AS_OF,
    producedAt: AS_OF,
    createdByEventId: EVENT_ID,
  };
  return init.value === null
    ? makeEnvelope<number>({
        ...base,
        value: null,
        unavailableReason: init.unavailableReason ?? "no_engine_data",
      })
    : makeEnvelope<number>({ ...base, value: init.value });
}

function assessmentFields(
  overrides: Partial<Record<string, Partial<CalculationOutputField>>> = {},
): CalculationOutputField[] {
  const set = findFormulaSet("asset_assessment", "asset-assessment.v1")!;
  return set.fields.map((definition) => {
    const value =
      definition.name === "healthScore"
        ? 52
        : definition.name === "riskScore"
          ? 68
          : definition.name === "timeToCriticalDays"
            ? 17.929375879868676
            : 1620155.9999999995;
    const field: CalculationOutputField = {
      name: definition.name,
      formula: definition.formula,
      valueStatus: definition.valueStatus,
      envelope: envelope({
        name: definition.name,
        value,
        provenance: definition.provenance as "deterministic" | "statistical",
        formulaVersion: definition.formula.version,
      }),
    };
    return { ...field, ...(overrides[definition.name] ?? {}) };
  });
}

function record(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  const requestId = requestIdOf("asset_assessment", CASE, EVENT_ID);
  const base: CalculationRecord = {
    calculationId: calculationIdOf(requestId, "asset-assessment.v1"),
    requestId,
    slot: slotKey("asset_assessment", CASE),
    ledgerScopeKey: ledgerScopeKeyOf(SCOPE),
    subject: CASE,
    sequence: 1,
    kind: "asset_assessment",
    requestedByEventId: EVENT_ID,
    requestedByEventType: "ConditionSignalIngested",
    asOf: AS_OF,
    formulaSetVersion: "asset-assessment.v1",
    inputs: INPUTS,
    output: { outcome: "produced", fields: assessmentFields() },
    supersedesCalculationId: null,
  };
  return { ...base, ...overrides };
}

describe("canonical instant", () => {
  it("accepts a canonical millisecond UTC instant", () => {
    expect(isCanonicalInstant(AS_OF)).toBe(true);
  });

  it("rejects offsets, second precision, invalid dates and non-strings", () => {
    expect(isCanonicalInstant("2026-07-27T00:00:00Z")).toBe(false);
    expect(isCanonicalInstant("2026-07-27T00:00:00.000+01:00")).toBe(false);
    expect(isCanonicalInstant("2026-02-31T00:00:00.000Z")).toBe(false);
    expect(isCanonicalInstant(1)).toBe(false);
  });
});

describe("envelope shape guard", () => {
  it("accepts a governed available and unavailable envelope", () => {
    expect(
      isEnvelopeShaped(
        envelope({ name: "x", value: 1, provenance: "deterministic", formulaVersion: "v1" }),
      ),
    ).toBe(true);
    expect(
      isEnvelopeShaped(
        envelope({ name: "x", value: null, provenance: "deterministic", formulaVersion: "v1" }),
      ),
    ).toBe(true);
  });

  it("rejects an unavailable envelope with no reason and an available one with no value", () => {
    expect(
      isEnvelopeShaped({
        id: "e",
        version: 1,
        status: "unavailable",
        value: null,
        unavailableReason: "  ",
        provenance: "deterministic",
        sourceMode: "seeded",
        freshness: "fresh",
        formulaVersion: "v1",
        evidenceIds: [],
        asOf: AS_OF,
      }),
    ).toBe(false);
    expect(
      isEnvelopeShaped({
        id: "e",
        version: 1,
        status: "available",
        value: null,
        provenance: "deterministic",
        sourceMode: "seeded",
        freshness: "fresh",
        formulaVersion: "v1",
        evidenceIds: [],
        asOf: AS_OF,
      }),
    ).toBe(false);
  });
});

describe("record shape validation", () => {
  it("accepts a well-formed record", () => {
    expect(validateRecordShape(record())).toBeNull();
  });

  it("requires every identity field to be non-empty", () => {
    for (const key of [
      "calculationId",
      "requestId",
      "slot",
      "ledgerScopeKey",
      "requestedByEventId",
      "requestedByEventType",
      "formulaSetVersion",
    ]) {
      const failure = validateRecordShape(record({ [key]: "  " } as never));
      expect(failure?.reason, key).toBe("malformed_calculation");
    }
  });

  it("rejects a non-canonical asOf", () => {
    expect(validateRecordShape(record({ asOf: "2026-07-27" }))!.reason).toBe("invalid_timestamp");
  });

  it("rejects a non-positive or fractional sequence", () => {
    expect(validateRecordShape(record({ sequence: 0 }))!.reason).toBe("invalid_sequence");
    expect(validateRecordShape(record({ sequence: 1.5 }))!.reason).toBe("invalid_sequence");
  });

  it("rejects a blank supersession pointer but allows null", () => {
    expect(validateRecordShape(record({ supersedesCalculationId: " " }))!.reason).toBe(
      "invalid_supersession",
    );
    expect(validateRecordShape(record({ supersedesCalculationId: null }))).toBeNull();
  });

  it("rejects an invalid input snapshot", () => {
    expect(validateRecordShape(record({ inputs: { references: [] } as never }))!.reason).toBe(
      "invalid_input_snapshot",
    );
  });
});

describe("output validation against the formula registry", () => {
  it("accepts the full registered assessment field set", () => {
    expect(validateOutput(record())).toBeNull();
  });

  it("rejects an unregistered formula set version", () => {
    expect(
      validateOutput(record({ formulaSetVersion: "asset-assessment.v2" }))!.reason,
    ).toBe("formula_set_not_registered");
  });

  it("rejects a field that is not registered in the set", () => {
    const fields = [
      ...assessmentFields(),
      {
        name: "inventedScore",
        formula: { family: "asset_risk", version: "risk.v1", engineEntryPoint: "@/engines/risk" },
        valueStatus: null,
        envelope: envelope({
          name: "inventedScore",
          value: 1,
          provenance: "deterministic",
          formulaVersion: "risk.v1",
        }),
      } as CalculationOutputField,
    ];
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_field_mismatch");
  });

  it("rejects a partial produced field set", () => {
    const fields = assessmentFields().slice(0, 2);
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_field_mismatch");
  });

  it("rejects a duplicated field name", () => {
    const fields = assessmentFields();
    const first = fields[0] as CalculationOutputField;
    expect(
      validateOutput(record({ output: { outcome: "produced", fields: [...fields, first] } }))!
        .reason,
    ).toBe("formula_field_mismatch");
  });

  it("rejects a relabelled formula family", () => {
    const fields = assessmentFields({
      riskScore: {
        formula: { family: "asset_health", version: "risk.v1", engineEntryPoint: "@/engines/risk" },
      },
    });
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_field_mismatch");
  });

  it("rejects a formula version that disagrees with the registry", () => {
    const fields = assessmentFields();
    const risk = fields[1] as CalculationOutputField;
    fields[1] = {
      ...risk,
      formula: { ...risk.formula, version: "risk.v9" },
      envelope: envelope({
        name: "riskScore",
        value: 68,
        provenance: "deterministic",
        formulaVersion: "risk.v9",
      }),
    };
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_version_mismatch");
  });

  it("rejects an envelope whose formulaVersion disagrees with the field formula", () => {
    const fields = assessmentFields();
    const risk = fields[1] as CalculationOutputField;
    fields[1] = {
      ...risk,
      envelope: envelope({
        name: "riskScore",
        value: 68,
        provenance: "deterministic",
        formulaVersion: "mismatched.v1",
      }),
    };
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_version_mismatch");
  });

  it("rejects an envelope asOf that differs from the calculation asOf", () => {
    const fields = assessmentFields();
    const health = fields[0] as CalculationOutputField;
    fields[0] = {
      ...health,
      envelope: envelope({
        name: "healthScore",
        value: 52,
        provenance: "deterministic",
        formulaVersion: health.formula.version,
        asOf: "2026-07-26T00:00:00.000Z",
      }),
    };
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("envelope_as_of_mismatch");
  });

  it("refuses to relabel the statistical prediction as a deterministic calculation", () => {
    const fields = assessmentFields();
    const ttc = fields[2] as CalculationOutputField;
    fields[2] = {
      ...ttc,
      envelope: envelope({
        name: "timeToCriticalDays",
        value: 17.929375879868676,
        provenance: "deterministic",
        formulaVersion: ttc.formula.version,
      }),
    };
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_field_mismatch");
  });

  it("refuses to promote value at stake into the value-realisation lifecycle", () => {
    const fields = assessmentFields({ valueAtStakeUsd: { valueStatus: "realised" } });
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("formula_field_mismatch");
  });

  it("permits an individually unavailable field inside a produced result", () => {
    const fields = assessmentFields();
    const ttc = fields[2] as CalculationOutputField;
    fields[2] = {
      ...ttc,
      valueStatus: null,
      envelope: envelope({
        name: "timeToCriticalDays",
        value: null,
        provenance: "statistical",
        formulaVersion: ttc.formula.version,
        unavailableReason: "no_projected_failure_within_horizon",
      }),
    };
    expect(validateOutput(record({ output: { outcome: "produced", fields } }))).toBeNull();
  });

  it("requires at least one available field in a produced result", () => {
    const set = findFormulaSet("asset_assessment", "asset-assessment.v1")!;
    const fields = set.fields.map<CalculationOutputField>((definition) => ({
      name: definition.name,
      formula: definition.formula,
      valueStatus: null,
      envelope: envelope({
        name: definition.name,
        value: null,
        provenance: definition.provenance as "deterministic" | "statistical",
        formulaVersion: definition.formula.version,
      }),
    }));
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("malformed_engine_output");
  });

  it("never lets an unavailable calculation carry an available envelope", () => {
    const output: CalculationOutput = {
      outcome: "unavailable",
      unavailableReason: "no_governed_assessment_engine_for_asset",
      fields: assessmentFields(),
    };
    expect(validateOutput(record({ output }))!.reason).toBe("malformed_engine_output");
  });

  it("requires a non-empty reason on an unavailable calculation", () => {
    expect(
      validateOutput(
        record({ output: { outcome: "unavailable", unavailableReason: " ", fields: [] } }),
      )!.reason,
    ).toBe("malformed_calculation");
  });

  it("requires a reason and detail on a failed calculation", () => {
    expect(
      validateOutput(
        record({ output: { outcome: "failed", failureReason: "engine_execution_failed", detail: "boom" } }),
      ),
    ).toBeNull();
    expect(
      validateOutput(record({ output: { outcome: "failed", failureReason: "", detail: "" } }))!.reason,
    ).toBe("malformed_calculation");
  });

  it("rejects an unknown outcome and a missing output", () => {
    expect(validateOutput(record({ output: { outcome: "maybe" } as never }))!.reason).toBe(
      "malformed_calculation",
    );
    expect(validateOutput(record({ output: null as never }))!.reason).toBe("malformed_calculation");
  });

  it("rejects a malformed field object and a non-envelope", () => {
    expect(
      validateOutput(record({ output: { outcome: "produced", fields: [{} as never] } }))!.reason,
    ).toBe("malformed_engine_output");
    const fields = assessmentFields();
    fields[0] = { ...(fields[0] as CalculationOutputField), envelope: {} as never };
    expect(
      validateOutput(record({ output: { outcome: "produced", fields } }))!.reason,
    ).toBe("invalid_envelope");
  });
});
