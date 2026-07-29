import { PERSONAS, personaCan } from "@/personas/registry";
import { personaLandingRoute } from "@/personas/routing";
import type { PersonaId, PersonaNavItem } from "@/personas/types";
import { V2_BASE } from "./routes";

/**
 * V2 navigation mapping.
 *
 * The typed persona registry stays the single source of truth (decision §3): we
 * do NOT hand-author a second v2 navigation system. Instead we reuse each
 * persona's `navItems` and map their v1 hrefs into the `/v2` namespace, so nav
 * content, ordering, and capability gating all remain data-driven from the
 * registry. Business data is never edited to add a v2 attribute.
 */

/** Explicit v1 → v2 path map for renamed routes (bases only, no query). */
const V1_TO_V2: Record<string, string> = {
  "/plant-overview": "/v2/plant",
  "/shift": "/v2/shift",
  "/reliability": "/v2/reliability",
  "/watchlist": "/v2/watchlist",
  "/planning": "/v2/planning",
  "/materials": "/v2/materials",
  "/turnaround": "/v2/turnaround",
  "/turnaround-candidates": "/v2/turnaround-candidates",
  "/oee": "/v2/oee",
  "/portfolio": "/v2/portfolio",
  "/value-realisation": "/v2/value-realisation",
  "/agent-control": "/v2/agent-control",
};

/**
 * Map a registry href (v1) into its `/v2` equivalent, preserving any query
 * string. Asset records (`/assets/<tag>`) are prefixed into the v2 namespace so
 * the mapping stays asset-agnostic — no per-tag conditionals.
 */
export function toV2Href(href: string): string {
  const [path = "/", query] = href.split("?");
  const suffix = query ? `?${query}` : "";

  if (path === "/") return V2_BASE + suffix;
  if (path.startsWith("/assets/") || path === "/assets") {
    return `${V2_BASE}${path}${suffix}`;
  }
  const mapped = V1_TO_V2[path];
  return (mapped ?? `${V2_BASE}${path}`) + suffix;
}

export interface V2NavItem extends PersonaNavItem {
  /** The v2-namespaced href actually used by the shell nav. */
  v2Href: string;
}

/**
 * The persona's navigation for `/v2`, derived from the registry: capability-gated
 * items are hidden unless the persona holds the capability, and every href is
 * mapped into the `/v2` namespace. The `/design-system` showcase can never
 * appear here because it is not a registry nav item (decision §4).
 */
export function v2NavItems(personaId: PersonaId): V2NavItem[] {
  return PERSONAS[personaId].navItems
    .filter((item) => !item.capability || personaCan(personaId, item.capability))
    .map((item) => ({ ...item, v2Href: toV2Href(item.href) }));
}

/**
 * Where a persona lands in `/v2`, preserving the active operational thread. Built
 * on the existing `personaLandingRoute` so context (e.g. K-201) is carried into
 * the persona's asset-relevant view rather than a generic home.
 */
export function v2LandingRoute(
  personaId: PersonaId,
  ctx?: { assetTag?: string | null },
): string {
  return toV2Href(personaLandingRoute(personaId, ctx));
}
