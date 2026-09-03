import { describe, it, expect } from "vitest";
import {
  AUTHORITY_WORKFLOW_POLICY,
  AUTHORITY_WORKFLOW_POLICY_ID,
  AUTHORITY_WORKFLOW_POLICY_VERSION,
  authorizationPolicyRef,
  GOVERNED_ACTS,
  isEndorsementAct,
  ruleForAct,
} from "./authority-policy";

/**
 * Slice 2.2 — the versioned V2 authority workflow policy. Separation of duties
 * is enforced here, additively, without touching the shared persona registry.
 */

describe("authority workflow policy", () => {
  it("declares exactly the six governed acts", () => {
    expect([...GOVERNED_ACTS].sort()).toEqual(
      ["approve", "decline", "decline_endorsement", "endorse", "return", "validate_outcome"].sort(),
    );
  });

  it("gives the Reliability Manager alone approve / decline / return / validate", () => {
    for (const act of ["approve", "decline", "return", "validate_outcome"] as const) {
      expect(ruleForAct(act).allowedPersonaIds).toEqual(["reliability_manager"]);
    }
  });

  it("gives the Plant Manager alone endorse / decline-endorsement", () => {
    for (const act of ["endorse", "decline_endorsement"] as const) {
      const rule = ruleForAct(act);
      expect(rule.allowedPersonaIds).toEqual(["plant_manager"]);
      expect(rule.requiredCapability).toBe("endorse_high_exposure_reliability_decision");
    }
  });

  it("binds each act to its exact gated event type", () => {
    expect(ruleForAct("approve").gatedEventType).toBe("DecisionApproved");
    expect(ruleForAct("decline").gatedEventType).toBe("DecisionRejected");
    expect(ruleForAct("return").gatedEventType).toBe("DecisionReturned");
    expect(ruleForAct("endorse").gatedEventType).toBe("EndorsementGranted");
    expect(ruleForAct("decline_endorsement").gatedEventType).toBe("EndorsementDeclined");
    expect(ruleForAct("validate_outcome").gatedEventType).toBe("OutcomeConfirmed");
  });

  it("flags only the two endorsement acts as endorsement acts", () => {
    expect(isEndorsementAct("endorse")).toBe(true);
    expect(isEndorsementAct("decline_endorsement")).toBe(true);
    expect(isEndorsementAct("approve")).toBe(false);
    expect(isEndorsementAct("validate_outcome")).toBe(false);
  });

  it("emits a typed, versioned policy reference", () => {
    const ref = authorizationPolicyRef();
    expect(ref.kind).toBe("authorization-policy");
    expect(ref.id).toBe(AUTHORITY_WORKFLOW_POLICY_ID);
    expect(ref.version).toBe(AUTHORITY_WORKFLOW_POLICY_VERSION);
  });

  it("is deeply frozen", () => {
    expect(Object.isFrozen(AUTHORITY_WORKFLOW_POLICY)).toBe(true);
    expect(Object.isFrozen(AUTHORITY_WORKFLOW_POLICY.approve)).toBe(true);
  });
});
