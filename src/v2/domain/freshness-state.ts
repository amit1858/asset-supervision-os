import type { SourceKey } from "@/domain/integration";
import { freshnessWindowMs, type FreshnessClass } from "./policy/freshness";

/**
 * Slice 2.1a — the value-temporal freshness axis (technical plan §10.3,
 * Decision 3/4).
 *
 * `FreshnessState` answers exactly one question: how old is this evidence
 * relative to an explicitly supplied `asOf`? It is deliberately NOT the existing
 * `DataFreshness` (`live | recent | stale | offline`), which is a feed-liveness
 * presentation label with no way to express "evidence absent" or "window
 * unresolvable". `DataFreshness` is left unchanged.
 *
 * Rules enforced here:
 * - `resolveFreshness` NEVER returns `"synthetic"`. Synthetic is a source /
 *   integration disclosure handled by the existing integration model, not a
 *   temporal state; a synthetic observation may be `fresh` or `stale`.
 * - It never reads, infers or returns source mode, integration state or
 *   provenance. Its only inputs are the source key, an optional governed
 *   freshness class, `capturedAt` and `asOf`.
 * - `asOf` is an explicit REQUIRED parameter (supplied from the canonical
 *   `ANCHOR_NOW` clock). This module never calls `Date.now()`.
 * - `missing` (no evidence) and `unknown` (unresolvable clock or ungoverned
 *   window) are distinct conditions, and neither is ever `stale` or `0`.
 */

export type FreshnessState = "fresh" | "stale" | "missing" | "unknown";

export interface FreshnessInput {
  /** The source the evidence came from. */
  sourceKey: SourceKey;
  /**
   * Optional governed class. When supplied it selects the `freshness.v1`
   * window; otherwise the conservative default for `sourceKey` applies.
   */
  freshnessClass?: FreshnessClass;
  /** Evidence timestamp (ISO-8601); `null` / empty means no evidence. */
  capturedAt: string | null;
  /** REQUIRED explicit evaluation instant (= `ANCHOR_NOW`); never `Date.now()`. */
  asOf: string;
}

/**
 * A canonical governed instant: ISO-8601, UTC, millisecond precision, literal
 * `Z`. Every timestamp the seed and the governed event log produce is already in
 * this shape, so requiring it costs nothing and removes a class of ambiguity —
 * a local-time or offset-bearing string can never be silently reinterpreted as
 * UTC and then compared against `asOf`.
 */
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  if (!CANONICAL_INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // `Date.parse` rolls a calendar-invalid date over rather than failing:
  // `2026-02-30T00:00:00.000Z` silently becomes 2 March. Round-tripping rejects
  // it, so a well-shaped string can never resolve to a DIFFERENT instant.
  return new Date(ms).toISOString() === value ? ms : null;
}

/**
 * Slice 2.1a.1 — the canonical observability guard, and the single place the
 * rule lives.
 *
 * Evidence is observable only when it was captured at or before the instant it
 * is being evaluated at. Evidence dated AFTER `asOf` has not happened yet from
 * the evaluation's point of view: it is not fresh, not stale and not merely
 * missing — it is unobservable, and any elapsed-time arithmetic over it is
 * meaningless because the elapsed value is negative.
 *
 * Returns `false` when `capturedAt` is absent, when either timestamp is invalid
 * or non-canonical, or when `capturedAt > asOf`. Returns `true` only when both
 * instants are canonical and `capturedAt <= asOf`. The boundary is inclusive:
 * evidence captured exactly at `asOf` is observable.
 *
 * Pure and total. Reads no clock. Callers needing this rule MUST import it
 * rather than reimplement it locally.
 */
export function isEvidenceObservable(capturedAt: string | null, asOf: string): boolean {
  const capturedMs = parseInstant(capturedAt);
  const asOfMs = parseInstant(asOf);
  if (capturedMs === null || asOfMs === null) return false;
  return capturedMs <= asOfMs;
}

/**
 * Pure evaluation (technical plan §10.3, amended by Slice 2.1a.1):
 * - `missing` when there is no evidence / no `capturedAt`;
 * - `unknown` when `asOf` or `capturedAt` is invalid or non-canonical;
 * - `unknown` when the evidence is future-dated relative to `asOf`;
 * - `unknown` when no governed window can be resolved;
 * - otherwise `fresh` when `asOf − capturedAt <= window`, else `stale`.
 *
 * The window boundary is inclusive: evidence exactly at the window edge is
 * `fresh`.
 *
 * Future-dated evidence is deliberately `unknown` rather than `fresh` or
 * `stale`. Before Slice 2.1a.1 a negative elapsed time trivially satisfied
 * `<= window`, so evidence captured after the evaluation instant was reported
 * as `fresh` — the strongest possible claim about the weakest possible
 * evidence. No new state is introduced; `unknown` already means "the temporal
 * relationship cannot be resolved".
 */
export function resolveFreshness(input: FreshnessInput): FreshnessState {
  const { sourceKey, freshnessClass, capturedAt, asOf } = input;

  if (capturedAt === null || capturedAt === undefined || capturedAt.trim() === "") {
    return "missing";
  }

  const capturedMs = parseInstant(capturedAt);
  const asOfMs = parseInstant(asOf);
  if (capturedMs === null || asOfMs === null) return "unknown";

  if (!isEvidenceObservable(capturedAt, asOf)) return "unknown";

  const windowMs = freshnessWindowMs(sourceKey, freshnessClass);
  if (windowMs === null) return "unknown";

  return asOfMs - capturedMs <= windowMs ? "fresh" : "stale";
}
