import type { SourceKey } from "@/domain/integration";

/**
 * Slice 2.1a — `freshness.v1`: the named, versioned, source-specific freshness
 * window policy (technical plan §10.3, Decision 3).
 *
 * Freshness is a purely VALUE-TEMPORAL axis. This policy says nothing about
 * source mode, integration health or provenance — those are separate dimensions
 * resolved elsewhere. Windows are evaluated against an explicitly supplied
 * `asOf` (the canonical `ANCHOR_NOW` clock); nothing here reads the wall clock.
 */

export const FRESHNESS_POLICY_VERSION = "freshness.v1" as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The governed freshness classes. The class — not the source key — selects the
 * window, because one `SourceKey` can supply more than one class: the historian
 * supplies both 15-minute condition signals and 24-hour production/OEE
 * observations.
 */
export type FreshnessClass =
  | "condition_signal"
  | "production_oee"
  | "cmms_work_order"
  | "inventory_material"
  | "turnaround_readiness"
  | "financial_value";

/** `freshness.v1` window table (technical plan §10.3). */
export const FRESHNESS_WINDOWS_MS: Readonly<Record<FreshnessClass, number>> = Object.freeze({
  condition_signal: 15 * MINUTE_MS,
  production_oee: 24 * HOUR_MS,
  cmms_work_order: 24 * HOUR_MS,
  inventory_material: 24 * HOUR_MS,
  turnaround_readiness: 24 * HOUR_MS,
  financial_value: 24 * HOUR_MS,
});

/**
 * Conservative default class per existing `SourceKey`, used only when the caller
 * supplies no explicit `freshnessClass`.
 *
 * - `historian` defaults to `condition_signal` (15 minutes) — the stricter of
 *   the two classes it can supply. A production/OEE caller must state
 *   `freshnessClass: "production_oee"` explicitly.
 * - `null` means `freshness.v1` governs no default for that source. Such a
 *   source resolves to `"unknown"` rather than to a guessed window; the policy
 *   never silently guesses.
 */
export const DEFAULT_FRESHNESS_CLASS_BY_SOURCE: Readonly<
  Record<SourceKey, FreshnessClass | null>
> = Object.freeze({
  historian: "condition_signal",
  cmms: "cmms_work_order",
  inventory: "inventory_material",
  procurement: "inventory_material",
  turnaround_scheduling: "turnaround_readiness",
  shift_log: null,
  ai_runtime: null,
  local_seed: null,
});

/**
 * Resolve the governed window in milliseconds under `freshness.v1` precedence:
 *
 * 1. an explicitly supplied `freshnessClass` selects the window;
 * 2. otherwise the conservative default for the `SourceKey` is used;
 * 3. otherwise `null` — no window is governed, and the caller must surface
 *    `unknown` rather than assume one.
 */
export function freshnessWindowMs(
  sourceKey: SourceKey,
  freshnessClass?: FreshnessClass,
): number | null {
  const resolved = freshnessClass ?? DEFAULT_FRESHNESS_CLASS_BY_SOURCE[sourceKey];
  if (!resolved) return null;
  return FRESHNESS_WINDOWS_MS[resolved];
}
