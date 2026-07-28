import type { PersonaId } from "./types";
import { PERSONA_ORDER } from "./registry";

/**
 * Persona authorization boundary.
 *
 * Persona selection is a VIEW concern, not authentication. This interface is the
 * seam where authenticated user roles will later supply the set of personas a
 * user is permitted to assume. The persona selector must only ever offer
 * personas returned by `getPermittedPersonas()`, and capability checks are still
 * enforced independently (switching persona never bypasses a capability check).
 *
 * Phase 2A ships only the demo provider (unrestricted). No production
 * authentication is implemented here.
 */
export interface PersonaAuthorizationProvider {
  /** Personas the current user may assume. The selector shows only these. */
  getPermittedPersonas(): PersonaId[];
  isPersonaPermitted(id: PersonaId): boolean;
  /** True when unrestricted switching is a demonstration convenience. */
  readonly unrestricted: boolean;
  /** Short label describing the authorization mode (shown in the UI). */
  readonly modeLabel: string;
}

/**
 * Demo provider — permits ALL personas and flags itself as unrestricted so the
 * UI can clearly mark free switching as a demonstration capability. A future
 * `RoleBasedAuthorizationProvider` would implement the same interface, deriving
 * permitted personas from the authenticated user's roles.
 */
export class DemoAuthorizationProvider implements PersonaAuthorizationProvider {
  readonly unrestricted = true;
  readonly modeLabel = "Demonstration — unrestricted persona switching";

  getPermittedPersonas(): PersonaId[] {
    return [...PERSONA_ORDER];
  }

  isPersonaPermitted(id: PersonaId): boolean {
    return PERSONA_ORDER.includes(id);
  }
}

let provider: PersonaAuthorizationProvider = new DemoAuthorizationProvider();

export function getAuthorizationProvider(): PersonaAuthorizationProvider {
  return provider;
}

/** Test/seam hook to swap the provider (e.g. a role-based one later). */
export function setAuthorizationProvider(next: PersonaAuthorizationProvider): void {
  provider = next;
}
