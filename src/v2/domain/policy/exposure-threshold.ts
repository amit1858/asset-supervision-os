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
 *
 * Slice 2.1b.1 hardens the evidence gate: availability alone is not enough.
 * A value that is stale, or that was evaluated at a different instant than the
 * act being governed, cannot resolve the threshold.
 */

export const EXPOSURE_THRESHOLD_POLICY_VERSION = "exposure-threshold.v1" as const;

/** The named, versioned rule for whether an envelope may resolve a policy. */
export const POLICY_RESOLUTION_VERSION = "policy-resolution.v1" as const;

/** Endorsement is required at or above this exposure. USD 1,000,000 exactly. */
export const EXPOSURE_THRESHOLD_USD = 1_000_000;

export type EndorsementRequirement = "required" | "not_required" | "undeterminable";

/**
 * `policy-resolution.v1` — may this envelope resolve a governed policy AT
 * `policyAsOf`? Three conjunctive conditions, all required:
 *
 * 1. the envelope is AVAILABLE — an unavailable envelope is never zero and
 *    never below threshold;
 * 2. `freshness` is exactly `"fresh"` — `stale`, `unknown` and `missing`
 *    evidence must not silently authorise or block a governed act;
 * 3. `envelope.asOf` equals `policyAsOf` exactly — the value must have been
 *    evaluated at the instant being governed, not carried forward from an
 *    earlier one.
 *
 * This reads no clock: the caller must state the instant it is deciding at.
 */
export function isPolicyResolvable(
  envelope: ValueEnvelope<number>,
  policyAsOf: string,
): boolean {
  return (
    isAvailable(envelope) &&
    envelope.freshness === "fresh" &&
    envelope.asOf === policyAsOf
  );
}

/**
 * Evaluate `exposure-threshold.v1` at `policyAsOf`.
 *
 * - absent envelope        → `undeterminable`
 * - not policy-resolvable  → `undeterminable` (unavailable, stale, unknown,
 *                            missing, or a different `asOf`)
 * - non-finite value       → `undeterminable`
 * - value >= 1,000,000     → `required` (the boundary itself requires it)
 * - value <  1,000,000     → `not_required`
 */
export function requiresEndorsement(
  valueAtStake: ValueEnvelope<number> | null | undefined,
  policyAsOf: string,
): EndorsementRequirement {
  if (!valueAtStake) return "undeterminable";
  if (!isPolicyResolvable(valueAtStake, policyAsOf)) return "undeterminable";
  const value = valueAtStake.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return "undeterminable";
  return value >= EXPOSURE_THRESHOLD_USD ? "required" : "not_required";
}
