/**
 * Slice 2.1c.1 — the governed WORK-READINESS engine.
 *
 * Pure, deterministic materials-readiness arithmetic over a work order's raw
 * required-spare list and the distinct spare balances behind it. It performs no
 * I/O, reads no clock and imports nothing outside the governed domain: the
 * server adapter hands it RAW numbers, this module turns them into the eleven
 * governed fields, and `execute.ts` wraps each in a governed envelope.
 *
 * The eleven fields are a single governed fact with individually attributable
 * members. Absence is always stated, never implied: a line with no balance makes
 * the availability-derived aggregates explicitly UNAVAILABLE rather than zero,
 * and the three governed engineering/labour/permits dimensions — for which no
 * governed evidence source exists in this slice — are always unavailable, never
 * fabricated as "ready". There is no overall readiness SCORE field; a readiness
 * verdict is a separate, versioned selector over these numbers.
 */

import { isEvidenceObservable } from "../freshness-state";
import {
  resolveRequiredSpareCardinality,
  type RequiredSpareUnit,
} from "./policy/spare-cardinality";

export const WORK_READINESS_FORMULA_SET_VERSION = "work-readiness.v1" as const;

/** The eleven governed field names, in registry order. */
export const WORK_READINESS_FIELD_NAMES = Object.freeze([
  "requiredSpareLineCount",
  "totalRequiredQty",
  "sparesWithBalanceCount",
  "totalAvailableUnreservedQty",
  "totalShortageQty",
  "sparesWithShortageCount",
  "minimumCoverageRatio",
  "postAllocationBufferToReorderPoint",
  "engineeringReadinessGoverned",
  "labourReadinessGoverned",
  "permitsReadinessGoverned",
] as const);

// --- governed free-string unavailable reasons -----------------------------

/** The required-spare list itself is malformed (duplicate / blank id). */
export const WORK_READINESS_EVIDENCE_MALFORMED = "evidence_malformed" as const;
/** The evidence is future-dated relative to the evaluation instant. */
export const WORK_READINESS_EVIDENCE_UNOBSERVABLE = "evidence_unobservable" as const;
/** A required line has no governed balance, so the aggregate cannot be trusted. */
export const WORK_READINESS_EVIDENCE_UNAVAILABLE = "evidence_unavailable" as const;
/** No governed evidence source exists for this dimension in Slice 2.1c.1. */
export const WORK_READINESS_EVIDENCE_ABSENT = "evidence_absent" as const;
/** A min/buffer aggregate is undefined because there are no required lines. */
export const WORK_READINESS_NO_REQUIRED_LINES = "no_required_spare_lines" as const;

export interface WorkReadinessSpareBalance {
  readonly spareId: string;
  readonly hasSparePart: boolean;
  readonly hasBalance: boolean;
  readonly onHandQty: number | null;
  readonly reservedQty: number | null;
  readonly reorderPoint: number | null;
}

export interface WorkReadinessInput {
  readonly requiredSpareIds: readonly string[];
  readonly spareBalances: readonly WorkReadinessSpareBalance[];
  readonly capturedAt: string | null;
  readonly asOf: string;
}

export interface WorkReadinessFieldResult {
  readonly name: string;
  readonly value: number | null;
  /** Reason attached when `value` is null; ignored for available fields. */
  readonly unavailableReason: string;
}

export type WorkReadinessOverall =
  | { readonly status: "produced" }
  | { readonly status: "unavailable"; readonly reason: string };

export interface WorkReadinessResult {
  readonly overall: WorkReadinessOverall;
  readonly fields: readonly WorkReadinessFieldResult[];
}

interface ResolvedBalance {
  readonly onHand: number;
  readonly reserved: number;
  readonly reorderPoint: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolvedBalanceOf(
  balance: WorkReadinessSpareBalance | null,
): ResolvedBalance | null {
  if (balance === null) return null;
  if (!balance.hasSparePart || !balance.hasBalance) return null;
  const { onHandQty, reservedQty, reorderPoint } = balance;
  if (
    onHandQty === null ||
    reservedQty === null ||
    reorderPoint === null ||
    !Number.isFinite(onHandQty) ||
    !Number.isFinite(reservedQty) ||
    !Number.isFinite(reorderPoint)
  ) {
    return null;
  }
  return { onHand: onHandQty, reserved: reservedQty, reorderPoint };
}

function field(
  name: string,
  value: number | null,
  unavailableReason: string,
): WorkReadinessFieldResult {
  return Object.freeze({ name, value, unavailableReason });
}

function unavailableAll(reason: string): WorkReadinessResult {
  return Object.freeze({
    overall: Object.freeze({ status: "unavailable" as const, reason }),
    fields: Object.freeze(
      WORK_READINESS_FIELD_NAMES.map((name) => field(name, null, reason)),
    ),
  });
}

/**
 * Compute the eleven governed work-readiness fields, or an overall-unavailable
 * gate when the required-spare list is malformed or the evidence is not
 * observable at `asOf`.
 */
export function computeWorkReadiness(input: WorkReadinessInput): WorkReadinessResult {
  const cardinality = resolveRequiredSpareCardinality(input.requiredSpareIds);
  if (!cardinality.ok) {
    return unavailableAll(WORK_READINESS_EVIDENCE_MALFORMED);
  }
  if (!isEvidenceObservable(input.capturedAt, input.asOf)) {
    return unavailableAll(WORK_READINESS_EVIDENCE_UNOBSERVABLE);
  }

  const units: readonly RequiredSpareUnit[] = cardinality.units;
  const lineCount = units.length;
  const totalRequiredQty = units.reduce((sum, u) => sum + u.requiredQty, 0);

  const lines = units.map((unit) => {
    const balance =
      input.spareBalances.find((b) => b.spareId === unit.spareId) ?? null;
    return { unit, resolved: resolvedBalanceOf(balance) };
  });
  const sparesWithBalanceCount = lines.filter((l) => l.resolved !== null).length;
  const anyMissing = lines.some((l) => l.resolved === null);

  let totalAvailableUnreservedQty: number | null;
  let totalShortageQty: number | null;
  let sparesWithShortageCount: number | null;
  let minimumCoverageRatio: number | null;
  let postAllocationBuffer: number | null;

  if (anyMissing) {
    // A required line with no governed balance makes every availability-derived
    // aggregate untrustworthy; the counts that do not depend on availability
    // (line count, required qty, balances present) remain governed facts.
    totalAvailableUnreservedQty = null;
    totalShortageQty = null;
    sparesWithShortageCount = null;
    minimumCoverageRatio = null;
    postAllocationBuffer = null;
  } else if (lineCount === 0) {
    totalAvailableUnreservedQty = 0;
    totalShortageQty = 0;
    sparesWithShortageCount = 0;
    // A minimum over zero lines is undefined, not zero.
    minimumCoverageRatio = null;
    postAllocationBuffer = null;
  } else {
    let availSum = 0;
    let shortageSum = 0;
    let shortageLines = 0;
    let minCoverage = Number.POSITIVE_INFINITY;
    let minBuffer = Number.POSITIVE_INFINITY;
    for (const { unit, resolved } of lines) {
      const { onHand, reserved, reorderPoint } = resolved as ResolvedBalance;
      const availableUnreserved = Math.max(0, onHand - reserved);
      const shortage = Math.max(0, unit.requiredQty - availableUnreserved);
      const buffer = onHand - reserved - unit.requiredQty - reorderPoint;
      availSum += availableUnreserved;
      shortageSum += shortage;
      if (shortage > 0) shortageLines += 1;
      minCoverage = Math.min(minCoverage, clamp01(availableUnreserved / unit.requiredQty));
      minBuffer = Math.min(minBuffer, buffer);
    }
    totalAvailableUnreservedQty = availSum;
    totalShortageQty = shortageSum;
    sparesWithShortageCount = shortageLines;
    minimumCoverageRatio = minCoverage;
    postAllocationBuffer = minBuffer;
  }

  const availabilityReason = anyMissing
    ? WORK_READINESS_EVIDENCE_UNAVAILABLE
    : WORK_READINESS_NO_REQUIRED_LINES;

  const fields: readonly WorkReadinessFieldResult[] = Object.freeze([
    field("requiredSpareLineCount", lineCount, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("totalRequiredQty", totalRequiredQty, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("sparesWithBalanceCount", sparesWithBalanceCount, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("totalAvailableUnreservedQty", totalAvailableUnreservedQty, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("totalShortageQty", totalShortageQty, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("sparesWithShortageCount", sparesWithShortageCount, WORK_READINESS_EVIDENCE_UNAVAILABLE),
    field("minimumCoverageRatio", minimumCoverageRatio, availabilityReason),
    field("postAllocationBufferToReorderPoint", postAllocationBuffer, availabilityReason),
    field("engineeringReadinessGoverned", null, WORK_READINESS_EVIDENCE_ABSENT),
    field("labourReadinessGoverned", null, WORK_READINESS_EVIDENCE_ABSENT),
    field("permitsReadinessGoverned", null, WORK_READINESS_EVIDENCE_ABSENT),
  ]);

  return Object.freeze({
    overall: Object.freeze({ status: "produced" as const }),
    fields,
  });
}
