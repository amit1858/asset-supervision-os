import { describe, it, expect } from "vitest";
import { EPOCH_DAY_MS, epochDayOf } from "./epoch-day";

/**
 * Slice 2.1c.1 — dedicated coverage for the pure UTC epoch-day helper.
 *
 * The oracle for a valid instant is `Date.UTC(...)`, derived independently of
 * the helper's `Date.parse` + round-trip path, so the assertions are not
 * circular. The impossible-date case is the load-bearing one: `Date.parse`
 * silently normalises `2026-02-30` to March, and the helper MUST reject it.
 */

describe("epochDayOf", () => {
  it("indexes a canonical UTC midnight instant", () => {
    const expected = Math.floor(Date.UTC(2026, 6, 27) / EPOCH_DAY_MS);
    expect(epochDayOf("2026-07-27T00:00:00.000Z")).toBe(expected);
  });

  it("floors a sub-day offset to the same UTC day as midnight", () => {
    const midnight = epochDayOf("2026-07-27T00:00:00.000Z");
    expect(epochDayOf("2026-07-27T12:00:00.000Z")).toBe(midnight);
  });

  it("keeps one millisecond before the next midnight on the same day", () => {
    const day = epochDayOf("2026-07-27T00:00:00.000Z")!;
    expect(epochDayOf("2026-07-27T23:59:59.999Z")).toBe(day);
    expect(epochDayOf("2026-07-28T00:00:00.000Z")).toBe(day + 1);
  });

  it("rejects an invalid string", () => {
    expect(epochDayOf("not-a-date")).toBeNull();
  });

  it("rejects a blank string", () => {
    expect(epochDayOf("")).toBeNull();
    expect(epochDayOf("   ")).toBeNull();
  });

  it("rejects null and undefined without throwing", () => {
    expect(epochDayOf(null)).toBeNull();
    expect(epochDayOf(undefined)).toBeNull();
  });

  it("rejects an impossible canonical-looking date instead of normalising it", () => {
    // JavaScript's Date.parse rolls 2026-02-30 forward to 2026-03-02. The helper
    // must NOT silently accept that: an impossible date is not a governed instant.
    expect(epochDayOf("2026-02-30T00:00:00.000Z")).toBeNull();
  });

  it("is deterministic across repeated calls", () => {
    const a = epochDayOf("2026-07-27T06:00:00.000Z");
    const b = epochDayOf("2026-07-27T06:00:00.000Z");
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("does not mutate its input", () => {
    const input = "2026-07-27T12:00:00.000Z";
    const before = String(input);
    epochDayOf(input);
    expect(input).toBe(before);
  });

  it("reads no clock: the result depends only on the argument", () => {
    // Two different explicit instants yield two fixed, argument-derived indices;
    // nothing here consults the wall clock, so the values never drift.
    const first = epochDayOf("2020-01-01T00:00:00.000Z");
    const second = epochDayOf("2020-01-01T00:00:00.000Z");
    expect(first).toBe(second);
    expect(first).toBe(Math.floor(Date.UTC(2020, 0, 1) / EPOCH_DAY_MS));
  });
});
