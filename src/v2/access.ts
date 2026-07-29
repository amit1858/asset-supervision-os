import { personaCan } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import { getV2Route, type V2Route } from "./routes";

/**
 * V2 route access — capability-driven, never persona-name driven.
 *
 * A route with an `access.anyOf` list is reachable only by personas holding at
 * least one of those capabilities; a route with no rule is a home/landing
 * surface open to any persona. Access is always evaluated through the capability
 * model (registry `personaCan`) so switching persona can never grant authority
 * via client state (blueprint §4, decisions §7).
 */

export function canAccessV2Route(personaId: PersonaId, key: string): boolean {
  const route = getV2Route(key);
  if (!route) return false;
  return routeAllows(personaId, route);
}

export function routeAllows(personaId: PersonaId, route: V2Route): boolean {
  if (!route.access) return true;
  return route.access.anyOf.some((cap) => personaCan(personaId, cap));
}

/**
 * A human-readable explanation of why a route is restricted for a persona —
 * used by restricted states so the missing authority is explained, never
 * conveyed by colour or silence alone (accessibility §10).
 */
export function restrictionReason(personaId: PersonaId, key: string): string | null {
  const route = getV2Route(key);
  if (!route || routeAllows(personaId, route)) return null;
  return `${route.title} requires a capability the current persona does not hold.`;
}
