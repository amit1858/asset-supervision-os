/**
 * Persona architecture — shared types.
 *
 * Personas describe WHO is using the product and WHAT they are accountable for.
 * They are a presentation/authorization concern, layered on top of the
 * deterministic domain. Persona selection is NOT authentication (see
 * `authorization.ts`).
 */

export type PersonaId =
  | "plant_manager"
  | "shift_supervisor"
  | "reliability_manager"
  | "reliability_engineer"
  | "maintenance_planner"
  | "materials_coordinator"
  | "turnaround_manager"
  | "ai_admin";

export type OperationalFamily =
  | "leadership"
  | "operations"
  | "reliability"
  | "maintenance"
  | "materials"
  | "turnaround"
  | "ai_governance";

/**
 * Central capability vocabulary. Authorization is expressed with capabilities,
 * NOT persona-name checks, so behaviour is stable if personas are re-scoped.
 */
export type Capability =
  | "view_plant_performance"
  | "view_oee_impact"
  | "view_asset_condition"
  | "view_work_planning"
  | "view_value_realisation"
  | "investigate_failure_mode"
  | "create_reliability_recommendation"
  | "approve_reliability_decision"
  | "issue_operating_instruction"
  | "create_work_request"
  | "prepare_work_order"
  | "manage_job_plan"
  | "reserve_spare"
  | "expedite_material"
  | "modify_turnaround_scope"
  | "approve_turnaround_scope"
  | "monitor_agent_runs"
  | "review_ai_evidence"
  | "configure_model_runtime"
  | "view_token_economics"
  | "validate_operational_outcome";

export type IconName =
  | "overview"
  | "shift"
  | "reliability"
  | "watchlist"
  | "planning"
  | "materials"
  | "turnaround"
  | "agent"
  | "asset"
  | "oee"
  | "value"
  | "portfolio"
  | "candidates";

export type TimeRangeKey = "7d" | "30d" | "90d" | "shift";

export interface PersonaNavItem {
  label: string;
  href: string;
  icon: IconName;
  /** If set, the item only appears when the persona holds this capability. */
  capability?: Capability;
}

/** Read/write scope over top-level domains (documentation + guard hints). */
export interface ReadWriteScope {
  read: string[];
  write: string[];
}

export interface PersonaContextPreference {
  plantId?: string;
  unitId?: string;
  timeRange: TimeRangeKey;
  shift?: string;
}

export interface PersonaDefinition {
  id: PersonaId;
  displayName: string;
  family: OperationalFamily;
  description: string;
  /** What the persona is on the hook for. */
  accountability: string;
  /** The questions this persona opens the product to answer. */
  primaryQuestions: string[];
  /** Where this persona lands by default. */
  defaultRoute: string;
  navItems: PersonaNavItem[];
  /** Everything the persona is permitted to do. */
  capabilities: Capability[];
  /** The subset of capabilities that constitute approval/authority actions. */
  approvalAuthority: Capability[];
  readWriteScope: ReadWriteScope;
  context: PersonaContextPreference;
  kpis: string[];
  collaborators: PersonaId[];
}
