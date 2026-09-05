import { describe, it, expect } from "vitest";
import { toolPlanFor } from "./plan";
import { AGENT_QUESTION_IDS } from "./types";
import { AGENT_TOOL_NAMES } from "./tools";

describe("agent tool plan catalogue", () => {
  it("maps every governed question to a non-empty, allowlisted plan", () => {
    for (const questionId of AGENT_QUESTION_IDS) {
      const plan = toolPlanFor(questionId);
      expect(plan.length).toBeGreaterThan(0);
      for (const tool of plan) {
        expect(AGENT_TOOL_NAMES).toContain(tool);
      }
    }
  });

  it("routes every answer to human authority (get_decision_authority in every plan)", () => {
    for (const questionId of AGENT_QUESTION_IDS) {
      expect(toolPlanFor(questionId)).toContain("get_decision_authority");
    }
  });

  it("'why_action_now' walks the full nine-tool governed thread in order", () => {
    expect(toolPlanFor("why_action_now")).toEqual([
      "get_asset_condition",
      "get_reliability_assessment",
      "get_material_readiness",
      "get_turnaround_fit",
      "get_oee_and_losses",
      "get_value_context",
      "get_decision_authority",
      "get_lifecycle_projection",
      "get_decision_audit",
    ]);
  });

  it("is deterministic — the same question yields the same plan", () => {
    expect(toolPlanFor("what_is_the_evidence")).toEqual(
      toolPlanFor("what_is_the_evidence"),
    );
  });

  it("narrower questions dispatch a strict subset of the allowlist", () => {
    const evidence = toolPlanFor("what_is_the_evidence");
    expect(evidence).toEqual([
      "get_asset_condition",
      "get_reliability_assessment",
      "get_decision_authority",
    ]);
    expect(evidence.length).toBeLessThan(toolPlanFor("why_action_now").length);
  });
});
