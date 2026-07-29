import type { PersonaId } from "@/personas/types";
import { PERSONAS } from "@/personas/registry";
import { getV2Route, V2_BASE, type V2Route } from "./routes";

/**
 * The persistent operational thread — the continuous story that links personas,
 * mirroring the domain chain (blueprint §5):
 *
 *   Signal → condition change → risk assessment → intervention decision →
 *   work planning → spare availability → turnaround scope → value realisation →
 *   governed AI activity.
 *
 * Phase 1 delivers the thread indicator, context preservation, and the
 * navigation seam only — NOT the detailed workflow, and no fabricated events,
 * approvals, or outcomes. The thread is asset-agnostic: it is built from the
 * active asset tag, so K-201 is the first reference story without any per-tag
 * conditionals baked into components (decision §6).
 */

export interface OperationalThreadStage {
  key: string;
  label: string;
  description: string;
  /** The persona accountable for acting next at this stage. */
  ownerPersona: PersonaId;
  ownerName: string;
  /** The v2 route where this stage's work lives. */
  routeKey: string;
  /** Context-preserving href into `/v2` for the given asset. */
  href: string;
  /** True when the currently-viewing persona owns this stage. */
  isCurrent: boolean;
}

export interface OperationalThread {
  assetTag: string;
  stages: OperationalThreadStage[];
  /** Convenience link to the canonical asset record. */
  assetRecordHref: string;
}

interface StageSpec {
  key: string;
  label: string;
  description: string;
  ownerPersona: PersonaId;
  routeKey: string;
}

/** Ordered thread stages and their accountable personas (blueprint §5 table). */
const STAGE_SPECS: StageSpec[] = [
  {
    key: "signal",
    label: "Signal & condition",
    description: "Signal and condition response on the operating unit.",
    ownerPersona: "shift_supervisor",
    routeKey: "shift",
  },
  {
    key: "risk",
    label: "Risk assessment",
    description: "Failure-mode investigation and projected time-to-critical.",
    ownerPersona: "reliability_engineer",
    routeKey: "watchlist",
  },
  {
    key: "decision",
    label: "Intervention decision",
    description: "Human decision on the reliability recommendation.",
    ownerPersona: "reliability_manager",
    routeKey: "reliability",
  },
  {
    key: "planning",
    label: "Work planning",
    description: "Job planning and execution readiness.",
    ownerPersona: "maintenance_planner",
    routeKey: "planning",
  },
  {
    key: "materials",
    label: "Spare availability",
    description: "Spare availability and material expedites.",
    ownerPersona: "materials_coordinator",
    routeKey: "materials",
  },
  {
    key: "turnaround",
    label: "Turnaround scope",
    description: "Scope decision for the next turnaround.",
    ownerPersona: "turnaround_manager",
    routeKey: "turnaround",
  },
  {
    key: "value",
    label: "Value realisation",
    description: "Outcome validation and realised value.",
    ownerPersona: "plant_manager",
    routeKey: "value-realisation",
  },
  {
    key: "ai",
    label: "Governed AI",
    description: "AI grounding, evidence, and value & cost governance.",
    ownerPersona: "ai_admin",
    routeKey: "agent-control",
  },
];

/** Build a context-preserving href into a v2 route for a given asset tag. */
function stageHref(route: V2Route, tag: string): string {
  if (route.key === "asset-360") return `${route.path}/${tag}`;
  if (route.assetAware) return `${route.path}?asset=${tag}`;
  return route.path;
}

/**
 * Build the operational thread for an asset. Pure and deterministic — takes only
 * the asset tag and the currently-viewing persona (to highlight the stage that
 * persona owns). No events or outcomes are invented; stages describe WHO acts
 * WHERE next, which is the Phase 1 navigation seam.
 */
export function buildOperationalThread(
  assetTag: string,
  activePersonaId?: PersonaId | null,
): OperationalThread {
  const stages: OperationalThreadStage[] = STAGE_SPECS.map((spec) => {
    const route = getV2Route(spec.routeKey);
    const href = route ? stageHref(route, assetTag) : V2_BASE;
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      ownerPersona: spec.ownerPersona,
      ownerName: PERSONAS[spec.ownerPersona].displayName,
      routeKey: spec.routeKey,
      href,
      isCurrent: activePersonaId != null && spec.ownerPersona === activePersonaId,
    };
  });

  return {
    assetTag,
    stages,
    assetRecordHref: `${V2_BASE}/assets/${assetTag}`,
  };
}
