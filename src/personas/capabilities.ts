import type { Capability } from "./types";

/**
 * Capability metadata — the central capability vocabulary with human-readable
 * labels and whether a capability is an authority/approval action. Components
 * check capabilities (not persona names) via `personaCan` in `registry.ts`.
 */
export interface CapabilityMeta {
  id: Capability;
  label: string;
  description: string;
  /** Authority actions gate approvals, instructions, validation, config. */
  authority: boolean;
}

export const CAPABILITIES: Record<Capability, CapabilityMeta> = {
  view_plant_performance: { id: "view_plant_performance", label: "View & manage plant performance", description: "Plant/unit performance authority: OEE, losses, and financial impact across the unit.", authority: false },
  view_oee_impact: { id: "view_oee_impact", label: "View OEE impact (read-only)", description: "Read-only visibility of asset-linked OEE and production impact.", authority: false },
  view_asset_condition: { id: "view_asset_condition", label: "View asset condition", description: "See asset health, sensor trends, and condition events.", authority: false },
  view_work_planning: { id: "view_work_planning", label: "View work planning (read-only)", description: "Read-only visibility of work orders, material demand, and planning context.", authority: false },
  view_value_realisation: { id: "view_value_realisation", label: "View value realisation", description: "See validated operational outcomes, realised value, decisions supported, and outstanding validation.", authority: false },
  investigate_failure_mode: { id: "investigate_failure_mode", label: "Investigate failure mode", description: "Open technical evidence and failure-mode investigation.", authority: false },
  create_reliability_recommendation: { id: "create_reliability_recommendation", label: "Create reliability recommendation", description: "Author an evidence-backed reliability recommendation.", authority: false },
  approve_reliability_decision: { id: "approve_reliability_decision", label: "Approve reliability decision", description: "Approve, modify, or reject a reliability recommendation.", authority: true },
  issue_operating_instruction: { id: "issue_operating_instruction", label: "Issue operating instruction", description: "Issue an operating instruction to the shift.", authority: true },
  create_work_request: { id: "create_work_request", label: "Create work request", description: "Raise a work request against an asset.", authority: false },
  prepare_work_order: { id: "prepare_work_order", label: "Prepare work order", description: "Prepare and schedule a work order.", authority: false },
  manage_job_plan: { id: "manage_job_plan", label: "Manage job plan", description: "Build and manage job plans and task lists.", authority: false },
  reserve_spare: { id: "reserve_spare", label: "Reserve spare", description: "Reserve a spare part against a work order.", authority: false },
  expedite_material: { id: "expedite_material", label: "Expedite material", description: "Expedite procurement of a critical material.", authority: false },
  modify_turnaround_scope: { id: "modify_turnaround_scope", label: "Modify turnaround scope", description: "Add or change turnaround work packages.", authority: false },
  approve_turnaround_scope: { id: "approve_turnaround_scope", label: "Approve turnaround scope", description: "Freeze and approve turnaround scope.", authority: true },
  monitor_agent_runs: { id: "monitor_agent_runs", label: "Monitor AI runtime activity", description: "Monitor AI runtime activity, inference runs, prompts, and health.", authority: false },
  review_ai_evidence: { id: "review_ai_evidence", label: "Review AI evidence", description: "Review the evidence grounding an AI explanation.", authority: false },
  configure_model_runtime: { id: "configure_model_runtime", label: "Configure model runtime", description: "Configure providers, models, and runtimes.", authority: true },
  view_token_economics: { id: "view_token_economics", label: "View token economics", description: "View Return on Token Spend and AI cost accounting (ledgers, provider pricing).", authority: false },
  validate_operational_outcome: { id: "validate_operational_outcome", label: "Validate operational outcome", description: "Validate an operational outcome and realised value.", authority: true },
  endorse_high_exposure_reliability_decision: { id: "endorse_high_exposure_reliability_decision", label: "Endorse high-exposure reliability decision", description: "Endorse, or decline endorsement of, an approved reliability decision whose exposure meets the high-exposure threshold.", authority: true },
};

export const ALL_CAPABILITIES: Capability[] = Object.keys(CAPABILITIES) as Capability[];

export function isAuthorityCapability(cap: Capability): boolean {
  return CAPABILITIES[cap].authority;
}
