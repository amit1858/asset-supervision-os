import { beforeEach, describe, it, expect } from "vitest";
import type { RecomputeRequest } from "../recompute";
import { executeRecompute } from "./execute";
import {
  FAILURE_ENGINE_THREW,
  UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET,
  UNAVAILABLE_NO_ENGINE_DATA,
  UNAVAILABLE_NO_VALIDATED_OUTCOME,
} from "./failure";
import { slotKey } from "./identity";
import {
  createLedger,
  latestAttempt,
  latestProduced,
  type CalculationLedger,
} from "./ledger";
import type {
  AssetAssessmentResult,
  EngineEvidence,
  EnginePort,
  OutcomeRealisedValueResult,
  ProductionOeeResult,
  ProjectedValueResult,
  TurnaroundLeadTimeEvidence,
  WorkOrderMaterialsEvidence,
} from "./port";
import type { CalculationOutputField } from "./record";
import type { CalculationSubject, LedgerScope } from "./subject";

const AS_OF = "2026-07-27T00:00:00.000Z";
const ASSET = "asset-k201";
const CASE: CalculationSubject = { kind: "supervision_case", caseId: "case-k201", assetId: ASSET };
const REC: CalculationSubject = {
  kind: "recommendation",
  recommendationId: "rec-k201",
  assetId: ASSET,
};
const OUTCOME: CalculationSubject = { kind: "outcome", outcomeId: "oo-k201", assetId: ASSET };
const WORK_ORDER: CalculationSubject = { kind: "work_order", workOrderId: "wo-1", assetId: ASSET };
const TURNAROUND: CalculationSubject = {
  kind: "turnaround_scope",
  turnaroundScopeId: "ts-1",
  workOrderId: "wo-2",
  assetId: ASSET,
};
const LINE: CalculationSubject = { kind: "production_line", lineId: "line-hds2" };

const SCOPE: LedgerScope = { kind: "supervision_case", caseId: "case-k201", assetId: ASSET };
const LINE_SCOPE: LedgerScope = { kind: "production_line", lineId: "line-hds2" };

const EVIDENCE: EngineEvidence = {
  sourceKey: "local_seed",
  sourceMode: "local",
  capturedAt: "2026-07-27T00:00:00.000Z",
  evidenceIds: ["sensor-k201-vibration"],
};

interface PortOverrides {
  assess?: AssetAssessmentResult | null;
  oee?: ProductionOeeResult | null;
  projected?: ProjectedValueResult | null;
  realised?: OutcomeRealisedValueResult | null;
  materials?: WorkOrderMaterialsEvidence | null;
  turnaround?: TurnaroundLeadTimeEvidence | null;
  throwOn?: keyof EnginePort;
  throwNonError?: boolean;
}

let portCalls: string[] = [];

function fakePort(overrides: PortOverrides = {}): EnginePort {
  const guard = <T>(name: keyof EnginePort, produce: () => T): T => {
    portCalls.push(name);
    if (overrides.throwOn === name) {
      if (overrides.throwNonError) throw "engine exploded";
      throw new Error("engine exploded");
    }
    return produce();
  };
  return {
    datasetMetadata: () => ({
      datasetId: "seed-20260727",
      seed: 20260727,
      anchorNow: AS_OF,
      historyDays: 90,
      trendWindowDays: 30,
      productionLineId: "line-hds2",
      sourceMode: "local",
    }),
    assessAsset: (assetId) =>
      guard("assessAsset", () =>
        overrides.assess !== undefined
          ? overrides.assess
          : {
              assetId,
              assetTag: "K-201",
              healthScore: 52,
              riskScore: 68,
              projectedDaysToCritical: 17.929375879868676,
              valueAtStakeUsd: 1620155.9999999995,
              evidence: EVIDENCE,
            },
      ),
    reconcileProductionLine: (lineId) =>
      guard("reconcileProductionLine", () =>
        overrides.oee !== undefined
          ? overrides.oee
          : {
              lineId,
              oee: 91.2,
              availability: 97.9,
              performance: 93.9,
              quality: 99.1,
              availabilityLossUnits: 10,
              performanceLossUnits: 20,
              qualityLossUnits: 5,
              evidence: EVIDENCE,
            },
      ),
    projectRecommendationValue: (recommendationId, assetId) =>
      guard("projectRecommendationValue", () =>
        overrides.projected !== undefined
          ? overrides.projected
          : {
              recommendationId,
              assetId,
              projectedValueEnabledUsd: 1094400,
              evidence: EVIDENCE,
            },
      ),
    realisedValueForOutcome: (outcomeId, assetId) =>
      guard("realisedValueForOutcome", () =>
        overrides.realised !== undefined
          ? overrides.realised
          : {
              outcomeId,
              assetId,
              available: false,
              realisedValueUsd: null,
              unavailableReason: UNAVAILABLE_NO_VALIDATED_OUTCOME,
              evidence: EVIDENCE,
            },
      ),
    workOrderMaterialsEvidence: () =>
      guard("workOrderMaterialsEvidence", () =>
        overrides.materials !== undefined ? overrides.materials : null,
      ),
    turnaroundLeadTimeEvidence: () =>
      guard("turnaroundLeadTimeEvidence", () =>
        overrides.turnaround !== undefined ? overrides.turnaround : null,
      ),
  };
}

function request(overrides: Partial<RecomputeRequest> = {}): RecomputeRequest {
  return {
    kind: "asset_assessment",
    assetId: ASSET,
    requestedByEventId: "evt-1",
    requestedByEventType: "ConditionSignalIngested",
    asOf: AS_OF,
    ...overrides,
  } as RecomputeRequest;
}

function fieldOf(
  ledger: CalculationLedger,
  slot: string,
  name: string,
): CalculationOutputField | null {
  const record = latestAttempt(ledger, slot);
  if (!record || record.output.outcome === "failed") return null;
  return record.output.fields.find((f) => f.name === name) ?? null;
}

beforeEach(() => {
  portCalls = [];
});

describe("request admissibility is decided before any engine call", () => {
  const cases: Array<[string, Partial<RecomputeRequest>, CalculationSubject, string]> = [
    ["an unknown kind", { kind: "guesswork" as never }, CASE, "unknown_calculation_kind"],
    ["a blank triggering event id", { requestedByEventId: " " }, CASE, "malformed_calculation"],
    ["a non-canonical asOf", { asOf: "2026-07-27" }, CASE, "invalid_timestamp"],
    [
      "an event type that cannot emit the kind",
      { requestedByEventType: "OutcomeConfirmed" as never },
      CASE,
      "recompute_trigger_mismatch",
    ],
    ["a subject of the wrong kind", {}, REC, "calculation_subject_kind_mismatch"],
    [
      "a subject belonging to another asset",
      { assetId: "asset-e205" },
      CASE,
      "request_subject_asset_mismatch",
    ],
  ];

  for (const [label, overrides, subject, reason] of cases) {
    it(`rejects ${label} without invoking the port`, () => {
      const result = executeRecompute(createLedger(SCOPE), request(overrides), subject, fakePort());
      expect(result.outcome).toBe("rejected");
      if (result.outcome !== "rejected") throw new Error("unreachable");
      expect(result.reason).toBe(reason);
      expect(portCalls).toEqual([]);
      expect(result.ledger.records).toHaveLength(0);
    });
  }

  it("rejects a subject with a blank identity component before the port", () => {
    const subject = { kind: "supervision_case", caseId: " ", assetId: ASSET } as CalculationSubject;
    const result = executeRecompute(createLedger(SCOPE), request(), subject, fakePort());
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("missing_subject_identity");
    expect(portCalls).toEqual([]);
  });

  it("rejects an out-of-scope subject before the port", () => {
    const result = executeRecompute(
      createLedger(LINE_SCOPE),
      request(),
      CASE,
      fakePort(),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("subject_out_of_ledger_scope");
    expect(portCalls).toEqual([]);
  });

  it("throws GovernedIntegrityError on a forged ledger before the port", () => {
    expect(() =>
      executeRecompute({ records: [] } as never, request(), CASE, fakePort()),
    ).toThrow();
    expect(portCalls).toEqual([]);
  });

  it("validates every valid trigger for decision_projected_value", () => {
    for (const type of ["DecisionApproved", "EndorsementGranted", "AssessmentComputed"] as const) {
      const result = executeRecompute(
        createLedger(SCOPE),
        request({
          kind: "decision_projected_value",
          requestedByEventType: type,
          requestedByEventId: `evt-${type}`,
        }),
        REC,
        fakePort(),
      );
      expect(result.outcome, type).toBe("accepted");
    }
  });
});

describe("asset assessment execution", () => {
  it("delegates to the engine and records the engine's exact numbers", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    expect(result.outcome).toBe("accepted");
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(portCalls).toEqual(["assessAsset"]);

    const slot = slotKey("asset_assessment", CASE);
    expect(fieldOf(result.ledger, slot, "riskScore")?.envelope.value).toBe(68);
    expect(fieldOf(result.ledger, slot, "healthScore")?.envelope.value).toBe(52);
    expect(fieldOf(result.ledger, slot, "timeToCriticalDays")?.envelope.value).toBe(
      17.929375879868676,
    );
    expect(fieldOf(result.ledger, slot, "valueAtStakeUsd")?.envelope.value).toBe(
      1620155.9999999995,
    );
  });

  it("classifies time-to-critical as a statistical prediction and the rest as deterministic", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const slot = slotKey("asset_assessment", CASE);
    const ttc = fieldOf(result.ledger, slot, "timeToCriticalDays")!;
    expect(ttc.envelope.provenance).toBe("statistical");
    expect(ttc.envelope.trustClassification).toBe("prediction");
    for (const name of ["healthScore", "riskScore", "valueAtStakeUsd"]) {
      const field = fieldOf(result.ledger, slot, name)!;
      expect(field.envelope.provenance, name).toBe("deterministic");
      expect(field.envelope.trustClassification, name).toBe("deterministic_calculation");
    }
  });

  it("keeps value at stake outside the value-realisation lifecycle", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const slot = slotKey("asset_assessment", CASE);
    expect(fieldOf(result.ledger, slot, "valueAtStakeUsd")?.valueStatus).toBeNull();
  });

  it("records an unavailable field rather than zero when the engine has no projection", () => {
    const port = fakePort({
      assess: {
        assetId: ASSET,
        assetTag: "K-201",
        healthScore: 52,
        riskScore: 68,
        projectedDaysToCritical: null,
        valueAtStakeUsd: 1620155.9999999995,
        evidence: EVIDENCE,
      },
    });
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, port);
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const slot = slotKey("asset_assessment", CASE);
    const ttc = fieldOf(result.ledger, slot, "timeToCriticalDays")!;
    expect(ttc.envelope.status).toBe("unavailable");
    expect(ttc.envelope.value).toBeNull();
    expect(ttc.envelope.value).not.toBe(0);
    expect(ttc.valueStatus).toBeNull();
    expect(result.record.output.outcome).toBe("produced");
  });

  it("records an explicit unavailable calculation for a non-K-201 asset", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort({ assess: null }));
    expect(result.outcome).toBe("accepted");
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("unavailable");
    if (result.record.output.outcome !== "unavailable") throw new Error("unreachable");
    expect(result.record.output.unavailableReason).toBe(
      UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET,
    );
    for (const field of result.record.output.fields) {
      expect(field.envelope.status, field.name).toBe("unavailable");
      expect(field.envelope.value, field.name).toBeNull();
      expect(field.valueStatus, field.name).toBeNull();
    }
  });
});

describe("oee reconciliation", () => {
  it("records all seven registered OEE fields and proposes no lifecycle event", () => {
    const result = executeRecompute(
      createLedger(LINE_SCOPE),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      LINE,
      fakePort(),
    );
    expect(result.outcome).toBe("accepted");
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    expect(result.record.output.fields).toHaveLength(7);
    expect(result.proposedEvents).toEqual([]);
  });

  it("never emits a proposal even from a case-scoped ledger", () => {
    // OEE is line-scoped, so it cannot even enter a case ledger.
    const result = executeRecompute(
      createLedger(SCOPE),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      LINE,
      fakePort(),
    );
    expect(result.outcome).toBe("rejected");
    expect(result.proposedEvents).toEqual([]);
  });
});

describe("projected value stays K-201 scoped", () => {
  it("records only this recommendation's projected value", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "decision_projected_value", requestedByEventType: "DecisionApproved" }),
      REC,
      fakePort(),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    expect(result.record.output.fields).toHaveLength(1);
    expect(result.record.output.fields[0]?.envelope.value).toBe(1094400);
    expect(result.record.output.fields[0]?.valueStatus).toBe("projected");
  });

  it("never writes the portfolio total into the case ledger", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "decision_projected_value", requestedByEventType: "DecisionApproved" }),
      REC,
      fakePort(),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const serialised = JSON.stringify(result.record);
    expect(serialised).not.toContain("1449400");
    expect(serialised).not.toContain("1458140");
  });

  it("refuses a portfolio subject in the case ledger, so no portfolio record can exist", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "decision_projected_value", requestedByEventType: "DecisionApproved" }),
      { kind: "portfolio", portfolioId: "plant-1" },
      fakePort(),
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("calculation_subject_kind_mismatch");
  });

  it("emits no lifecycle proposal for projected value", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "decision_projected_value", requestedByEventType: "DecisionApproved" }),
      REC,
      fakePort(),
    );
    expect(result.proposedEvents).toEqual([]);
  });
});

describe("governed work readiness and turnaround lead-time fit consult the port", () => {
  it("records work readiness as unavailable when the port has no work-order evidence", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "work_readiness", requestedByEventType: "WorkOrderPlanned" }),
      WORK_ORDER,
      fakePort(),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(portCalls).toEqual(["workOrderMaterialsEvidence"]);
    expect(result.record.output.outcome).toBe("unavailable");
    if (result.record.output.outcome !== "unavailable") throw new Error("unreachable");
    expect(result.record.output.unavailableReason).toBe(UNAVAILABLE_NO_ENGINE_DATA);
    expect(result.record.output.fields).toHaveLength(11);
    for (const field of result.record.output.fields) {
      expect(field.envelope.status, field.name).toBe("unavailable");
      expect(field.valueStatus, field.name).toBeNull();
    }
  });

  it("produces the eleven governed materials fields from raw work-order evidence", () => {
    const port = fakePort({
      materials: {
        workOrderId: "wo-1",
        assetId: ASSET,
        requiredSpareIds: ["sp-brg"],
        spareBalances: [
          {
            spareId: "sp-brg",
            hasSparePart: true,
            hasBalance: true,
            onHandQty: 1,
            reservedQty: 0,
            reorderPoint: 1,
          },
        ],
        evidence: {
          sourceKey: "inventory",
          sourceMode: "local",
          capturedAt: "2026-07-27T06:00:00.000Z",
          evidenceIds: ["wo-1", "sp-brg", "inv-brg"],
        },
      },
    });
    const result = executeRecompute(
      createLedger(SCOPE),
      request({
        kind: "work_readiness",
        requestedByEventType: "MaterialsChecked",
        asOf: "2026-07-27T12:00:00.000Z",
      }),
      WORK_ORDER,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("produced");
    const slot = slotKey("work_readiness", WORK_ORDER);
    expect(fieldOf(result.ledger, slot, "requiredSpareLineCount")?.envelope.value).toBe(1);
    expect(fieldOf(result.ledger, slot, "totalRequiredQty")?.envelope.value).toBe(1);
    expect(fieldOf(result.ledger, slot, "totalShortageQty")?.envelope.value).toBe(0);
    expect(fieldOf(result.ledger, slot, "totalAvailableUnreservedQty")?.envelope.value).toBe(1);
    expect(
      fieldOf(result.ledger, slot, "postAllocationBufferToReorderPoint")?.envelope.value,
    ).toBe(-1);
    expect(fieldOf(result.ledger, slot, "minimumCoverageRatio")?.envelope.value).toBe(1);
    for (const name of [
      "engineeringReadinessGoverned",
      "labourReadinessGoverned",
      "permitsReadinessGoverned",
    ]) {
      expect(fieldOf(result.ledger, slot, name)?.envelope.status, name).toBe("unavailable");
      expect(fieldOf(result.ledger, slot, name)?.envelope.value, name).toBeNull();
    }
  });

  it("stamps the work-readiness record with the governed cardinality policy, and replays it deterministically", () => {
    const materials = {
      workOrderId: "wo-1",
      assetId: ASSET,
      requiredSpareIds: ["sp-brg"],
      spareBalances: [
        {
          spareId: "sp-brg",
          hasSparePart: true,
          hasBalance: true,
          onHandQty: 1,
          reservedQty: 0,
          reorderPoint: 1,
        },
      ],
      evidence: {
        sourceKey: "inventory" as const,
        sourceMode: "local" as const,
        capturedAt: "2026-07-27T06:00:00.000Z",
        evidenceIds: ["wo-1", "sp-brg", "inv-brg"],
      },
    };
    const run = () =>
      executeRecompute(
        createLedger(SCOPE),
        request({
          kind: "work_readiness",
          requestedByEventType: "MaterialsChecked",
          asOf: "2026-07-27T12:00:00.000Z",
        }),
        WORK_ORDER,
        fakePort({ materials }),
      );

    const result = run();
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const inputs = result.record.inputs;
    if (inputs.reproducibility !== "referenced_only") throw new Error("unreachable");

    const constantRef = inputs.references.find((r) => r.kind === "constant");
    expect(constantRef).toBeDefined();
    expect(constantRef!.id).toBe("required-spare-cardinality.v1");
    expect(constantRef!.description.toLowerCase()).toContain("one required unit");
    expect(inputs.cardinalityPolicyVersion).toBe("required-spare-cardinality.v1");

    // Identical policy version and evidence replay to a byte-identical record.
    const replay = run();
    if (replay.outcome !== "accepted") throw new Error("unreachable");
    expect(replay.record.calculationId).toBe(result.record.calculationId);
    expect(JSON.stringify(replay.record.inputs)).toBe(JSON.stringify(result.record.inputs));
  });

  it("stamps no cardinality policy on an unrelated calculation kind", () => {
    const port = fakePort({
      turnaround: {
        turnaroundScopeId: "wp-k201",
        workOrderId: "wo-2",
        assetId: ASSET,
        requiredSpareIds: ["sp-seal"],
        spareLeadTimes: [{ spareId: "sp-seal", leadTimeDays: 35 }],
        turnaroundStartIso: "2026-10-23T00:00:00.000Z",
        evidence: {
          sourceKey: "turnaround_scheduling",
          sourceMode: "local",
          capturedAt: "2026-07-27T06:00:00.000Z",
          evidenceIds: ["wp-k201", "ta-1", "wo-2", "sp-seal"],
        },
      },
    });
    const result = executeRecompute(
      createLedger(SCOPE),
      request({
        kind: "turnaround_lead_time_fit",
        requestedByEventType: "TurnaroundScopeRetained",
        asOf: "2026-07-27T12:00:00.000Z",
      }),
      TURNAROUND,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const inputs = result.record.inputs;
    if (inputs.reproducibility !== "referenced_only") throw new Error("unreachable");
    expect(inputs.references.some((r) => r.kind === "constant")).toBe(false);
    expect(inputs.cardinalityPolicyVersion).toBeUndefined();
  });

  it("records turnaround lead-time fit as unavailable when the port has no scope evidence", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({
        kind: "turnaround_lead_time_fit",
        requestedByEventType: "TurnaroundScopeRetained",
      }),
      TURNAROUND,
      fakePort(),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(portCalls).toEqual(["turnaroundLeadTimeEvidence"]);
    expect(result.record.output.outcome).toBe("unavailable");
    if (result.record.output.outcome !== "unavailable") throw new Error("unreachable");
    expect(result.record.output.unavailableReason).toBe(UNAVAILABLE_NO_ENGINE_DATA);
    expect(result.record.output.fields).toHaveLength(4);
  });

  it("produces the golden 35/88/20696/53 fit from raw lead-time evidence", () => {
    const port = fakePort({
      turnaround: {
        turnaroundScopeId: "wp-k201",
        workOrderId: "wo-2",
        assetId: ASSET,
        requiredSpareIds: ["sp-seal"],
        spareLeadTimes: [{ spareId: "sp-seal", leadTimeDays: 35 }],
        turnaroundStartIso: "2026-10-23T00:00:00.000Z",
        evidence: {
          sourceKey: "turnaround_scheduling",
          sourceMode: "local",
          capturedAt: "2026-07-27T06:00:00.000Z",
          evidenceIds: ["wp-k201", "ta-1", "wo-2", "sp-seal"],
        },
      },
    });
    const result = executeRecompute(
      createLedger(SCOPE),
      request({
        kind: "turnaround_lead_time_fit",
        requestedByEventType: "TurnaroundScopeRetained",
        asOf: "2026-07-27T12:00:00.000Z",
      }),
      TURNAROUND,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("produced");
    const slot = slotKey("turnaround_lead_time_fit", TURNAROUND);
    expect(fieldOf(result.ledger, slot, "maxLeadTimeDays")?.envelope.value).toBe(35);
    expect(fieldOf(result.ledger, slot, "daysUntilTurnaround")?.envelope.value).toBe(88);
    expect(fieldOf(result.ledger, slot, "availableDateEpochDay")?.envelope.value).toBe(20696);
    expect(fieldOf(result.ledger, slot, "slackDays")?.envelope.value).toBe(53);
  });

  it("accepts both as MaterialsChecked-triggered readiness too", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "work_readiness", requestedByEventType: "MaterialsChecked" }),
      WORK_ORDER,
      fakePort(),
    );
    expect(result.outcome).toBe("accepted");
  });
});

describe("realised value", () => {
  it("is unavailable until a governed outcome is recorded, and never zero", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "realised_value", requestedByEventType: "OutcomeConfirmed" }),
      OUTCOME,
      fakePort(),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("unavailable");
    if (result.record.output.outcome !== "unavailable") throw new Error("unreachable");
    expect(result.record.output.fields[0]?.envelope.value).toBeNull();
    expect(result.record.output.unavailableReason).toBe(UNAVAILABLE_NO_VALIDATED_OUTCOME);
  });

  it("proposes no RealisedValueRecorded when realised value is unavailable", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "realised_value", requestedByEventType: "OutcomeConfirmed" }),
      OUTCOME,
      fakePort(),
    );
    expect(result.proposedEvents).toEqual([]);
  });

  it("refuses a defaulted zero presented without governed availability", () => {
    const port = fakePort({
      realised: {
        outcomeId: "oo-k201",
        assetId: ASSET,
        available: false,
        realisedValueUsd: 0,
        unavailableReason: UNAVAILABLE_NO_VALIDATED_OUTCOME,
        evidence: EVIDENCE,
      },
    });
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "realised_value", requestedByEventType: "OutcomeConfirmed" }),
      OUTCOME,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("unavailable");
    expect(result.proposedEvents).toEqual([]);
  });

  it("accepts a genuinely governed zero as a real realised value", () => {
    const port = fakePort({
      realised: {
        outcomeId: "oo-k201",
        assetId: ASSET,
        available: true,
        realisedValueUsd: 0,
        unavailableReason: null,
        evidence: EVIDENCE,
      },
    });
    const result = executeRecompute(
      createLedger(SCOPE),
      request({ kind: "realised_value", requestedByEventType: "OutcomeConfirmed" }),
      OUTCOME,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    expect(result.record.output.fields[0]?.envelope.value).toBe(0);
    expect(result.record.output.fields[0]?.valueStatus).toBe("realised");
    expect(result.proposedEvents).toHaveLength(1);
  });

  it("is outcome-scoped, not portfolio-wide", () => {
    const port = fakePort();
    executeRecompute(
      createLedger(SCOPE),
      request({ kind: "realised_value", requestedByEventType: "OutcomeConfirmed" }),
      OUTCOME,
      port,
    );
    expect(portCalls).toEqual(["realisedValueForOutcome"]);
  });
});

describe("engine failure", () => {
  it("records a failed attempt rather than fabricating a value", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request(),
      CASE,
      fakePort({ throwOn: "assessAsset" }),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("failed");
    if (result.record.output.outcome !== "failed") throw new Error("unreachable");
    expect(result.record.output.failureReason).toBe(FAILURE_ENGINE_THREW);
    expect(result.record.output.detail).toContain("engine exploded");
  });

  it("handles a thrown non-Error without losing the failure", () => {
    const result = executeRecompute(
      createLedger(SCOPE),
      request(),
      CASE,
      fakePort({ throwOn: "assessAsset", throwNonError: true }),
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("failed");
  });

  it("never overwrites a prior valid calculation", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (first.outcome !== "accepted") throw new Error("unreachable");
    const head = first.ledger.latestProducedBySlot[slot];

    const second = executeRecompute(
      first.ledger,
      request({ requestedByEventId: "evt-2" }),
      CASE,
      fakePort({ throwOn: "assessAsset" }),
    );
    if (second.outcome !== "accepted") throw new Error("unreachable");
    expect(second.ledger.latestProducedBySlot[slot]).toBe(head);
    expect(latestProduced(second.ledger, slot)?.output.outcome).toBe("produced");
    expect(latestAttempt(second.ledger, slot)?.output.outcome).toBe("failed");
    expect(second.proposedEvents).toEqual([]);
  });

  it("does not let an unavailable engine erase the last known exposure", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (first.outcome !== "accepted") throw new Error("unreachable");
    const second = executeRecompute(
      first.ledger,
      request({ requestedByEventId: "evt-2" }),
      CASE,
      fakePort({ assess: null }),
    );
    if (second.outcome !== "accepted") throw new Error("unreachable");
    const governing = latestProduced(second.ledger, slot);
    if (governing?.output.outcome !== "produced") throw new Error("unreachable");
    expect(
      governing.output.fields.find((f) => f.name === "valueAtStakeUsd")?.envelope.value,
    ).toBe(1620155.9999999995);
  });
});

describe("idempotency, conflict and supersession through execution", () => {
  it("ignores an identical retry and does not re-invoke the engine", () => {
    const first = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (first.outcome !== "accepted") throw new Error("unreachable");
    portCalls = [];
    const retry = executeRecompute(first.ledger, request(), CASE, fakePort());
    expect(retry.outcome).toBe("ignored");
    expect(portCalls).toEqual([]);
    expect(retry.ledger).toBe(first.ledger);
  });

  it("refuses the same trigger evaluated at a different asOf before the engine", () => {
    const first = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (first.outcome !== "accepted") throw new Error("unreachable");
    portCalls = [];
    const conflict = executeRecompute(
      first.ledger,
      request({ asOf: "2026-07-28T00:00:00.000Z" }),
      CASE,
      fakePort(),
    );
    expect(conflict.outcome).toBe("rejected");
    if (conflict.outcome !== "rejected") throw new Error("unreachable");
    expect(conflict.reason).toBe("calculation_request_identity_conflict");
    expect(portCalls).toEqual([]);
  });

  it("supersedes the produced head when a new governed event recomputes the slot", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (first.outcome !== "accepted") throw new Error("unreachable");
    const head = first.record.calculationId;

    const second = executeRecompute(
      first.ledger,
      request({ requestedByEventId: "evt-2" }),
      CASE,
      fakePort(),
    );
    if (second.outcome !== "accepted") throw new Error("unreachable");
    expect(second.record.supersedesCalculationId).toBe(head);
    expect(second.ledger.latestProducedBySlot[slot]).toBe(second.record.calculationId);
    expect(second.ledger.records).toHaveLength(2);
    expect(second.ledger.records[0]?.record.calculationId).toBe(head);
  });

  it("is deterministic: identical inputs produce byte-identical records", () => {
    const a = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    const b = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (a.outcome !== "accepted" || b.outcome !== "accepted") throw new Error("unreachable");
    expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
  });

  it("carries the exact triggering event type onto the record", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.requestedByEventType).toBe("ConditionSignalIngested");
    expect(result.record.requestedByEventId).toBe("evt-1");
  });

  it("uses only the request asOf, never a clock", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.asOf).toBe(AS_OF);
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    for (const field of result.record.output.fields) {
      expect(field.envelope.asOf, field.name).toBe(AS_OF);
      expect(field.envelope.producedAt, field.name).toBe(AS_OF);
    }
  });
});

describe("proposed event boundary", () => {
  it("returns the existing ProposedEvent shape with no id, sequence or actor", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.proposedEvents).toHaveLength(1);
    const proposed = result.proposedEvents[0]!;
    expect(proposed.type).toBe("AssessmentComputed");
    expect(proposed.aggregateId).toBe("case-k201");
    expect(proposed.asOf).toBe(AS_OF);
    expect("id" in proposed).toBe(false);
    expect("sequence" in proposed).toBe(false);
    expect("actor" in proposed).toBe(false);
    expect("recordedAt" in proposed).toBe(false);
  });

  it("carries the governed envelope with a matching asOf into the proposal", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    if (result.outcome !== "accepted") throw new Error("unreachable");
    const payload = result.proposedEvents[0]!.payload as {
      valueAtStake: { asOf: string; value: number | null };
    };
    expect(payload.valueAtStake.asOf).toBe(AS_OF);
    expect(payload.valueAtStake.value).toBe(1620155.9999999995);
  });

  it("proposes nothing for an unavailable or failed assessment", () => {
    for (const port of [fakePort({ assess: null }), fakePort({ throwOn: "assessAsset" })]) {
      const result = executeRecompute(createLedger(SCOPE), request(), CASE, port);
      expect(result.proposedEvents).toEqual([]);
    }
  });

  it("returns frozen proposals so a caller cannot mutate them into an event", () => {
    const result = executeRecompute(createLedger(SCOPE), request(), CASE, fakePort());
    expect(Object.isFrozen(result.proposedEvents)).toBe(true);
    expect(Object.isFrozen(result.proposedEvents[0])).toBe(true);
  });
});
