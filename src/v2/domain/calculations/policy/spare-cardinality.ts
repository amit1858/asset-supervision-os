/**
 * Slice 2.1c.1 — `required-spare-cardinality.v1`.
 *
 * A governed, versioned rule for turning a work order's raw `requiredSpareIds`
 * list into the distinct spare LINES a readiness or lead-time calculation is
 * allowed to reason about. It exists so a malformed bill of materials can never
 * be silently coerced into a plausible-looking quantity:
 *
 * - a blank / whitespace spare id is malformed — there is no such spare, so the
 *   whole list is rejected rather than a phantom line invented;
 * - a duplicated spare id is malformed — a required quantity of two is a real
 *   engineering claim, and it is NEVER manufactured by listing the same id
 *   twice. Each distinct id is exactly one unit;
 * - an empty list is VALID and yields zero units. "This work order needs no
 *   spares" is a governed fact, not an error.
 *
 * Pure and total. Reads no clock, performs no I/O, imports nothing outside the
 * governed domain.
 */

import type { CalculationInputReference } from "../inputs";

export const REQUIRED_SPARE_CARDINALITY_POLICY_VERSION =
  "required-spare-cardinality.v1" as const;

/**
 * The governed cardinality assumption disclosed as a structured input
 * reference, so a produced work-readiness record attributes it in its input
 * references and formula metadata rather than leaving it implicit.
 */
export const REQUIRED_SPARE_CARDINALITY_POLICY_REFERENCE: CalculationInputReference =
  Object.freeze({
    kind: "constant",
    id: REQUIRED_SPARE_CARDINALITY_POLICY_VERSION,
    description:
      "One required unit per unique listed spare (governed assumption; no seeded quantity field exists).",
  });

/** Free-string reason for a malformed required-spare list. */
export const CARDINALITY_EVIDENCE_MALFORMED = "evidence_malformed" as const;

export interface RequiredSpareUnit {
  readonly spareId: string;
  /** Always 1: one distinct id is one unit. A duplicate is malformed, not 2. */
  readonly requiredQty: number;
}

export type RequiredSpareCardinality =
  | { readonly ok: true; readonly units: readonly RequiredSpareUnit[] }
  | {
      readonly ok: false;
      readonly reason: typeof CARDINALITY_EVIDENCE_MALFORMED;
      readonly detail: string;
    };

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Resolve the governed spare-line cardinality of a raw `requiredSpareIds` list.
 *
 * @param requiredSpareIds the raw ids exactly as the work order carries them.
 */
export function resolveRequiredSpareCardinality(
  requiredSpareIds: readonly string[],
): RequiredSpareCardinality {
  if (!Array.isArray(requiredSpareIds)) {
    return {
      ok: false,
      reason: CARDINALITY_EVIDENCE_MALFORMED,
      detail: "requiredSpareIds must be an array.",
    };
  }

  const units: RequiredSpareUnit[] = [];
  const seen = new Set<string>();
  for (const raw of requiredSpareIds) {
    if (!isNonEmpty(raw)) {
      return {
        ok: false,
        reason: CARDINALITY_EVIDENCE_MALFORMED,
        detail: "A required spare id must be a non-empty string.",
      };
    }
    const spareId = raw.trim();
    if (seen.has(spareId)) {
      return {
        ok: false,
        reason: CARDINALITY_EVIDENCE_MALFORMED,
        detail: `Required spare id "${spareId}" is listed more than once; a required quantity is never manufactured by duplication.`,
      };
    }
    seen.add(spareId);
    units.push(Object.freeze({ spareId, requiredQty: 1 }));
  }

  return { ok: true, units: Object.freeze(units) };
}
