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

function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure evaluation (technical plan §10.3):
 * - `missing` when there is no evidence / no `capturedAt`;
 * - `unknown` when `asOf`, `capturedAt` or the governed window cannot be
 *   resolved;
 * - otherwise `fresh` when `asOf − capturedAt <= window`, else `stale`.
 *
 * The window boundary is inclusive: evidence exactly at the window edge is
 * `fresh`.
 */
export function resolveFreshness(input: FreshnessInput): FreshnessState {
  const { sourceKey, freshnessClass, capturedAt, asOf } = input;

  if (capturedAt === null || capturedAt === undefined || capturedAt.trim() === "") {
    return "missing";
  }

  const windowMs = freshnessWindowMs(sourceKey, freshnessClass);
  if (windowMs === null) return "unknown";

  const capturedMs = parseInstant(capturedAt);
  const asOfMs = parseInstant(asOf);
  if (capturedMs === null || asOfMs === null) return "unknown";

  return asOfMs - capturedMs <= windowMs ? "fresh" : "stale";
}
