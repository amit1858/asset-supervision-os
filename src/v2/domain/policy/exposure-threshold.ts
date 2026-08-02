import { isAvailable, type ValueEnvelope } from "../envelope";

/**
 * Slice 2.1b — `exposure-threshold.v1`: the named, versioned policy that decides
 * whether a recorded approval additionally requires Plant Manager endorsement.
 *
 * The policy answers one question and performs no calculation: given the
 * governed value at stake, is endorsement required? It is deliberately
 * three-valued. An unavailable or absent envelope is `undeterminable` — it is
 * NEVER read as zero and never treated as below threshold, because that would
 * let missing evidence silently authorise an unendorsed decision.
 *
 * Approval and endorsement remain distinct governed acts; this policy only
 * states whether the second act is required.
 */

export const EXPOSURE_THRESHOLD_POLICY_VERSION = "exposure-threshold.v1" as const;

/** Endorsement is required at or above this exposure. USD 1,000,000 exactly. */
export const EXPOSURE_THRESHOLD_USD = 1_000_000;

export type EndorsementRequirement = "required" | "not_required" | "undeterminable";

/**
 * Evaluate `exposure-threshold.v1`.
 *
 * - absent envelope        → `undeterminable`
 * - unavailable envelope   → `undeterminable`
 * - non-finite value       → `undeterminable`
 * - value >= 1,000,000     → `required` (the boundary itself requires it)
 * - value <  1,000,000     → `not_required`
 */
export function requiresEndorsement(
  valueAtStake: ValueEnvelope<number> | null | undefined,
): EndorsementRequirement {
  if (!valueAtStake) return "undeterminable";
  if (!isAvailable(valueAtStake)) return "undeterminable";
  const value = valueAtStake.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return "undeterminable";
  return value >= EXPOSURE_THRESHOLD_USD ? "required" : "not_required";
}
