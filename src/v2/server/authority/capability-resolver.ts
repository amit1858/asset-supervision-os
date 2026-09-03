import "server-only";

import {
  getAuthorizationProvider,
  type PersonaAuthorizationProvider,
} from "@/personas/authorization";
import { personaCan } from "@/personas/registry";
import type { Capability, PersonaId } from "@/personas/types";
import {
  authorizationPolicyRef,
  type AuthorizationDescriptor,
  type CapabilityResolver,
} from "@/v2/domain";

/**
 * Slice 2.2 — server-only capability resolver.
 *
 * Backs the domain `CapabilityResolver` seam with the demonstration persona
 * authorization provider. It answers two independent questions:
 *
 *  - `canAssume`  — may this principal assume this persona? (provider gate)
 *  - `personaHolds` — does this persona hold this governed capability? (registry)
 *
 * The demonstration provider is deliberately unrestricted and labels itself so —
 * it is NOT production authentication. The label surfaces verbatim in the
 * authorization descriptor committed to every authority audit record.
 */
export class DemonstrationCapabilityResolver implements CapabilityResolver {
  constructor(private readonly provider: PersonaAuthorizationProvider) {}

  canAssume(_principalId: string, personaId: PersonaId): boolean {
    return this.provider.isPersonaPermitted(personaId);
  }

  personaHolds(personaId: PersonaId, capability: Capability): boolean {
    return personaCan(personaId, capability);
  }

  descriptor(): AuthorizationDescriptor {
    return Object.freeze({
      mode: "demonstration_unrestricted" as const,
      policy: authorizationPolicyRef(),
      label: this.provider.modeLabel,
    });
  }
}

export function getCapabilityResolver(): DemonstrationCapabilityResolver {
  return new DemonstrationCapabilityResolver(getAuthorizationProvider());
}
