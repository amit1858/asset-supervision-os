/**
 * Slice 2.1c.1 — the pure UTC epoch-day helper.
 *
 * It lives in the value-temporal layer beside `freshness-state.ts` — the same
 * layer that already owns instant parsing — rather than inside a calculation
 * module, so the governed calculation engines delegate every ISO→instant
 * conversion here instead of reaching for `Date.parse` themselves. That keeps
 * the calculation modules free of clock/parse primitives and the parsing rule in
 * exactly one temporal place.
 *
 * An epoch day is the whole number of UTC days since the Unix epoch:
 * `floor(ms / 86_400_000)`. The boundary is a calendar day, so
 * `2026-07-27T12:00:00Z` and `2026-07-27T00:00:00Z` share the same index and a
 * mid-day `asOf` never shifts a day count. Reads no clock; pure and total.
 */

export const EPOCH_DAY_MS = 86_400_000;

/**
 * The whole UTC-day index of an ISO-8601 instant, or `null` when it is absent,
 * blank or unparseable. Never throws and never reads the wall clock.
 */
export function epochDayOf(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed === "") return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  // Reject impossible calendar dates that `Date.parse` silently normalises
  // (e.g. `2026-02-30T00:00:00.000Z` → `2026-03-02T00:00:00.000Z`). A value is
  // valid only if it round-trips EXACTLY to the instant it parsed to — the same
  // parse-and-round-trip rule the canonical freshness policy uses. No local-time
  // arithmetic is involved: the comparison is entirely in UTC.
  if (new Date(ms).toISOString() !== trimmed) return null;
  return Math.floor(ms / EPOCH_DAY_MS);
}
