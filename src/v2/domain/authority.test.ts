import { describe, it, expect } from "vitest";
import type { Capability, PersonaId } from "@/personas/types";
import { evaluateAuthority, type AuthorityContext, type CapabilityResolver } from "./authority";
import { authorizationPolicyRef } from "./authority-policy";

/**
 * Slice 2.2 — capability authority evaluation. Persona identity is NOT
 * authorization: an act is authorised only when the principal may assume the
 * persona, the policy permits the persona for the act, AND the persona holds the
 * required capability.
 */

const descriptor = {
  mode: "demonstration_unrestricted" as const,
  policy: authorizationPolicyRef(),
  label: "Demonstration — unrestricted persona switching",
};

function ctx(principalId: string, personaId: PersonaId): AuthorityContext {
  return { principalId, personaId, authorization: descriptor };
}

/** A resolver that permits any assumption and consults a fixed capability map. */
function resolver(holds: Partial<Record<PersonaId, Capability[]>>): CapabilityResolver {
  return {
    canAssume: () => true,
    personaHolds: (personaId, capability) =>
      (holds[personaId] ?? []).includes(capability),
  };
}

const RM_HOLDS = resolver({
  reliability_manager: [
    "approve_reliability_decision",
    "validate_operational_outcome",
  ],
  plant_manager: ["endorse_high_exposure_reliability_decision"],
});

describe("evaluateAuthority", () => {
  it("authorises the Reliability Manager to approve", () => {
    const result = evaluateAuthority("approve", ctx("p-rm", "reliability_manager"), RM_HOLDS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.principalId).toBe("p-rm");
      expect(result.actor.personaId).toBe("reliability_manager");
    }
  });

  it("authorises the Plant Manager to endorse", () => {
    const result = evaluateAuthority("endorse", ctx("p-pm", "plant_manager"), RM_HOLDS);
    expect(result.ok).toBe(true);
  });

  it("rejects the Plant Manager attempting to approve (persona not allowed for act)", () => {
    const result = evaluateAuthority("approve", ctx("p-pm", "plant_manager"), RM_HOLDS);
    expect(result).toEqual({ ok: false, reason: "persona_not_allowed_for_act" });
  });

  it("rejects the Reliability Manager attempting to endorse (persona not allowed for act)", () => {
    const result = evaluateAuthority("endorse", ctx("p-rm", "reliability_manager"), RM_HOLDS);
    expect(result).toEqual({ ok: false, reason: "persona_not_allowed_for_act" });
  });

  it("rejects when the principal may not assume the persona", () => {
    const denyAssume: CapabilityResolver = {
      canAssume: () => false,
      personaHolds: () => true,
    };
    const result = evaluateAuthority("approve", ctx("p-x", "reliability_manager"), denyAssume);
    expect(result).toEqual({ ok: false, reason: "persona_not_permitted" });
  });

  it("rejects when the permitted persona does not hold the capability", () => {
    const withoutCap = resolver({ reliability_manager: [] });
    const result = evaluateAuthority("approve", ctx("p-rm", "reliability_manager"), withoutCap);
    expect(result).toEqual({ ok: false, reason: "capability_not_held" });
  });
});
