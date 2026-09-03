/**
 * Slice 2.1c.1 — the governed TURNAROUND LEAD-TIME-FIT engine.
 *
 * Pure, deterministic arithmetic answering one question: given the longest
 * procurement lead time among a work order's required spares, does the spare
 * arrive before the turnaround window opens? It performs no I/O, reads no clock
 * and imports nothing outside the governed domain — every instant comes from the
 * explicit `asOf` carried by the governed request, never from `Date.now()`.
 *
 * Four governed fields form a single fact: `maxLeadTimeDays`,
 * `daysUntilTurnaround`, `availableDateEpochDay` and `slackDays`. A separate,
 * versioned selector turns `slackDays` into a `"fits" | "at_risk"` verdict;
 * absent evidence is always an explicit unavailable, never a fabricated "fits".
 */

import { isEvidenceObservable, resolveFreshness } from "../freshness-state";
import { epochDayOf } from "../epoch-day";
import {
  resolveRequiredSpareCardinality,
  type RequiredSpareUnit,
} from "./policy/spare-cardinality";

export const TURNAROUND_LEAD_TIME_FIT_FORMULA_SET_VERSION =
  "turnaround-lead-time-fit.v1" as const;

export const TURNAROUND_FIT_SELECTOR_VERSION = "turnaround-fit-selector.v1" as const;

/** The four governed field names, in registry order. */
export const TURNAROUND_LEAD_TIME_FIT_FIELD_NAMES = Object.freeze([
  "maxLeadTimeDays",
  "daysUntilTurnaround",
  "availableDateEpochDay",
  "slackDays",
] as const);

// --- governed free-string unavailable reasons -----------------------------

export const TURNAROUND_EVIDENCE_MALFORMED = "evidence_malformed" as const;
export const TURNAROUND_EVIDENCE_UNOBSERVABLE = "evidence_unobservable" as const;
export const TURNAROUND_EVIDENCE_STALE = "evidence_stale" as const;
export const TURNAROUND_EVIDENCE_UNAVAILABLE = "evidence_unavailable" as const;
export const TURNAROUND_WINDOW_UNRESOLVABLE = "turnaround_window_unresolvable" as const;

export interface TurnaroundSpareLeadTime {
  readonly spareId: string;
  readonly leadTimeDays: number | null;
}

export interface TurnaroundLeadTimeFitInput {
  readonly requiredSpareIds: readonly string[];
  readonly spareLeadTimes: readonly TurnaroundSpareLeadTime[];
  readonly turnaroundStartIso: string | null;
  readonly capturedAt: string | null;
  readonly asOf: string;
}

export interface TurnaroundLeadTimeFitFieldResult {
  readonly name: string;
  readonly value: number | null;
  readonly unavailableReason: string;
}

export type TurnaroundLeadTimeFitOverall =
  | { readonly status: "produced" }
  | { readonly status: "unavailable"; readonly reason: string };

export interface TurnaroundLeadTimeFitResult {
  readonly overall: TurnaroundLeadTimeFitOverall;
  readonly fields: readonly TurnaroundLeadTimeFitFieldResult[];
}

export type TurnaroundFitLabel = "fits" | "at_risk" | "unavailable";

export interface TurnaroundFitSelectorResult {
  readonly label: TurnaroundFitLabel;
  readonly selectorVersion: string;
  readonly formulaSetVersion: string;
  readonly basis: string;
}

function field(
  name: string,
  value: number | null,
  unavailableReason: string,
): TurnaroundLeadTimeFitFieldResult {
  return Object.freeze({ name, value, unavailableReason });
}

function unavailableAll(reason: string): TurnaroundLeadTimeFitResult {
  return Object.freeze({
    overall: Object.freeze({ status: "unavailable" as const, reason }),
    fields: Object.freeze(
      TURNAROUND_LEAD_TIME_FIT_FIELD_NAMES.map((name) => field(name, null, reason)),
    ),
  });
}

/**
 * Compute the four governed lead-time-fit fields, or an overall-unavailable gate
 * when the required-spare list is malformed, the evidence is unobservable or
 * stale, a lead time is missing, or the turnaround window cannot be resolved.
 */
export function computeTurnaroundLeadTimeFit(
  input: TurnaroundLeadTimeFitInput,
): TurnaroundLeadTimeFitResult {
  const cardinality = resolveRequiredSpareCardinality(input.requiredSpareIds);
  if (!cardinality.ok) {
    return unavailableAll(TURNAROUND_EVIDENCE_MALFORMED);
  }
  if (!isEvidenceObservable(input.capturedAt, input.asOf)) {
    return unavailableAll(TURNAROUND_EVIDENCE_UNOBSERVABLE);
  }
  if (
    resolveFreshness({
      sourceKey: "turnaround_scheduling",
      freshnessClass: "turnaround_readiness",
      capturedAt: input.capturedAt,
      asOf: input.asOf,
    }) !== "fresh"
  ) {
    return unavailableAll(TURNAROUND_EVIDENCE_STALE);
  }

  const units: readonly RequiredSpareUnit[] = cardinality.units;
  const leadTimes: number[] = [];
  for (const unit of units) {
    const entry = input.spareLeadTimes.find((s) => s.spareId === unit.spareId);
    if (
      entry === undefined ||
      entry.leadTimeDays === null ||
      !Number.isFinite(entry.leadTimeDays)
    ) {
      return unavailableAll(TURNAROUND_EVIDENCE_UNAVAILABLE);
    }
    leadTimes.push(entry.leadTimeDays);
  }
  if (leadTimes.length === 0) {
    // No required spares means there is no procurement lead time to fit against.
    return unavailableAll(TURNAROUND_EVIDENCE_UNAVAILABLE);
  }
  const maxLeadTimeDays = Math.max(...leadTimes);

  const asOfEpoch = epochDayOf(input.asOf);
  if (asOfEpoch === null) {
    return unavailableAll(TURNAROUND_EVIDENCE_UNAVAILABLE);
  }
  const startEpoch = epochDayOf(input.turnaroundStartIso);
  if (startEpoch === null) {
    return unavailableAll(TURNAROUND_WINDOW_UNRESOLVABLE);
  }

  const daysUntilTurnaround = startEpoch - asOfEpoch;
  const availableDateEpochDay = asOfEpoch + maxLeadTimeDays;
  const slackDays = daysUntilTurnaround - maxLeadTimeDays;

  return Object.freeze({
    overall: Object.freeze({ status: "produced" as const }),
    fields: Object.freeze([
      field("maxLeadTimeDays", maxLeadTimeDays, TURNAROUND_EVIDENCE_UNAVAILABLE),
      field("daysUntilTurnaround", daysUntilTurnaround, TURNAROUND_EVIDENCE_UNAVAILABLE),
      field("availableDateEpochDay", availableDateEpochDay, TURNAROUND_EVIDENCE_UNAVAILABLE),
      field("slackDays", slackDays, TURNAROUND_EVIDENCE_UNAVAILABLE),
    ]),
  });
}

/**
 * Turnaround fit verdict:
 * - `slackDays >= 0` → `"fits"` (the spare arrives on or before the window);
 * - `slackDays < 0` → `"at_risk"`;
 * - `null` → `"unavailable"`.
 */
export function turnaroundFitSelector(
  slackDays: number | null,
): TurnaroundFitSelectorResult {
  const base = {
    selectorVersion: TURNAROUND_FIT_SELECTOR_VERSION,
    formulaSetVersion: TURNAROUND_LEAD_TIME_FIT_FORMULA_SET_VERSION,
  } as const;

  if (slackDays === null || !Number.isFinite(slackDays)) {
    return { ...base, label: "unavailable", basis: `slackDays=${String(slackDays)}` };
  }
  if (slackDays >= 0) {
    return { ...base, label: "fits", basis: `slackDays=${slackDays}` };
  }
  return { ...base, label: "at_risk", basis: `slackDays=${slackDays}` };
}
