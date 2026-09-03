/**
 * Slice 2.2 — validation-only primitives shared by the append boundary and the
 * governed case.
 *
 * This module is DELIBERATELY state-free. It exports pure predicates and a
 * deep-freeze utility and NOTHING that can append an event, mint an aggregate or
 * mint a governed case. Both `event-log.ts` and `governed-case.ts` depend on it
 * so the canonical-instant rule and defensive freezing are defined exactly once,
 * yet neither the aggregate brand nor the case brand leaks through it. A
 * dependency boundary test proves no state-changing symbol is exported here.
 *
 * Nothing here reads a clock or a random source.
 */

/** Canonical UTC instant: `YYYY-MM-DDTHH:mm:ss.sssZ`. Nothing else is accepted. */
export const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * A canonical UTC instant that also round-trips, so impossible dates such as
 * `2026-02-30T00:00:00.000Z` are rejected rather than silently normalised.
 */
export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() === value;
}

export function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Recursively freeze a value in place and return it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}
