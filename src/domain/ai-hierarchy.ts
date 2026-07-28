import type { IsoTimestamp } from "./types";
import type { AiProviderId } from "./enums";

/**
 * Future-facing AI execution hierarchy.
 *
 * IMPORTANT: In Phase 2A the ONLY thing that actually happens is an
 * **inference call** made by the mock deterministic explainer. There are no
 * autonomous or tool-using agent executions, and none are fabricated. These
 * types exist so the domain is ready for a future agentic runtime; only
 * `InferenceCall` is currently populated (see `AiInteraction` in `types.ts`,
 * which maps onto an inference call).
 *
 * Hierarchy (future):
 *   AgentWorkflow → AgentExecution → WorkflowStep → { ToolCall | InferenceCall }
 *                → HumanApproval → ResultingAction
 */

export type WorkflowStepKind = "inference_call" | "tool_call" | "human_approval" | "resulting_action";

export type AgentExecutionStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

/** A defined, versioned agent workflow (a plan of steps). Not yet populated. */
export interface AgentWorkflow {
  id: string;
  key: string;
  version: string;
  name: string;
  description: string;
  active: boolean;
}

/** A single run of a workflow. Not yet populated in Phase 2A. */
export interface AgentExecution {
  id: string;
  workflowId: string;
  status: AgentExecutionStatus;
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp | null;
  triggeredBy: string;
  stepIds: string[];
}

export interface WorkflowStep {
  id: string;
  executionId: string;
  index: number;
  kind: WorkflowStepKind;
  label: string;
  refId: string | null; // → ToolCall / InferenceCall / HumanApproval / ResultingAction
}

/** A call to an external/enterprise tool (CMMS, historian, ERP …). Future. */
export interface ToolCall {
  id: string;
  tool: string;
  operation: string;
  requestSummary: string;
  responseSummary: string | null;
  latencyMs: number | null;
}

/**
 * A model/inference call. THIS is what Phase 2A records (as `AiInteraction`).
 * A model call is an inference call — never an "agent run".
 */
export interface InferenceCall {
  id: string;
  provider: AiProviderId;
  model: string;
  promptVersionId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  evidenceIds: string[];
}

/** A human approval step within an execution. Future. */
export interface HumanApprovalRef {
  id: string;
  decisionId: string | null;
  requiredCapability: string;
  status: "pending" | "approved" | "rejected" | "modified";
}

/** A concrete action resulting from an execution (work request, WO …). Future. */
export interface ResultingAction {
  id: string;
  kind: string;
  targetType: string;
  targetId: string | null;
  status: "proposed" | "executed" | "reverted";
}
