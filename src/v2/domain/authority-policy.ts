import type { Capability, PersonaId } from "@/personas/types";
import type { GovernedEventType } from "./events";

/**
 * Slice 2.2 — the versioned V2 authority workflow policy.
 *
 * This is a V2-only governance mapping. It deliberately does NOT modify the
 * shared persona registry: the Plant Manager keeps the capabilities V1 relies
 * on. Separation of duties for THIS governed reliability workflow is enforced
 * here, by binding every governed act to both a required capability AND the
 * exact set of personas permitted to perform it:
 *
 * - Reliability Manager alone approves, declines, returns and validates.
 * - Plant Manager alone endorses or declines endorsement of a high-exposure
 *   decision.
 *
 * The policy is versioned so a committed audit record can name the exact policy
 * it was evaluated under, and replay can re-evaluate authority against the same
 * version and fail closed on a mismatch.
 */

/** The six gated human acts in this governed workflow. */
export type GovernedAct =
  | "approve"
  | "decline"
  | "return"
  | "endorse"
  | "decline_endorsement"
  | "validate_outcome";

export const GOVERNED_ACTS: readonly GovernedAct[] = Object.freeze([
  "approve",
  "decline",
  "return",
  "endorse",
  "decline_endorsement",
  "validate_outcome",
] as const);

export interface AuthorityWorkflowRule {
  readonly act: GovernedAct;
  /** The governed capability the assuming persona must hold. */
  readonly requiredCapability: Capability;
  /** The personas this policy permits to perform the act — nobody else may. */
  readonly allowedPersonaIds: readonly PersonaId[];
  /** The governed event this act appends when it is committed. */
  readonly gatedEventType: GovernedEventType;
}

export const AUTHORITY_WORKFLOW_POLICY_ID = "v2-authority-workflow";
export const AUTHORITY_WORKFLOW_POLICY_VERSION = "v2-authority-workflow.v1";

export const AUTHORITY_WORKFLOW_POLICY: Readonly<
  Record<GovernedAct, AuthorityWorkflowRule>
> = Object.freeze({
  approve: Object.freeze({
    act: "approve",
    requiredCapability: "approve_reliability_decision",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["reliability_manager"]),
    gatedEventType: "DecisionApproved",
  }),
  decline: Object.freeze({
    act: "decline",
    requiredCapability: "approve_reliability_decision",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["reliability_manager"]),
    gatedEventType: "DecisionRejected",
  }),
  return: Object.freeze({
    act: "return",
    requiredCapability: "approve_reliability_decision",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["reliability_manager"]),
    gatedEventType: "DecisionReturned",
  }),
  validate_outcome: Object.freeze({
    act: "validate_outcome",
    requiredCapability: "validate_operational_outcome",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["reliability_manager"]),
    gatedEventType: "OutcomeConfirmed",
  }),
  endorse: Object.freeze({
    act: "endorse",
    requiredCapability: "endorse_high_exposure_reliability_decision",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["plant_manager"]),
    gatedEventType: "EndorsementGranted",
  }),
  decline_endorsement: Object.freeze({
    act: "decline_endorsement",
    requiredCapability: "endorse_high_exposure_reliability_decision",
    allowedPersonaIds: Object.freeze<PersonaId[]>(["plant_manager"]),
    gatedEventType: "EndorsementDeclined",
  }),
});

export interface AuthorizationPolicyRef {
  readonly kind: "authorization-policy";
  readonly id: string;
  readonly version: string;
}

/** The typed, versioned reference committed into every authority audit record. */
export function authorizationPolicyRef(): AuthorizationPolicyRef {
  return Object.freeze({
    kind: "authorization-policy" as const,
    id: AUTHORITY_WORKFLOW_POLICY_ID,
    version: AUTHORITY_WORKFLOW_POLICY_VERSION,
  });
}

export function ruleForAct(act: GovernedAct): AuthorityWorkflowRule {
  return AUTHORITY_WORKFLOW_POLICY[act];
}

/** The two acts whose target is a prior approval, so self-endorsement applies. */
export function isEndorsementAct(act: GovernedAct): boolean {
  return act === "endorse" || act === "decline_endorsement";
}
