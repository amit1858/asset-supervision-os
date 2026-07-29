import type { Capability, PersonaId } from "@/personas/types";

/**
 * V2 route registry — the single, data-driven description of the `/v2`
 * information architecture from docs/V2_PRODUCT_EXPERIENCE_BLUEPRINT.md §4.
 *
 * This is a PRESENTATION namespace, not a fork of logic: every `/v2` route
 * consumes the existing domain/engines/repository/registry/brief/voice. The
 * registry is deliberately asset-agnostic and free of persona-name conditionals
 * so shared components can be driven from data (blueprint decisions §6, §3).
 */

export const V2_BASE = "/v2";

/** Where a route sits in the IA — a persona home vs a shared operational surface. */
export type V2RouteKind = "persona_workspace" | "shared_surface" | "system";

/** Honest source/integration posture for a route (never fabricated). */
export type V2SourceState = "seeded" | "derived" | "not_connected";

export interface V2Route {
  /** Stable key (also used by nav, guards, thread, and tests). */
  key: string;
  /** Canonical `/v2` path. */
  path: string;
  kind: V2RouteKind;
  /** Business-readable page name. */
  title: string;
  /** The persona primarily accountable for this surface. */
  ownerPersona: PersonaId;
  /** The primary job to be done here. */
  purpose: string;
  /** What Phase 2 will build in this surface (honest placeholder copy). */
  phase2: string;
  /** Underlying source posture, surfaced honestly in the UI. */
  source: V2SourceState;
  /**
   * Access rule. A persona may reach the route if it holds ANY of these
   * capabilities. Omitted → open to every persona (a home/landing surface).
   */
  access?: { anyOf: Capability[] };
  /** True for routes reachable as an asset thread (accept `?asset=` / `[tag]`). */
  assetAware?: boolean;
}

/**
 * The V2 routes. Persona homes first (mirroring the eight personas), then the
 * shared, context-preserving operational surfaces. The `/design-system`
 * showcase is intentionally absent — it is never a customer route (decision §4).
 */
export const V2_ROUTES: V2Route[] = [
  {
    key: "plant",
    path: "/v2/plant",
    kind: "persona_workspace",
    title: "Plant Executive Overview",
    ownerPersona: "plant_manager",
    purpose:
      "One decision awaiting authority, turnaround readiness, and realised-value availability across the plant.",
    phase2:
      "Executive morning brief, decisions requiring authority, risk-ranked attention assets, turnaround readiness, and value at stake.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "shift",
    path: "/v2/shift",
    kind: "persona_workspace",
    title: "Shift Command",
    ownerPersona: "shift_supervisor",
    purpose:
      "Unit status now, active deviations, and the operating response needed this shift.",
    phase2:
      "Unit status, active deviations, operating actions this shift, open work requests, and shift handover. Shift-grain OEE stays marked unavailable.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "reliability",
    path: "/v2/reliability",
    kind: "persona_workspace",
    title: "Reliability Command Center",
    ownerPersona: "reliability_manager",
    purpose:
      "Decisions requiring attention, time-critical asset risks, execution readiness, and production impact.",
    phase2:
      "Approval queue, time-critical risks, maintenance readiness, material exceptions, emerging turnaround candidates, and OEE impact.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "watchlist",
    path: "/v2/watchlist",
    kind: "persona_workspace",
    title: "Asset Watchlist",
    ownerPersona: "reliability_engineer",
    purpose:
      "Deteriorating trends, projected time-to-critical, and evidence-backed draft recommendations.",
    phase2:
      "Watchlist of deteriorating assets, projected time-to-critical, drafted recommendations, and evidence capture into Asset 360.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "planning",
    path: "/v2/planning",
    kind: "persona_workspace",
    title: "Planning Workbench",
    ownerPersona: "maintenance_planner",
    purpose:
      "Turn approved work into ready-to-execute job plans and surface execution blockers.",
    phase2:
      "Approved work to plan, job-plan readiness, parts-constrained orders, schedulable-this-week, and execution blockers. Reserve spare / prepare work order.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "materials",
    path: "/v2/materials",
    kind: "persona_workspace",
    title: "Material Exceptions",
    ownerPersona: "materials_coordinator",
    purpose:
      "Material-blocked work, critical spares below reorder, and expedites against upcoming work.",
    phase2:
      "Material-blocked work, critical spares below reorder point, open expedites, and reservations against upcoming work. Expedite material / reserve spare.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "turnaround",
    path: "/v2/turnaround",
    kind: "persona_workspace",
    title: "Turnaround Control Tower",
    ownerPersona: "turnaround_manager",
    purpose:
      "Scope readiness, critical-path risk, and schedule/cost exposure ahead of scope freeze.",
    phase2:
      "Scope readiness (engineering/materials/labour/permits), critical-path at risk, emerging candidates, schedule/cost exposure, and days to freeze.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "agent-control",
    path: "/v2/agent-control",
    kind: "persona_workspace",
    title: "AI Control Tower",
    ownerPersona: "ai_admin",
    purpose:
      "Agent health, model runtime, and AI value & cost — including Return on Token Spend.",
    phase2:
      "Agents (run health, grounding review), Runtime (providers/models/prompt versions), and Value & Cost (ROTS, tokens, acceptance funnel, projected vs realised).",
    source: "seeded",
    access: { anyOf: ["monitor_agent_runs"] },
  },

  // Shared operational surfaces (context-preserving, reachable from many personas).
  {
    key: "asset-360",
    path: "/v2/assets",
    kind: "shared_surface",
    title: "Asset 360",
    ownerPersona: "reliability_engineer",
    purpose:
      "The canonical asset record — identity, condition, the Signal→Value thread, and the governed recommendation.",
    phase2:
      "Identity/status header, Signal→…→Value timeline, sensor trends, risk, condition events, work orders, spares, recommendation + AI rationale, human decision, and linked turnaround package.",
    source: "seeded",
    access: { anyOf: ["view_asset_condition"] },
    assetAware: true,
  },
  {
    key: "oee",
    path: "/v2/oee",
    kind: "shared_surface",
    title: "OEE & Loss Intelligence",
    ownerPersona: "reliability_manager",
    purpose:
      "Overall equipment effectiveness and the largest production losses for the unit.",
    phase2:
      "OEE gauge (availability/performance/quality), loss waterfall, and asset-linked production-loss attribution.",
    source: "seeded",
    access: { anyOf: ["view_plant_performance", "view_oee_impact"] },
    assetAware: true,
  },
  {
    key: "portfolio",
    path: "/v2/portfolio",
    kind: "shared_surface",
    title: "Asset Risk Portfolio",
    ownerPersona: "reliability_manager",
    purpose:
      "Deterministic asset-risk ranking across the monitored portfolio.",
    phase2:
      "Risk-ranked portfolio table with criticality, health, projected time-to-critical, and open recommendations.",
    source: "seeded",
    access: { anyOf: ["view_asset_condition"] },
    assetAware: true,
  },
  {
    key: "turnaround-candidates",
    path: "/v2/turnaround-candidates",
    kind: "shared_surface",
    title: "Turnaround Candidates",
    ownerPersona: "turnaround_manager",
    purpose:
      "Emerging asset risks raised from condition events that may belong in the next turnaround.",
    phase2:
      "Candidate work packages from condition events with readiness and a route into turnaround scope.",
    source: "seeded",
    assetAware: true,
  },
  {
    key: "value-realisation",
    path: "/v2/value-realisation",
    kind: "shared_surface",
    title: "Value Realisation",
    ownerPersona: "plant_manager",
    purpose:
      "Validated operational outcomes and realised value — separated from projected value. No token ledgers.",
    phase2:
      "Validated outcomes, decisions supported, projected vs realised value, and outstanding validation. Technical AI economics stay in the AI Control Tower.",
    source: "seeded",
    access: { anyOf: ["view_value_realisation"] },
  },
];

const BY_KEY = new Map(V2_ROUTES.map((r) => [r.key, r] as const));
const BY_PATH = new Map(V2_ROUTES.map((r) => [r.path, r] as const));

export function listV2Routes(): V2Route[] {
  return V2_ROUTES;
}

export function getV2Route(key: string): V2Route | undefined {
  return BY_KEY.get(key);
}

export function getV2RouteByPath(path: string): V2Route | undefined {
  return BY_PATH.get(path);
}
