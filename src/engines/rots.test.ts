import { describe, it, expect } from "vitest";
import { computeRots, estimateModelCost, usageByProvider } from "./rots";
import type {
  AiInteraction,
  HumanDecision,
  OperationalOutcome,
  Recommendation,
} from "@/domain/types";

describe("estimateModelCost", () => {
  it("prices input and output tokens from the rate card", () => {
    expect(estimateModelCost("meta/llama-3.1-70b-instruct", 1000, 1000)).toBeCloseTo(0.00075, 6);
  });
  it("prices the mock provider at zero", () => {
    expect(estimateModelCost("mock/deterministic-explainer", 5000, 5000)).toBe(0);
  });
});

function interaction(over: Partial<AiInteraction>): AiInteraction {
  return {
    id: "ai",
    createdAt: "2026-07-01T00:00:00.000Z",
    accounting: "actual",
    provider: "mock",
    model: "mock/deterministic-explainer",
    useCase: "explain",
    promptVersionId: "pv",
    inputTokens: 1000,
    outputTokens: 1000,
    estimatedCostUsd: 0,
    latencyMs: 500,
    recommendationId: "rec-1",
    evidenceIds: [],
    outputSummary: "",
    ...over,
  };
}

function decision(over: Partial<HumanDecision>): HumanDecision {
  return {
    id: "hd",
    recommendationId: "rec-1",
    decidedBy: "eng",
    role: "Reliability",
    decision: "approved",
    decidedAt: "2026-07-01T00:00:00.000Z",
    note: "",
    modifiedDisposition: null,
    ...over,
  };
}

function recommendation(over: Partial<Recommendation>): Recommendation {
  return {
    id: "rec-1",
    assetId: "asset-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    title: "t",
    summary: "s",
    disposition: "planned_maintenance",
    severity: "medium",
    trendProjectionConfidence: 0.7,
    actionPlan: [],
    decisionOwner: "owner",
    dueBy: null,
    aiRationale: null,
    aiInteractionId: "ai",
    evidenceIds: [],
    valueAtStakeUsd: 100000,
    projectedValueEnabledUsd: 50000,
    currency: "USD",
    status: "open",
    ...over,
  };
}

function outcome(over: Partial<OperationalOutcome>): OperationalOutcome {
  return {
    id: "oo",
    recommendationId: "rec-1",
    decisionId: "hd",
    assetId: "asset-1",
    recordedAt: "2026-07-02T00:00:00.000Z",
    resolved: false,
    description: "",
    estimatedValue: 50000,
    realisedValue: null,
    valueStatus: "projected",
    currency: "USD",
    ...over,
  };
}

describe("computeRots — actual vs estimated accounting", () => {
  it("counts only mock as actual and prices scenarios separately", () => {
    const metrics = computeRots({
      interactions: [interaction({ id: "a1", inputTokens: 1000, outputTokens: 1000 })],
      recommendations: [recommendation({})],
      decisions: [decision({})],
      outcomes: [outcome({})],
    });
    expect(metrics.actualProvider).toBe("mock");
    expect(metrics.actualCostUsd).toBe(0);
    expect(metrics.actualTokens).toBe(2000);
    // Estimated scenarios are priced but never added to actuals.
    expect(metrics.estimatedScenarios.length).toBeGreaterThan(0);
    expect(metrics.estimatedInferenceCostUsd).toBeGreaterThan(0);
    expect(metrics.estimatedScenarios.every((s) => s.accounting === "estimated")).toBe(true);
  });

  it("excludes non-actual interactions from actual totals", () => {
    const metrics = computeRots({
      interactions: [
        interaction({ id: "a1", accounting: "actual", estimatedCostUsd: 0 }),
        // A hypothetical estimated record must NOT inflate actual cost/tokens.
        interaction({ id: "e1", accounting: "estimated", provider: "nvidia", estimatedCostUsd: 0.5, inputTokens: 9999, outputTokens: 9999 }),
      ],
      recommendations: [recommendation({})],
      decisions: [],
      outcomes: [],
    });
    expect(metrics.actualCostUsd).toBe(0);
    expect(metrics.actualTokens).toBe(2000);
    expect(metrics.actualProvider).toBe("mock");
  });
});

describe("computeRots — projected vs realised separation", () => {
  it("never reports realised value before a validated outcome", () => {
    const metrics = computeRots({
      interactions: [interaction({})],
      recommendations: [recommendation({ status: "actioned" })],
      decisions: [decision({})],
      outcomes: [outcome({ valueStatus: "projected", realisedValue: null, resolved: false })],
    });
    expect(metrics.realisedValueUsd).toBe(0);
    expect(metrics.realisedAvailable).toBe(false);
    expect(metrics.realisedValuePer1kTokens).toBeNull();
    expect(metrics.projectedValueEnabledUsd).toBeGreaterThan(0);
    expect(metrics.projectedValuePer1kTokens).not.toBeNull();
  });

  it("counts realised value only from validated outcomes", () => {
    const metrics = computeRots({
      interactions: [interaction({})],
      recommendations: [recommendation({ status: "closed" })],
      decisions: [decision({})],
      outcomes: [outcome({ valueStatus: "realised", realisedValue: 90000, resolved: true })],
    });
    expect(metrics.realisedValueUsd).toBe(90000);
    expect(metrics.realisedAvailable).toBe(true);
  });
});

describe("computeRots — funnel", () => {
  it("computes acceptance and pending outcomes", () => {
    const metrics = computeRots({
      interactions: [interaction({ id: "a1" }), interaction({ id: "a2", recommendationId: "rec-2" })],
      recommendations: [recommendation({ id: "rec-1" }), recommendation({ id: "rec-2" })],
      decisions: [
        decision({ id: "d1", recommendationId: "rec-1", decision: "approved" }),
        decision({ id: "d2", recommendationId: "rec-2", decision: "rejected" }),
      ],
      outcomes: [outcome({ id: "o1", valueStatus: "projected" })],
    });
    expect(metrics.acceptedCount).toBe(1);
    expect(metrics.rejectedCount).toBe(1);
    expect(metrics.acceptanceRate).toBeCloseTo(0.5, 10);
    expect(metrics.pendingOutcomeCount).toBe(1);
    expect(metrics.costPerAcceptedRecommendationUsd).toBe(0); // actual cost 0
  });

  it("returns null ratios instead of dividing by zero", () => {
    const metrics = computeRots({ interactions: [], recommendations: [], decisions: [], outcomes: [] });
    expect(metrics.acceptanceRate).toBeNull();
    expect(metrics.actualTokens).toBe(0);
    expect(metrics.projectedValuePer1kTokens).toBeNull();
  });
});

describe("usageByProvider", () => {
  it("includes only actual usage", () => {
    const usage = usageByProvider([
      interaction({ id: "a", provider: "mock", accounting: "actual" }),
      interaction({ id: "b", provider: "nvidia", accounting: "estimated", estimatedCostUsd: 0.5 }),
    ]);
    expect(usage.length).toBe(1);
    expect(usage[0]!.provider).toBe("mock");
    expect(usage.every((u) => u.accounting === "actual")).toBe(true);
  });
});
