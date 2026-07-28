import "server-only";

import type { AiInteraction } from "@/domain/types";
import type { RiskResult } from "@/engines/risk";
import { estimateModelCost } from "@/engines/rots";
import { getAiProvider } from "./index";
import { getActivePrompt, renderAssetRiskPrompt } from "./prompts";
import type { EvidenceLine } from "./types";

/**
 * Server-side AI service. This is the ONLY place model calls originate.
 * Marked `server-only` so it can never be bundled into a client component.
 *
 * It renders a versioned prompt, calls the selected provider, computes the
 * model cost deterministically, and returns both the explanation text and a
 * fully-formed AiInteraction record for Return-on-Token-Spend accounting.
 */

export interface ExplainResult {
  text: string;
  interaction: Omit<AiInteraction, "id" | "recommendationId"> & {
    recommendationId: string | null;
  };
}

export async function explainAssetRisk(args: {
  risk: RiskResult;
  evidence: EvidenceLine[];
  recommendationId?: string | null;
  createdAt: string;
}): Promise<ExplainResult> {
  const provider = getAiProvider();
  const prompt = getActivePrompt("asset_risk_explanation");

  const { system, user } = renderAssetRiskPrompt({
    assetTag: args.risk.assetTag,
    disposition: args.risk.recommendedDisposition,
    riskScore: args.risk.riskScore,
    healthScore: args.risk.healthScore,
    evidence: args.evidence,
  });

  const result = await provider.generate({
    useCase: prompt.useCase,
    promptKey: prompt.key,
    promptVersion: prompt.version,
    system,
    user,
    evidence: args.evidence,
    maxOutputTokens: 400,
  });

  const estimatedCostUsd = estimateModelCost(
    result.model,
    result.inputTokens,
    result.outputTokens,
  );

  return {
    text: result.text,
    interaction: {
      createdAt: args.createdAt,
      accounting: "actual",
      provider: result.provider,
      model: result.model,
      useCase: prompt.useCase,
      promptVersionId: prompt.id,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd,
      latencyMs: result.latencyMs,
      recommendationId: args.recommendationId ?? null,
      evidenceIds: [],
      outputSummary: result.text.slice(0, 160),
    },
  };
}
