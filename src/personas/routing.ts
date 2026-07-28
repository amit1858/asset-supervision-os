import type { PersonaId } from "./types";
import { PERSONAS } from "./registry";

/**
 * Where a persona should land, given the current operational context. When an
 * asset is the active thread, personas that work at the asset level land in
 * their asset-relevant view (preserving the thread) rather than their generic
 * home. Example: Engineer on K-201 → switch to Maintenance Planner → land in
 * the Planning Workbench focused on K-201.
 */
const ASSET_ENTRY: Partial<Record<PersonaId, (tag: string) => string>> = {
  reliability_engineer: (tag) => `/assets/${tag}`,
  reliability_manager: (tag) => `/assets/${tag}`,
  shift_supervisor: (tag) => `/assets/${tag}`,
  maintenance_planner: (tag) => `/planning?asset=${tag}`,
  materials_coordinator: (tag) => `/materials?asset=${tag}`,
  turnaround_manager: (tag) => `/turnaround?asset=${tag}`,
};

export function personaLandingRoute(
  personaId: PersonaId,
  ctx?: { assetTag?: string | null },
): string {
  const tag = ctx?.assetTag;
  if (tag) {
    const entry = ASSET_ENTRY[personaId];
    if (entry) return entry(tag);
  }
  return PERSONAS[personaId].defaultRoute;
}
