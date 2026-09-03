import { describe, it, expect } from "vitest";
import { ANCHOR_NOW, LINE, SEED } from "@/data/constants";
import { executeRecompute } from "@/v2/domain/calculations/execute";
import { slotKey } from "@/v2/domain/calculations/identity";
import { createLedger } from "@/v2/domain/calculations/ledger";
import {
  inventoryBufferSelector,
  materialsReadinessSelector,
} from "@/v2/domain/calculations/selectors";
import { subjectIdentityParts } from "@/v2/domain/calculations/subject";
import { turnaroundFitSelector } from "@/v2/domain/calculations/turnaround-fit";
import type {
  CalculationSubject,
  LedgerScope,
} from "@/v2/domain/calculations/subject";
import type { RecomputeRequest } from "@/v2/domain/recompute";
import { getEngineAdapter } from "./engine-adapter";

/**
 * Integration proof against the REAL seeded engines — not a stub.
 *
 * The K-201 numbers asserted here are the golden values the seed verification,
 * the repository and the brief already agree on. If the ledger ever disagreed
 * with them, the calculation vertical would have grown a second formula, which
 * is exactly what Slice 2.1c forbids.
 */

const ASSET = "asset-k201";
const AS_OF = ANCHOR_NOW;

const CASE: CalculationSubject = { kind: "supervision_case", caseId: "case-k201", assetId: ASSET };
const CASE_SCOPE: LedgerScope = { kind: "supervision_case", caseId: "case-k201", assetId: ASSET };
const LINE_SUBJECT: CalculationSubject = { kind: "production_line", lineId: LINE.id };
const LINE_SCOPE: LedgerScope = { kind: "production_line", lineId: LINE.id };

const port = getEngineAdapter();

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

function values(kind: "asset_assessment", subject = CASE, scope = CASE_SCOPE) {
  const result = executeRecompute(createLedger(scope), request({ kind }), subject, port);
  if (result.outcome !== "accepted") throw new Error(`expected acceptance: ${result.outcome}`);
  if (result.record.output.outcome !== "produced") {
    throw new Error(`expected a produced result, got ${result.record.output.outcome}`);
  }
  const map = new Map<string, number | null>();
  for (const field of result.record.output.fields) map.set(field.name, field.envelope.value);
  return { result, map };
}

describe("dataset metadata is read-only and anchored", () => {
  it("exposes the existing anchor and seed without creating a second clock", () => {
    const metadata = port.datasetMetadata();
    expect(metadata.anchorNow).toBe(ANCHOR_NOW);
    expect(metadata.seed).toBe(SEED);
    expect(metadata.productionLineId).toBe(LINE.id);
    expect(metadata.sourceMode).toBe("local");
    expect(Object.isFrozen(metadata)).toBe(true);
  });
});

describe("K-201 assessment through the real engines", () => {
  it("reproduces the golden risk, health, time-to-critical and exposure", () => {
    const { map } = values("asset_assessment");
    expect(map.get("riskScore")).toBe(68);
    expect(map.get("healthScore")).toBe(52);
    expect(map.get("timeToCriticalDays")).toBe(17.929375879868676);
    expect(map.get("valueAtStakeUsd")).toBe(1620155.9999999995);
  });

  it("formats the governed exposure as $1,620,156", () => {
    const { map } = values("asset_assessment");
    const raw = map.get("valueAtStakeUsd")!;
    expect(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(raw),
    ).toBe("$1,620,156");
  });

  it("carries real evidence identities and a historian source", () => {
    const { result } = values("asset_assessment");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    const field = result.record.output.fields[0]!;
    expect(field.envelope.evidenceIds.length).toBeGreaterThan(0);
    expect(field.envelope.sourceMode).toBe("local");
    expect(field.envelope.asOf).toBe(AS_OF);
  });

  it("keeps time-to-critical a statistical prediction against real data", () => {
    const { result } = values("asset_assessment");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    const ttc = result.record.output.fields.find((f) => f.name === "timeToCriticalDays")!;
    expect(ttc.envelope.provenance).toBe("statistical");
    expect(ttc.envelope.trustClassification).toBe("prediction");
    expect(ttc.valueStatus).toBeNull();
  });

  it("is deterministic across repeated real-engine executions", () => {
    const a = values("asset_assessment").result;
    const b = values("asset_assessment").result;
    expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
  });

  it("records an explicit unavailable calculation for any non-K-201 asset", () => {
    const subject: CalculationSubject = {
      kind: "supervision_case",
      caseId: "case-e205",
      assetId: "asset-e205",
    };
    const scope: LedgerScope = {
      kind: "supervision_case",
      caseId: "case-e205",
      assetId: "asset-e205",
    };
    const result = executeRecompute(
      createLedger(scope),
      request({ assetId: "asset-e205" }),
      subject,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("unavailable");
    if (result.record.output.outcome !== "unavailable") throw new Error("unreachable");
    expect(result.record.output.unavailableReason).toBe(
      "no_governed_assessment_engine_for_asset",
    );
    for (const field of result.record.output.fields) {
      expect(field.envelope.value, field.name).toBeNull();
    }
    expect(result.proposedEvents).toEqual([]);
  });
});

describe("OEE reconciliation through the real engines", () => {
  it("reproduces the golden OEE tree exactly as the engine returns it", () => {
    const result = executeRecompute(
      createLedger(LINE_SCOPE),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      LINE_SUBJECT,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    const map = new Map(
      result.record.output.fields.map((f) => [f.name, f.envelope.value] as const),
    );
    // The ledger stores the engine's raw ratio untouched — no rescaling, no
    // rounding. The governed 91.2% / 97.9% / 93.9% / 99.1% display figures are
    // exactly these values rendered as percentages.
    expect(map.get("oee")).toBe(0.9116125730994152);
    expect(map.get("availability")).toBe(0.9793518518518518);
    expect(map.get("performance")).toBe(0.9390862994680613);
    expect(map.get("quality")).toBe(0.991210862985477);
    expect(map.get("availabilityLossUnits")).toBe(14123.333333333334);
    expect(map.get("performanceLossUnits")).toBe(40804.66666666663);
    expect(map.get("qualityLossUnits")).toBe(5529);
  });

  it("renders the governed OEE percentages the rest of the system displays", () => {
    const result = executeRecompute(
      createLedger(LINE_SCOPE),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      LINE_SUBJECT,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    const pct = (name: string): string => {
      const field = result.record.output.outcome === "produced"
        ? result.record.output.fields.find((f) => f.name === name)
        : undefined;
      return ((field!.envelope.value as number) * 100).toFixed(1);
    };
    expect(pct("oee")).toBe("91.2");
    expect(pct("availability")).toBe("97.9");
    expect(pct("performance")).toBe("93.9");
    expect(pct("quality")).toBe("99.1");
  });

  it("produces no lifecycle proposal", () => {
    const result = executeRecompute(
      createLedger(LINE_SCOPE),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      LINE_SUBJECT,
      port,
    );
    expect(result.proposedEvents).toEqual([]);
  });

  it("records an unavailable calculation for an unknown line", () => {
    const scope: LedgerScope = { kind: "production_line", lineId: "line-unknown" };
    const result = executeRecompute(
      createLedger(scope),
      request({
        kind: "oee_reconciliation",
        requestedByEventType: "ProductionObservationIngested",
      }),
      { kind: "production_line", lineId: "line-unknown" },
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    expect(result.record.output.outcome).toBe("unavailable");
  });
});

describe("projected value stays recommendation-scoped against the real seed", () => {
  it("records K-201's own $1,094,400 and never the portfolio total", () => {
    const subject: CalculationSubject = {
      kind: "recommendation",
      recommendationId: "rec-k201",
      assetId: ASSET,
    };
    const result = executeRecompute(
      createLedger(CASE_SCOPE),
      request({ kind: "decision_projected_value", requestedByEventType: "DecisionApproved" }),
      subject,
      port,
    );
    if (result.outcome !== "accepted") throw new Error("unreachable");
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    expect(result.record.output.fields[0]?.envelope.value).toBe(1094400);
    expect(result.record.output.fields[0]?.valueStatus).toBe("projected");
    const serialised = JSON.stringify(result.record);
    expect(serialised).not.toContain("1449400");
    expect(serialised).not.toContain("1458140");
  });

  it("returns null for a recommendation that belongs to another asset", () => {
    expect(port.projectRecommendationValue("rec-k201", "asset-e205")).toBeNull();
    expect(port.projectRecommendationValue("rec-does-not-exist", ASSET)).toBeNull();
  });
});

describe("realised value against the real seed", () => {
  it("reports every seeded outcome as unavailable, never zero", () => {
    for (const outcomeId of ["oo-e205", "oo-p210", "oo-k202", "oo-p214"]) {
      const assetId = outcomeId.replace("oo-", "asset-");
      const result = port.realisedValueForOutcome(outcomeId, assetId);
      if (result === null) continue;
      expect(result.available, outcomeId).toBe(false);
      expect(result.realisedValueUsd, outcomeId).toBeNull();
      expect(result.unavailableReason, outcomeId).toBe("no_validated_outcome_recorded");
    }
  });

  it("returns null for an unknown outcome rather than a defaulted zero", () => {
    expect(port.realisedValueForOutcome("oo-nope", ASSET)).toBeNull();
  });
});

describe("the ledger agrees with the existing numerical truth", () => {
  it("keeps the assessment head governing after a later unavailable attempt", () => {
    const slot = slotKey("asset_assessment", CASE);
    const first = executeRecompute(createLedger(CASE_SCOPE), request(), CASE, port);
    if (first.outcome !== "accepted") throw new Error("unreachable");

    const second = executeRecompute(
      first.ledger,
      request({
        kind: "realised_value",
        requestedByEventType: "OutcomeConfirmed",
        requestedByEventId: "evt-2",
      }),
      { kind: "outcome", outcomeId: "oo-k202", assetId: ASSET },
      port,
    );
    if (second.outcome !== "accepted") throw new Error("unreachable");
    expect(second.ledger.latestProducedBySlot[slot]).toBe(first.record.calculationId);
    expect(second.proposedEvents).toEqual([]);
  });
});

describe("governed work readiness through the real seeded inventory", () => {
  // Inventory evidence is captured at 06:00 on the anchor day, so it is only
  // observable/fresh from an `asOf` at or after that instant. The anchor's own
  // midnight would make the balances future-dated; noon is the governed instant
  // this slice evaluates at, exactly as the golden math specifies.
  const MATERIALS_AS_OF = "2026-07-27T12:00:00.000Z";

  function readiness(workOrderId: string) {
    const subject: CalculationSubject = { kind: "work_order", workOrderId, assetId: ASSET };
    const result = executeRecompute(
      createLedger(CASE_SCOPE),
      request({
        kind: "work_readiness",
        requestedByEventType: "MaterialsChecked",
        asOf: MATERIALS_AS_OF,
      }),
      subject,
      port,
    );
    if (result.outcome !== "accepted") throw new Error(`expected acceptance: ${result.outcome}`);
    if (result.record.output.outcome !== "produced") {
      throw new Error(`expected produced, got ${result.record.output.outcome}`);
    }
    const map = new Map(
      result.record.output.fields.map((f) => [f.name, f.envelope.value] as const),
    );
    return { result, map };
  }

  it("computes wo-1 as materials-ready with a below-reorder-point buffer of -1", () => {
    const { result, map } = readiness("wo-1");
    expect(map.get("requiredSpareLineCount")).toBe(1);
    expect(map.get("totalRequiredQty")).toBe(1);
    expect(map.get("sparesWithBalanceCount")).toBe(1);
    expect(map.get("totalAvailableUnreservedQty")).toBe(1);
    expect(map.get("totalShortageQty")).toBe(0);
    expect(map.get("sparesWithShortageCount")).toBe(0);
    expect(map.get("minimumCoverageRatio")).toBe(1);
    expect(map.get("postAllocationBufferToReorderPoint")).toBe(-1);

    const materials = materialsReadinessSelector({
      totalRequiredQty: map.get("totalRequiredQty") ?? null,
      totalShortageQty: map.get("totalShortageQty") ?? null,
    });
    expect(materials.label).toBe("ready");
    const buffer = inventoryBufferSelector({
      postAllocationBufferToReorderPoint:
        map.get("postAllocationBufferToReorderPoint") ?? null,
    });
    expect(buffer.label).toBe("below_reorder_point");

    // Governed materials evidence is fresh inventory, and no lifecycle event is
    // proposed by a readiness calculation.
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    expect(result.record.output.fields[0]!.envelope.freshness).toBe("fresh");
    expect(result.record.output.fields[0]!.envelope.sourceMode).toBe("local");
    expect(result.proposedEvents).toEqual([]);
  });

  it("computes wo-2 as materials-blocked on a genuine zero-on-hand shortage", () => {
    const { map } = readiness("wo-2");
    expect(map.get("totalRequiredQty")).toBe(1);
    // sp-seal on hand is a governed 0, not missing evidence: it is a shortage.
    expect(map.get("totalAvailableUnreservedQty")).toBe(0);
    expect(map.get("totalShortageQty")).toBe(1);
    const materials = materialsReadinessSelector({
      totalRequiredQty: map.get("totalRequiredQty") ?? null,
      totalShortageQty: map.get("totalShortageQty") ?? null,
    });
    expect(materials.label).toBe("blocked");
  });

  it("returns null for a work order that belongs to another asset", () => {
    expect(port.workOrderMaterialsEvidence("wo-1", "asset-e205")).toBeNull();
    expect(port.workOrderMaterialsEvidence("wo-does-not-exist", ASSET)).toBeNull();
  });
});

describe("governed turnaround lead-time fit through the real seed", () => {
  const TURNAROUND_AS_OF = "2026-07-27T12:00:00.000Z";
  const SCOPE_SUBJECT: CalculationSubject = {
    kind: "turnaround_scope",
    turnaroundScopeId: "wp-k201",
    workOrderId: "wo-2",
    assetId: ASSET,
  };

  function fit(subject: CalculationSubject) {
    const result = executeRecompute(
      createLedger(CASE_SCOPE),
      request({
        kind: "turnaround_lead_time_fit",
        requestedByEventType: "TurnaroundScopeRetained",
        asOf: TURNAROUND_AS_OF,
      }),
      subject,
      port,
    );
    if (result.outcome !== "accepted") throw new Error(`expected acceptance: ${result.outcome}`);
    return result;
  }

  it("reproduces the golden 35 / 88 / 20696 (2026-08-31) / 53 fit for wp-k201·wo-2", () => {
    const result = fit(SCOPE_SUBJECT);
    if (result.record.output.outcome !== "produced") {
      throw new Error(`expected produced, got ${result.record.output.outcome}`);
    }
    const map = new Map(
      result.record.output.fields.map((f) => [f.name, f.envelope.value] as const),
    );
    expect(map.get("maxLeadTimeDays")).toBe(35);
    expect(map.get("daysUntilTurnaround")).toBe(88);
    expect(map.get("availableDateEpochDay")).toBe(20696);
    expect(map.get("slackDays")).toBe(53);
    expect(new Date(20696 * 86_400_000).toISOString().slice(0, 10)).toBe("2026-08-31");

    expect(turnaroundFitSelector(map.get("slackDays") ?? null).label).toBe("fits");
    expect(result.record.output.fields[0]!.envelope.freshness).toBe("fresh");
    expect(result.proposedEvents).toEqual([]);
  });

  it("carries the exact three-part subject identity", () => {
    expect(subjectIdentityParts(SCOPE_SUBJECT)).toEqual(["wp-k201", "wo-2", "asset-k201"]);
  });

  it("uses exactly the named work order and never scans sibling work orders", () => {
    // Naming wo-1 (sp-brg, lead 21) instead of wo-2 (sp-seal, lead 35) must
    // yield 21, not 35 — proof the adapter reads the subject's work order alone.
    const result = fit({
      kind: "turnaround_scope",
      turnaroundScopeId: "wp-k201",
      workOrderId: "wo-1",
      assetId: ASSET,
    });
    if (result.record.output.outcome !== "produced") throw new Error("unreachable");
    const map = new Map(
      result.record.output.fields.map((f) => [f.name, f.envelope.value] as const),
    );
    expect(map.get("maxLeadTimeDays")).toBe(21);
    expect(map.get("slackDays")).toBe(67);
    expect(map.get("availableDateEpochDay")).toBe(20682);
  });

  it("is deterministic across repeated real-engine executions", () => {
    const a = fit(SCOPE_SUBJECT);
    const b = fit(SCOPE_SUBJECT);
    expect(JSON.stringify(a.record.output)).toBe(JSON.stringify(b.record.output));
  });

  it("returns null for a scope on another asset or an unknown work order", () => {
    expect(port.turnaroundLeadTimeEvidence("wp-k201", "wo-2", "asset-e205")).toBeNull();
    expect(port.turnaroundLeadTimeEvidence("wp-k201", "wo-nope", ASSET)).toBeNull();
    expect(port.turnaroundLeadTimeEvidence("wp-nope", "wo-2", ASSET)).toBeNull();
  });
});
