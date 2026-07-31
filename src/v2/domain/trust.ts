import type { Provenance } from "@/domain/enums";

/**
 * Slice 2.1a — C1 / Decision 5: `trustClassification` is a DERIVED mapping over
 * the existing `Provenance` primitive, not a second parallel enum.
 *
 * Rules encoded here (technical plan §4 C1, §12.3b):
 * - Derived only. It is never persisted as the authoritative record of trust and
 *   is never accepted as an input; `Provenance` remains the single source of
 *   truth, so a stored classification can never contradict its provenance.
 * - Total and deterministic. Every supported `Provenance` maps to exactly one
 *   classification, and the mapping never changes for a given input.
 * - Fail-safe. Unknown or unexpected runtime input returns `"unknown"`; it never
 *   throws and never invents a fact-level classification.
 */

export type TrustClassification =
  | "measured_fact"
  | "deterministic_calculation"
  | "prediction"
  | "ai_explanation"
  | "human_decision"
  | "unknown";

/**
 * The authoritative `Provenance → TrustClassification` table. Both
 * `deterministic` and `business_rule` are deterministic calculations: a rule or
 * threshold evaluation is exact, not a prediction.
 */
export const TRUST_BY_PROVENANCE: Readonly<Record<Provenance, TrustClassification>> =
  Object.freeze({
    measured: "measured_fact",
    deterministic: "deterministic_calculation",
    business_rule: "deterministic_calculation",
    statistical: "prediction",
    ai_generated: "ai_explanation",
    human: "human_decision",
  } as const);

/**
 * Pure, total, deterministic. Typed as `Provenance | unknown` because it sits on
 * a boundary where runtime input may not be a valid `Provenance`; anything
 * unrecognised fails safe to `"unknown"`.
 */
export function trustFromProvenance(value: Provenance | unknown): TrustClassification {
  if (typeof value !== "string") return "unknown";
  if (!Object.prototype.hasOwnProperty.call(TRUST_BY_PROVENANCE, value)) return "unknown";
  return TRUST_BY_PROVENANCE[value as Provenance];
}
