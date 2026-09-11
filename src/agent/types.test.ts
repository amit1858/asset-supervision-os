import { describe, it, expect } from "vitest";
import {
  AGENT_PROHIBITED_ACTIONS,
  AGENT_QUESTIONS,
  AGENT_QUESTION_IDS,
  governedAgentResponseSchema,
  isAgentQuestionId,
  providerDisplayLabel,
} from "./types";

describe("agent client-safe contract", () => {
  it("maps provider ids to the permitted truthful display labels", () => {
    expect(providerDisplayLabel("azure")).toBe("Azure AI Foundry");
    expect(providerDisplayLabel("dgxspark")).toBe("Local model");
    expect(providerDisplayLabel("nvidia")).toBe("NVIDIA");
    expect(providerDisplayLabel("mock")).toBe("Deterministic fallback");
  });

  it("recognises only the seven governed question ids", () => {
    expect(AGENT_QUESTION_IDS).toHaveLength(7);
    expect(AGENT_QUESTIONS).toHaveLength(7);
    for (const q of AGENT_QUESTIONS) expect(isAgentQuestionId(q.id)).toBe(true);
    expect(isAgentQuestionId("delete_everything")).toBe(false);
    expect(isAgentQuestionId(42)).toBe(false);
  });

  it("declares a permanent, non-empty read-only prohibition list", () => {
    expect(AGENT_PROHIBITED_ACTIONS.length).toBeGreaterThanOrEqual(5);
    const joined = AGENT_PROHIBITED_ACTIONS.join(" ").toLowerCase();
    expect(joined).toContain("approve");
    expect(joined).toContain("work order");
  });

  it("rejects a response whose provider display is outside the allowlist", () => {
    const parsed = governedAgentResponseSchema.safeParse({
      requestId: "r",
      question: "q",
      questionId: "why_action_now",
      provider: "azure",
      providerDisplay: "Totally Trustworthy AI",
      model: "m",
      generatedAt: "now",
      viewer: { personaId: "p", personaName: "P" },
      subject: { assetTag: "K-201", caseId: "c", assetName: "a" },
      situationSummary: "s",
      claims: [{ id: "c1", text: "t", kind: "summary", citationIds: [] }],
      citations: [],
      proposedIntervention: null,
      authorityHandoff: null,
      calculationReferences: [],
      timestamps: { assessmentAsOf: null, materialsAsOf: null, turnaroundAsOf: null },
      freshnessLabels: [],
      trustLabels: [],
      uncertainties: [],
      missingEvidence: [],
      prohibitedActions: [],
      toolsExecuted: [],
      toolsWithheld: [],
      generationStatus: "deterministic",
      deterministicFallback: false,
    });
    expect(parsed.success).toBe(false);
  });
});
