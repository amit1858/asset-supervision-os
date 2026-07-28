import type { PromptVersion } from "@/domain/types";
import type { EvidenceLine } from "./types";

/**
 * Versioned, auditable prompt catalogue. Every AI interaction references a
 * PromptVersion id so the exact instructions used can be reproduced and
 * reviewed later. Prompts live in code (not the DB) for Phase 1, but carry the
 * same identity/version fields as the `prompt_versions` entity.
 */

export const PROMPTS: Record<string, PromptVersion> = {
  asset_risk_explanation: {
    id: "pv_asset_risk_explanation_1_0_0",
    key: "asset_risk_explanation",
    version: "1.0.0",
    useCase: "Explain a deterministic asset-risk assessment in plain language",
    createdAt: "2026-06-01T00:00:00.000Z",
    active: true,
    template:
      "You are a reliability-engineering assistant. Explain the pre-computed " +
      "risk assessment for {{assetTag}} using ONLY the evidence provided. Do " +
      "not invent numbers, thresholds, or actions. State the recommended " +
      "disposition and the two or three most important reasons. Be concise " +
      "and factual. Note explicitly that the recommendation requires human " +
      "approval and is not an autonomous action.",
  },
};

export function getActivePrompt(key: string): PromptVersion {
  const p = PROMPTS[key];
  if (!p) throw new Error(`Unknown prompt key: ${key}`);
  return p;
}

const SYSTEM_PROMPT =
  "You are an industrial reliability assistant embedded in Asset Supervision " +
  "OS. You explain deterministic calculations to engineers. Rules: (1) use " +
  "ONLY the supplied evidence; (2) never fabricate values or thresholds; " +
  "(3) never present the recommendation as an autonomous control action — it " +
  "always requires human approval; (4) be concise and operational; (5) if the " +
  "evidence is insufficient, say so.";

/** Render the system + user prompts for the asset-risk explanation use case. */
export function renderAssetRiskPrompt(args: {
  assetTag: string;
  disposition: string;
  riskScore: number;
  healthScore: number;
  evidence: EvidenceLine[];
}): { system: string; user: string } {
  const evidenceBlock = args.evidence
    .map((e) => `- [${e.provenance}] ${e.label}: ${e.value}`)
    .join("\n");

  const user = [
    `Asset: ${args.assetTag}`,
    `Deterministic risk score: ${args.riskScore}/100 (health ${args.healthScore}/100)`,
    `Recommended disposition (deterministic): ${args.disposition}`,
    "",
    "Evidence (the ONLY facts you may use):",
    evidenceBlock,
    "",
    "Write a 3–5 sentence explanation for a reliability engineer. End by " +
      "stating that this recommendation requires human approval.",
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}
