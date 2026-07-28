import type {
  AiInteraction,
  HumanDecision,
  OperationalOutcome,
  Recommendation,
} from "@/domain/types";
import type { AiProviderId } from "@/domain/enums";

/**
 * Return on Token Spend (ROTS) engine.
 *
 * Two rules are enforced structurally, not by convention:
 *   1. ACTUAL activity and ESTIMATED scenarios never mix. Only interactions
 *      marked `accounting === "actual"` contribute to actual tokens/cost. In the
 *      offline demo the only actual provider is the mock (cost $0.00). NVIDIA /
 *      DGX Spark figures are priced *scenarios* for comparison, clearly labelled.
 *   2. PROJECTED value and REALISED value are drawn from different fields.
 *      Realised value counts only outcomes with `valueStatus === "realised"` and
 *      a non-null `realisedValue`; until then realised value is "not available".
 */

export interface ModelRate {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

/**
 * Rate card (USD). Mock is zero-cost — the offline provider consumes no paid
 * tokens. The NVIDIA/DGX figures are representative synthetic rates used ONLY to
 * price comparison scenarios; they are never added to actual usage totals.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  "mock/deterministic-explainer": { inputPerMillion: 0, outputPerMillion: 0 },
  "meta/llama-3.1-70b-instruct": { inputPerMillion: 0.35, outputPerMillion: 0.4 },
  "meta/llama-3.1-8b-instruct": { inputPerMillion: 0.06, outputPerMillion: 0.06 },
};

const DEFAULT_RATE: ModelRate = { inputPerMillion: 0.5, outputPerMillion: 0.5 };

/** Deterministic model-cost estimate from token counts and a rate card. */
export function estimateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = MODEL_RATES[model] ?? DEFAULT_RATE;
  const cost =
    (Math.max(0, inputTokens) / 1_000_000) * rate.inputPerMillion +
    (Math.max(0, outputTokens) / 1_000_000) * rate.outputPerMillion;
  return Math.round(cost * 1e6) / 1e6;
}

/** Provider/model scenarios priced against the ACTUAL token volume. */
const SCENARIO_MODELS: Array<{ provider: AiProviderId; model: string; label: string }> = [
  { provider: "nvidia", model: "meta/llama-3.1-70b-instruct", label: "NVIDIA · llama-3.1-70b" },
  { provider: "dgxspark", model: "meta/llama-3.1-8b-instruct", label: "DGX Spark · llama-3.1-8b (self-hosted)" },
];

export interface EstimatedScenario {
  provider: AiProviderId;
  model: string;
  label: string;
  costUsd: number;
  /** Always "estimated" — this is a comparison, not actual activity. */
  accounting: "estimated";
}

export interface RotsInputs {
  interactions: AiInteraction[];
  recommendations: Recommendation[];
  decisions: HumanDecision[];
  outcomes: OperationalOutcome[];
}

export interface RotsMetrics {
  // --- Actual activity (what really happened — offline mock) ---------------
  actualProvider: AiProviderId; // "mock" in the demo
  interactionCount: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualTokens: number;
  actualCostUsd: number; // 0.00 for mock
  averageLatencyMs: number;

  // --- Estimated provider-cost scenarios (comparison only) -----------------
  estimatedScenarios: EstimatedScenario[];
  /** Representative estimated inference cost for the primary narrative. */
  estimatedInferenceCostUsd: number;

  // --- Recommendation funnel ----------------------------------------------
  recommendationsWithAi: number;
  decidedCount: number;
  acceptedCount: number; // approved or modified
  rejectedCount: number;
  pendingOutcomeCount: number; // accepted but outcome not yet validated
  resolvedEventCount: number; // validated + resolved (0 in reset state)

  // --- Efficiency (based on ACTUAL cost) -----------------------------------
  acceptanceRate: number | null; // accepted / decided
  recommendationToActionConversion: number | null; // actioned / accepted
  costPerAcceptedRecommendationUsd: number | null; // actual cost / accepted

  // --- Value taxonomy (kept strictly separate) -----------------------------
  valueAtStakeUsd: number; // exposure under decision (NOT AI-created value)
  projectedValueEnabledUsd: number; // value the actions would protect if executed
  realisedValueUsd: number; // validated outcomes only
  realisedAvailable: boolean; // false until a validated outcome exists

  // --- ROTS ratios (per 1,000 ACTUAL tokens) -------------------------------
  projectedValuePer1kTokens: number | null;
  realisedValuePer1kTokens: number | null; // null when not available
}

function safeDiv(n: number, d: number): number | null {
  if (d === 0) return null;
  return n / d;
}

export function computeRots(inputs: RotsInputs): RotsMetrics {
  const { interactions, recommendations, decisions, outcomes } = inputs;

  // 1) ACTUAL activity only.
  const actual = interactions.filter((i) => i.accounting === "actual");
  const actualInputTokens = actual.reduce((s, i) => s + i.inputTokens, 0);
  const actualOutputTokens = actual.reduce((s, i) => s + i.outputTokens, 0);
  const actualTokens = actualInputTokens + actualOutputTokens;
  const actualCostUsd =
    Math.round(actual.reduce((s, i) => s + i.estimatedCostUsd, 0) * 1e6) / 1e6;
  const averageLatencyMs =
    actual.length > 0
      ? Math.round(actual.reduce((s, i) => s + i.latencyMs, 0) / actual.length)
      : 0;
  const providers = new Set(actual.map((i) => i.provider));
  const actualProvider: AiProviderId =
    providers.size === 1 ? [...providers][0]! : "mock";

  // 2) ESTIMATED scenarios priced on the ACTUAL token volume.
  const estimatedScenarios: EstimatedScenario[] = SCENARIO_MODELS.map((s) => ({
    provider: s.provider,
    model: s.model,
    label: s.label,
    costUsd: estimateModelCost(s.model, actualInputTokens, actualOutputTokens),
    accounting: "estimated" as const,
  }));
  const estimatedInferenceCostUsd = estimatedScenarios[0]?.costUsd ?? 0;

  // 3) Funnel.
  const decidedCount = decisions.length;
  const acceptedCount = decisions.filter(
    (d) => d.decision === "approved" || d.decision === "modified",
  ).length;
  const rejectedCount = decisions.filter((d) => d.decision === "rejected").length;
  const resolvedEventCount = outcomes.filter(
    (o) => o.resolved && o.valueStatus === "realised",
  ).length;
  const pendingOutcomeCount = outcomes.filter(
    (o) => o.valueStatus !== "realised",
  ).length;

  // 4) Value taxonomy. Unresolved recommendations carry value-at-stake and
  //    projected-enabled value; realised value counts validated outcomes only.
  const unresolved = recommendations.filter(
    (r) => r.status === "open" || r.status === "actioned",
  );
  const valueAtStakeUsd = unresolved.reduce((s, r) => s + r.valueAtStakeUsd, 0);
  const projectedValueEnabledUsd = unresolved.reduce(
    (s, r) => s + r.projectedValueEnabledUsd,
    0,
  );
  const realisedValueUsd = outcomes
    .filter((o) => o.valueStatus === "realised" && o.realisedValue !== null)
    .reduce((s, o) => s + (o.realisedValue ?? 0), 0);
  const realisedAvailable = realisedValueUsd > 0;

  const per1k = (v: number): number | null =>
    actualTokens > 0 ? (v / actualTokens) * 1000 : null;

  return {
    actualProvider,
    interactionCount: actual.length,
    actualInputTokens,
    actualOutputTokens,
    actualTokens,
    actualCostUsd,
    averageLatencyMs,

    estimatedScenarios,
    estimatedInferenceCostUsd,

    recommendationsWithAi: new Set(
      actual.map((i) => i.recommendationId).filter(Boolean),
    ).size,
    decidedCount,
    acceptedCount,
    rejectedCount,
    pendingOutcomeCount,
    resolvedEventCount,

    acceptanceRate: safeDiv(acceptedCount, decidedCount),
    recommendationToActionConversion: safeDiv(pendingOutcomeCount + resolvedEventCount, acceptedCount),
    costPerAcceptedRecommendationUsd: safeDiv(actualCostUsd, acceptedCount),

    valueAtStakeUsd,
    projectedValueEnabledUsd,
    realisedValueUsd,
    realisedAvailable,

    projectedValuePer1kTokens: per1k(projectedValueEnabledUsd),
    realisedValuePer1kTokens: realisedAvailable ? per1k(realisedValueUsd) : null,
  };
}

/** Per-provider ACTUAL usage rollup (estimated scenarios are excluded). */
export interface ProviderUsage {
  provider: AiProviderId;
  accounting: "actual";
  interactions: number;
  totalTokens: number;
  costUsd: number;
}

export function usageByProvider(interactions: AiInteraction[]): ProviderUsage[] {
  const map = new Map<AiProviderId, ProviderUsage>();
  for (const i of interactions) {
    if (i.accounting !== "actual") continue;
    const cur =
      map.get(i.provider) ??
      ({ provider: i.provider, accounting: "actual", interactions: 0, totalTokens: 0, costUsd: 0 } satisfies ProviderUsage);
    cur.interactions += 1;
    cur.totalTokens += i.inputTokens + i.outputTokens;
    cur.costUsd = Math.round((cur.costUsd + i.estimatedCostUsd) * 1e6) / 1e6;
    map.set(i.provider, cur);
  }
  return Array.from(map.values());
}
