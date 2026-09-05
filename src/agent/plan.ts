import "server-only";
import type { AgentQuestionId } from "./types";
import type { AgentToolName } from "./tools";

/**
 * The deterministic question → tool plan catalogue (server-only).
 *
 * For each governed question there is a FIXED, ordered set of read-only tools.
 * The plan is deterministic: the same question always dispatches the same tools,
 * so the evidence bundle is reproducible and the offline fallback is identical
 * to the grounded path. No tool outside this catalogue is ever reachable.
 *
 * The `full` plan (used by "Why act now?") walks the entire governed thread:
 * condition → assessment → materials → turnaround → OEE → value → authority →
 * lifecycle → audit. Narrower questions dispatch the subset that answers them,
 * but always include the authority tool so every answer routes to a human.
 */

const FULL_PLAN: readonly AgentToolName[] = [
  "get_asset_condition",
  "get_reliability_assessment",
  "get_material_readiness",
  "get_turnaround_fit",
  "get_oee_and_losses",
  "get_value_context",
  "get_decision_authority",
  "get_lifecycle_projection",
  "get_decision_audit",
];

const PLANS: Record<AgentQuestionId, readonly AgentToolName[]> = {
  why_action_now: FULL_PLAN,
  what_is_the_evidence: [
    "get_asset_condition",
    "get_reliability_assessment",
    "get_decision_authority",
  ],
  can_it_wait_for_turnaround: [
    "get_reliability_assessment",
    "get_turnaround_fit",
    "get_material_readiness",
    "get_decision_authority",
  ],
  what_is_blocking_the_work: [
    "get_material_readiness",
    "get_turnaround_fit",
    "get_decision_authority",
  ],
  who_must_decide: [
    "get_reliability_assessment",
    "get_value_context",
    "get_decision_authority",
    "get_decision_audit",
  ],
  what_value_is_protected: [
    "get_reliability_assessment",
    "get_value_context",
    "get_oee_and_losses",
    "get_decision_authority",
  ],
  what_changed: [
    "get_asset_condition",
    "get_reliability_assessment",
    "get_lifecycle_projection",
    "get_decision_audit",
    "get_decision_authority",
  ],
};

export function toolPlanFor(questionId: AgentQuestionId): readonly AgentToolName[] {
  return PLANS[questionId];
}
