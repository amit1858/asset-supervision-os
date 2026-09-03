import type { Capability, PersonaId } from "@/personas/types";
import {
  isEndorsementAct,
  ruleForAct,
  type AuthorizationPolicyRef,
  type GovernedAct,
} from "./authority-policy";

/**
 * Slice 2.2 — authority evaluation.
 *
 * Persona identity is NOT authorization. A governed act is authorised only when
 * ALL of the following hold, verified against SERVER-RESOLVED context — never
 * against anything the caller asserts in a submitted event:
 *
 *   1. the principal may assume the persona;
 *   2. the versioned V2 workflow policy permits that persona for the act;
 *   3. the persona holds the required governed capability.
 *
 * Self-endorsement prevention (an endorser may not be the approver) needs the
 * branded audit trail and is enforced by the governed case, not here.
 *
 * Nothing here reads a clock or a random source.
 */

/** How the assuming principal was authorised. Typed, never free-form. */
export type AuthorizationMode = "demonstration_unrestricted";

export interface AuthorizationDescriptor {
  readonly mode: AuthorizationMode;
  readonly policy: AuthorizationPolicyRef;
  /** Human-readable label. Separate from the machine-readable mode. */
  readonly label: string;
}

/**
 * Server-resolved identity of the human who performed a governed act. Minted by
 * the authority evaluation, never derived from a submitted event.
 */
export interface AuditActor {
  readonly principalId: string;
  readonly personaId: PersonaId;
  readonly authorization: AuthorizationDescriptor;
}

/**
 * Trusted authority context. The command orchestrator resolves the principal,
 * the assumed persona and the authorization descriptor server-side; the domain
 * boundary never reconstructs identity from the event payload.
 */
export interface AuthorityContext {
  readonly principalId: string;
  readonly personaId: PersonaId;
  readonly authorization: AuthorizationDescriptor;
}

/**
 * Capability resolution seam. An implementation verifies both that a principal
 * may assume a persona and that a persona holds a capability. The demonstration
 * implementation lives under `src/v2/server/**` and is visibly unrestricted.
 */
export interface CapabilityResolver {
  canAssume(principalId: string, personaId: PersonaId): boolean;
  personaHolds(personaId: PersonaId, capability: Capability): boolean;
}

export type AuthorityRejectionReason =
  | "actor_not_human"
  | "persona_not_permitted"
  | "persona_not_allowed_for_act"
  | "capability_not_held"
  | "self_endorsement_forbidden";

export type AuthorityDecision =
  | { readonly ok: true; readonly actor: AuditActor }
  | { readonly ok: false; readonly reason: AuthorityRejectionReason };

/**
 * Evaluate the three-condition authority check for a governed act. Returns the
 * minted `AuditActor` on success. Self-endorsement is NOT evaluated here.
 */
export function evaluateAuthority(
  act: GovernedAct,
  context: AuthorityContext,
  resolver: CapabilityResolver,
): AuthorityDecision {
  const rule = ruleForAct(act);

  if (!resolver.canAssume(context.principalId, context.personaId)) {
    return { ok: false, reason: "persona_not_permitted" };
  }
  if (!rule.allowedPersonaIds.includes(context.personaId)) {
    return { ok: false, reason: "persona_not_allowed_for_act" };
  }
  if (!resolver.personaHolds(context.personaId, rule.requiredCapability)) {
    return { ok: false, reason: "capability_not_held" };
  }

  return {
    ok: true,
    actor: Object.freeze({
      principalId: context.principalId,
      personaId: context.personaId,
      authorization: context.authorization,
    }),
  };
}

export { isEndorsementAct };
