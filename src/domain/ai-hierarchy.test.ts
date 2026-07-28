import { describe, it, expect } from "vitest";
import { buildDataset } from "@/data/generate";
import type { InferenceCall, WorkflowStepKind } from "./ai-hierarchy";
import type { AiInteraction } from "./types";

/**
 * Phase 2A records model/inference CALLS (by the mock deterministic explainer),
 * not autonomous agent executions. This guards the terminology/domain boundary.
 */
describe("inference vs agent-run domain boundary", () => {
  it("maps a recorded AiInteraction onto an InferenceCall (not an agent run)", () => {
    const db = buildDataset();
    const interaction: AiInteraction = db.aiInteractions[0]!;
    const call: InferenceCall = {
      id: interaction.id,
      provider: interaction.provider,
      model: interaction.model,
      promptVersionId: interaction.promptVersionId,
      inputTokens: interaction.inputTokens,
      outputTokens: interaction.outputTokens,
      estimatedCostUsd: interaction.estimatedCostUsd,
      latencyMs: interaction.latencyMs,
      evidenceIds: interaction.evidenceIds,
    };
    expect(call.provider).toBe("mock");
    expect(call.model).toContain("mock");
  });

  it("fabricates no agent executions in the seeded dataset", () => {
    const db = buildDataset();
    // The dataset has inference-level records only; there is no agent-execution field.
    expect("agentExecutions" in db).toBe(false);
    expect("agentWorkflows" in db).toBe(false);
    // Every recorded AI call is an offline mock inference call.
    expect(db.aiInteractions.every((i) => i.provider === "mock")).toBe(true);
  });

  it("includes inference_call in the future workflow-step vocabulary", () => {
    const kinds: WorkflowStepKind[] = ["inference_call", "tool_call", "human_approval", "resulting_action"];
    expect(kinds).toContain("inference_call");
  });
});
