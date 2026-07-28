import type { PersonaDefinition, PersonaId, Capability } from "./types";

/**
 * Central persona registry — the single source of truth. Persona behaviour is
 * driven from this data, never from hard-coded persona-name conditionals spread
 * through components. Components read `navItems`/`capabilities` from here.
 */

const PLANT = "plant-gc";
const UNIT = "line-hds2";

export const PERSONAS: Record<PersonaId, PersonaDefinition> = {
  plant_manager: {
    id: "plant_manager",
    displayName: "Plant Manager",
    family: "leadership",
    description:
      "Site leadership accountable for safe, reliable, profitable operation of the plant.",
    accountability:
      "Overall plant safety, reliability, production, and financial performance.",
    primaryQuestions: [
      "Is the plant safe and stable right now?",
      "What decisions need my authority today?",
      "Where is production and margin most at risk?",
      "Are we ready for the upcoming turnaround?",
    ],
    defaultRoute: "/plant-overview",
    navItems: [
      { label: "Plant Overview", href: "/plant-overview", icon: "overview" },
      { label: "Reliability", href: "/reliability", icon: "reliability", capability: "view_asset_condition" },
      { label: "OEE & Losses", href: "/oee", icon: "oee", capability: "view_plant_performance" },
      { label: "Turnaround", href: "/turnaround", icon: "turnaround" },
      { label: "Value Realisation", href: "/value-realisation", icon: "value", capability: "view_value_realisation" },
    ],
    capabilities: [
      "view_plant_performance",
      "view_oee_impact",
      "view_asset_condition",
      "view_value_realisation",
      "review_ai_evidence",
      "approve_reliability_decision",
      "approve_turnaround_scope",
      "validate_operational_outcome",
    ],
    approvalAuthority: [
      "approve_reliability_decision",
      "approve_turnaround_scope",
      "validate_operational_outcome",
    ],
    readWriteScope: {
      read: ["plant", "assets", "oee", "turnaround", "recommendations", "value_realisation"],
      write: ["decisions", "outcomes", "turnaround_approvals"],
    },
    context: { plantId: PLANT, timeRange: "90d" },
    kpis: ["Plant OEE", "Open-decision value at stake", "Turnaround readiness", "Assets in critical condition"],
    collaborators: ["reliability_manager", "turnaround_manager", "shift_supervisor", "ai_admin"],
  },

  shift_supervisor: {
    id: "shift_supervisor",
    displayName: "Operations Shift Supervisor",
    family: "operations",
    description:
      "Front-line operations leader running the unit safely through the current shift.",
    accountability: "Safe, stable operation and response during the active shift.",
    primaryQuestions: [
      "What is happening on my unit right now?",
      "What needs an operating response this shift?",
      "Which assets are deviating from normal?",
      "What must I hand over to the next shift?",
    ],
    defaultRoute: "/shift",
    navItems: [
      { label: "Shift Command", href: "/shift", icon: "shift" },
      { label: "Asset Condition", href: "/assets/K-201", icon: "asset", capability: "view_asset_condition" },
      { label: "OEE & Losses", href: "/oee", icon: "oee", capability: "view_plant_performance" },
    ],
    capabilities: [
      "view_plant_performance",
      "view_asset_condition",
      "issue_operating_instruction",
      "create_work_request",
      "review_ai_evidence",
    ],
    approvalAuthority: ["issue_operating_instruction"],
    readWriteScope: {
      read: ["plant", "assets", "oee", "condition_events"],
      write: ["operating_instructions", "work_requests"],
    },
    context: { plantId: PLANT, unitId: UNIT, timeRange: "shift", shift: "Day shift (06:00–18:00)" },
    kpis: ["Unit availability", "Active deviations", "Open work requests", "Shift OEE"],
    collaborators: ["plant_manager", "reliability_engineer", "maintenance_planner"],
  },

  reliability_manager: {
    id: "reliability_manager",
    displayName: "Reliability Manager",
    family: "reliability",
    description:
      "Owns the asset reliability program and the reliability recommendation queue.",
    accountability:
      "Asset risk portfolio, reliability decisions, and reliability-driven value.",
    primaryQuestions: [
      "Which decisions require my attention now?",
      "Which asset risks are time-critical?",
      "Is maintenance execution ready to act?",
      "Which risks belong in the next turnaround?",
    ],
    defaultRoute: "/reliability",
    navItems: [
      { label: "Reliability Command Center", href: "/reliability", icon: "reliability" },
      { label: "Asset Risk Portfolio", href: "/portfolio", icon: "portfolio", capability: "view_asset_condition" },
      { label: "OEE Loss Intelligence", href: "/oee", icon: "oee", capability: "view_plant_performance" },
      { label: "Turnaround Candidates", href: "/turnaround-candidates", icon: "candidates" },
      { label: "Asset 360", href: "/assets/K-201", icon: "asset", capability: "view_asset_condition" },
    ],
    capabilities: [
      "view_plant_performance",
      "view_asset_condition",
      "investigate_failure_mode",
      "create_reliability_recommendation",
      "approve_reliability_decision",
      "review_ai_evidence",
      "validate_operational_outcome",
      "create_work_request",
    ],
    approvalAuthority: ["approve_reliability_decision", "validate_operational_outcome"],
    readWriteScope: {
      read: ["plant", "assets", "oee", "turnaround", "recommendations", "ai"],
      write: ["recommendations", "decisions", "outcomes", "work_requests"],
    },
    context: { plantId: PLANT, unitId: UNIT, timeRange: "30d" },
    kpis: ["Decisions requiring attention", "Time-critical risks", "Asset risk portfolio", "Reliability value at stake"],
    collaborators: ["reliability_engineer", "maintenance_planner", "turnaround_manager", "plant_manager"],
  },

  reliability_engineer: {
    id: "reliability_engineer",
    displayName: "Reliability Engineer",
    family: "reliability",
    description:
      "Investigates asset condition and failure modes and drafts recommendations.",
    accountability: "Technical assessment of asset condition and failure modes.",
    primaryQuestions: [
      "Which assets on my watchlist are deteriorating?",
      "What is the failure mode and the evidence?",
      "How fast is the trend approaching critical?",
      "What should I recommend, and with what evidence?",
    ],
    defaultRoute: "/watchlist",
    navItems: [
      { label: "Asset Watchlist", href: "/watchlist", icon: "watchlist" },
      { label: "Asset 360", href: "/assets/K-201", icon: "asset", capability: "view_asset_condition" },
      { label: "OEE Impact", href: "/oee", icon: "oee", capability: "view_oee_impact" },
    ],
    capabilities: [
      "view_asset_condition",
      "view_oee_impact",
      "investigate_failure_mode",
      "create_reliability_recommendation",
      "review_ai_evidence",
      "create_work_request",
    ],
    approvalAuthority: [],
    readWriteScope: {
      read: ["assets", "condition_events", "oee", "recommendations", "ai"],
      write: ["recommendations", "work_requests"],
    },
    context: { plantId: PLANT, unitId: UNIT, timeRange: "90d" },
    kpis: ["Watchlist assets", "Deteriorating trends", "Projected time-to-critical", "Drafted recommendations"],
    collaborators: ["reliability_manager", "maintenance_planner", "shift_supervisor"],
  },

  maintenance_planner: {
    id: "maintenance_planner",
    displayName: "Maintenance Planner",
    family: "maintenance",
    description: "Turns approved work into ready-to-execute job plans and schedules.",
    accountability: "Work order preparation, job plans, and execution readiness.",
    primaryQuestions: [
      "What work is approved and needs planning?",
      "Which job plans are missing parts or labour?",
      "What can be scheduled this week?",
      "What is blocking execution readiness?",
    ],
    defaultRoute: "/planning",
    navItems: [
      { label: "Planning Workbench", href: "/planning", icon: "planning" },
      { label: "Asset 360", href: "/assets/K-201", icon: "asset", capability: "view_asset_condition" },
      { label: "Material Exceptions", href: "/materials", icon: "materials", capability: "reserve_spare" },
    ],
    capabilities: [
      "view_asset_condition",
      "create_work_request",
      "prepare_work_order",
      "manage_job_plan",
      "reserve_spare",
      "review_ai_evidence",
    ],
    approvalAuthority: [],
    readWriteScope: {
      read: ["assets", "work_orders", "spares", "inventory"],
      write: ["work_orders", "job_plans", "spare_reservations"],
    },
    context: { plantId: PLANT, unitId: UNIT, timeRange: "7d" },
    kpis: ["Work orders to plan", "Job-plan readiness", "Parts-constrained orders", "Scheduled this week"],
    collaborators: ["reliability_manager", "materials_coordinator", "shift_supervisor"],
  },

  materials_coordinator: {
    id: "materials_coordinator",
    displayName: "Materials & Spares Coordinator",
    family: "materials",
    description: "Ensures critical spares and materials are available when work needs them.",
    accountability: "Spare availability, reservations, and material expedites.",
    primaryQuestions: [
      "Which work is blocked by materials?",
      "Which critical spares are below reorder point?",
      "What must be expedited, and by when?",
      "What is reserved against upcoming work?",
    ],
    defaultRoute: "/materials",
    navItems: [
      { label: "Material Exceptions", href: "/materials", icon: "materials" },
      { label: "Planning Context", href: "/planning", icon: "planning", capability: "view_work_planning" },
    ],
    capabilities: ["view_asset_condition", "view_work_planning", "reserve_spare", "expedite_material"],
    approvalAuthority: [],
    readWriteScope: {
      read: ["spares", "inventory", "work_orders"],
      write: ["spare_reservations", "expedites"],
    },
    context: { plantId: PLANT, timeRange: "30d" },
    kpis: ["Material-blocked work", "Critical spares below reorder", "Open expedites", "Longest lead time"],
    collaborators: ["maintenance_planner", "turnaround_manager", "reliability_manager"],
  },

  turnaround_manager: {
    id: "turnaround_manager",
    displayName: "Turnaround Manager",
    family: "turnaround",
    description: "Owns turnaround scope, readiness, and execution for the plant.",
    accountability: "Turnaround scope, readiness, schedule, and cost.",
    primaryQuestions: [
      "Is scope frozen and ready by the freeze date?",
      "Which packages are on the critical path and at risk?",
      "Which emerging asset risks belong in scope?",
      "Where is schedule and cost exposure?",
    ],
    defaultRoute: "/turnaround",
    navItems: [
      { label: "Turnaround Control Tower", href: "/turnaround", icon: "turnaround" },
      { label: "Turnaround Candidates", href: "/turnaround-candidates", icon: "candidates" },
      { label: "OEE Loss Intelligence", href: "/oee", icon: "oee", capability: "view_plant_performance" },
    ],
    capabilities: [
      "view_plant_performance",
      "view_asset_condition",
      "modify_turnaround_scope",
      "approve_turnaround_scope",
      "review_ai_evidence",
    ],
    approvalAuthority: ["approve_turnaround_scope"],
    readWriteScope: {
      read: ["turnaround", "assets", "work_orders", "spares"],
      write: ["turnaround_scope", "turnaround_approvals"],
    },
    context: { plantId: PLANT, timeRange: "90d" },
    kpis: ["Scope readiness", "Critical-path at risk", "Scoped cost vs budget", "Days to scope freeze"],
    collaborators: ["reliability_manager", "materials_coordinator", "plant_manager"],
  },

  ai_admin: {
    id: "ai_admin",
    displayName: "AI Control Tower Administrator",
    family: "ai_governance",
    description:
      "Governs the AI agents, model runtime, prompt versions, and token economics.",
    accountability: "AI agent health, model runtime configuration, and AI value governance.",
    primaryQuestions: [
      "Are the agents healthy and grounded in evidence?",
      "What is the actual vs estimated cost of AI?",
      "Which providers/models are configured?",
      "Is projected value being separated from realised?",
    ],
    defaultRoute: "/agent-control",
    navItems: [
      { label: "Agent Control Tower", href: "/agent-control", icon: "agent" },
      { label: "Value & Cost", href: "/agent-control?tab=value-cost", icon: "value", capability: "view_token_economics" },
      { label: "Model Runtime", href: "/agent-control?tab=runtime", icon: "agent", capability: "configure_model_runtime" },
    ],
    capabilities: [
      "monitor_agent_runs",
      "review_ai_evidence",
      "configure_model_runtime",
      "view_token_economics",
    ],
    approvalAuthority: ["configure_model_runtime"],
    readWriteScope: {
      read: ["ai", "prompts", "interactions", "recommendations"],
      write: ["model_runtime", "prompt_versions"],
    },
    context: { plantId: PLANT, timeRange: "30d" },
    kpis: ["Actual AI cost", "Estimated provider cost", "Acceptance rate", "Agent run health"],
    collaborators: ["plant_manager", "reliability_manager"],
  },
};

/** Default persona when none is stored — owns the K-201 reliability story. */
export const DEFAULT_PERSONA_ID: PersonaId = "reliability_manager";

export const PERSONA_ORDER: PersonaId[] = [
  "plant_manager",
  "shift_supervisor",
  "reliability_manager",
  "reliability_engineer",
  "maintenance_planner",
  "materials_coordinator",
  "turnaround_manager",
  "ai_admin",
];

export function listPersonas(): PersonaDefinition[] {
  return PERSONA_ORDER.map((id) => PERSONAS[id]);
}

export function getPersona(id: PersonaId): PersonaDefinition {
  return PERSONAS[id];
}

export function isPersonaId(value: string | null | undefined): value is PersonaId {
  return value != null && value in PERSONAS;
}

/** Capability check — prefer this over persona-name comparisons. */
export function personaCan(id: PersonaId, capability: Capability): boolean {
  return PERSONAS[id].capabilities.includes(capability);
}

export function personaDefaultRoute(id: PersonaId): string {
  return PERSONAS[id].defaultRoute;
}
