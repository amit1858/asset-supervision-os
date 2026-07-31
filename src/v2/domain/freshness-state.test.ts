import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveFreshness } from "./freshness-state";
import type { FreshnessState } from "./freshness-state";
import {
  FRESHNESS_POLICY_VERSION,
  FRESHNESS_WINDOWS_MS,
  DEFAULT_FRESHNESS_CLASS_BY_SOURCE,
  freshnessWindowMs,
} from "./policy/freshness";
import { ANCHOR_NOW } from "@/data/constants";

/**
 * Slice 2.1a — technical plan §10.3 / §12.3. Freshness is value-temporal only,
 * class-selected, evaluated against an explicit `asOf`, and orthogonal to source
 * mode, integration state and provenance.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ALL_FRESHNESS_STATES: readonly FreshnessState[] = [
  "fresh",
  "stale",
  "missing",
  "unknown",
];

/** Build a `capturedAt` a given number of ms before the canonical clock. */
function before(ms: number, asOf: string = ANCHOR_NOW): string {
  return new Date(Date.parse(asOf) - ms).toISOString();
}

describe("freshness.v1 policy", () => {
  it("is a named, versioned policy", () => {
    expect(FRESHNESS_POLICY_VERSION).toBe("freshness.v1");
  });

  it("uses a 15-minute condition-signal window and 24 hours for every other class", () => {
    expect(FRESHNESS_WINDOWS_MS.condition_signal).toBe(15 * MINUTE);
    expect(FRESHNESS_WINDOWS_MS.production_oee).toBe(24 * HOUR);
    expect(FRESHNESS_WINDOWS_MS.cmms_work_order).toBe(24 * HOUR);
    expect(FRESHNESS_WINDOWS_MS.inventory_material).toBe(24 * HOUR);
    expect(FRESHNESS_WINDOWS_MS.turnaround_readiness).toBe(24 * HOUR);
    expect(FRESHNESS_WINDOWS_MS.financial_value).toBe(24 * HOUR);
  });

  it("is frozen so windows and defaults cannot drift at runtime", () => {
    expect(Object.isFrozen(FRESHNESS_WINDOWS_MS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FRESHNESS_CLASS_BY_SOURCE)).toBe(true);
  });
});

describe("freshnessClass precedence", () => {
  it("prefers an explicitly supplied class over the source default", () => {
    expect(freshnessWindowMs("historian")).toBe(15 * MINUTE);
    expect(freshnessWindowMs("historian", "production_oee")).toBe(24 * HOUR);
    // An explicit class also overrides a source whose default is stricter/looser.
    expect(freshnessWindowMs("cmms", "condition_signal")).toBe(15 * MINUTE);
  });

  it("falls back to the conservative default for the source key", () => {
    expect(DEFAULT_FRESHNESS_CLASS_BY_SOURCE.historian).toBe("condition_signal");
    expect(freshnessWindowMs("cmms")).toBe(24 * HOUR);
    expect(freshnessWindowMs("inventory")).toBe(24 * HOUR);
    expect(freshnessWindowMs("procurement")).toBe(24 * HOUR);
    expect(freshnessWindowMs("turnaround_scheduling")).toBe(24 * HOUR);
  });

  it("never guesses a window for an ungoverned source key", () => {
    for (const sourceKey of ["shift_log", "ai_runtime", "local_seed"] as const) {
      expect(DEFAULT_FRESHNESS_CLASS_BY_SOURCE[sourceKey]).toBeNull();
      expect(freshnessWindowMs(sourceKey)).toBeNull();
    }
  });

  it("lets an ungoverned source resolve once an explicit class is supplied", () => {
    expect(freshnessWindowMs("shift_log", "condition_signal")).toBe(15 * MINUTE);
    expect(
      resolveFreshness({
        sourceKey: "shift_log",
        freshnessClass: "cmms_work_order",
        capturedAt: before(2 * HOUR),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");
  });
});

describe("resolveFreshness — governed windows", () => {
  it("defaults a historian reading to the 15-minute condition-signal window", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(14 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");

    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(16 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("stale");
  });

  it("treats the 15-minute boundary as fresh (inclusive)", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(15 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");

    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(15 * MINUTE + 1),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("stale");
  });

  it("applies 24 hours to historian production/OEE evidence when stated", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        freshnessClass: "production_oee",
        capturedAt: before(23 * HOUR),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");

    expect(
      resolveFreshness({
        sourceKey: "historian",
        freshnessClass: "production_oee",
        capturedAt: before(25 * HOUR),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("stale");
  });

  it("applies the 24h window to CMMS, inventory and turnaround evidence", () => {
    for (const sourceKey of [
      "cmms",
      "inventory",
      "procurement",
      "turnaround_scheduling",
    ] as const) {
      expect(
        resolveFreshness({ sourceKey, capturedAt: before(23 * HOUR), asOf: ANCHOR_NOW }),
      ).toBe("fresh");
      expect(
        resolveFreshness({ sourceKey, capturedAt: before(25 * HOUR), asOf: ANCHOR_NOW }),
      ).toBe("stale");
    }
  });

  it("does not apply the sensor window to non-sensor evidence", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(30 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("stale");
    expect(
      resolveFreshness({
        sourceKey: "cmms",
        capturedAt: before(30 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");
  });

  it("applies the financial/value window only when stated", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        freshnessClass: "financial_value",
        capturedAt: before(20 * HOUR),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");
  });
});

describe("resolveFreshness — explicit canonical clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the canonical ANCHOR_NOW passed explicitly", () => {
    expect(ANCHOR_NOW).toBe("2026-07-27T00:00:00.000Z");
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: "2026-07-26T23:50:00.000Z",
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");
  });

  it("never calls Date.now()", () => {
    const now = vi.spyOn(Date, "now");

    resolveFreshness({ sourceKey: "historian", capturedAt: before(MINUTE), asOf: ANCHOR_NOW });
    resolveFreshness({ sourceKey: "cmms", capturedAt: null, asOf: ANCHOR_NOW });
    resolveFreshness({ sourceKey: "shift_log", capturedAt: before(1), asOf: ANCHOR_NOW });

    expect(now).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it("is unaffected by the wall clock — the result depends only on asOf", () => {
    const input = {
      sourceKey: "historian",
      capturedAt: before(14 * MINUTE),
      asOf: ANCHOR_NOW,
    } as const;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00.000Z"));
    expect(resolveFreshness(input)).toBe("fresh");
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
    expect(resolveFreshness(input)).toBe("fresh");
  });

  it("evaluates against a different asOf without hidden state", () => {
    const asOf = "2026-07-20T12:00:00.000Z";
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(10 * MINUTE, asOf),
        asOf,
      }),
    ).toBe("fresh");
  });
});

describe("resolveFreshness — missing and unknown are distinct", () => {
  it("returns missing when there is no evidence — never stale, never 0", () => {
    for (const capturedAt of [null, "", "   "]) {
      const state = resolveFreshness({
        sourceKey: "historian",
        capturedAt,
        asOf: ANCHOR_NOW,
      });
      expect(state).toBe("missing");
      expect(state).not.toBe("stale");
    }
  });

  it("returns unknown for an ungoverned source with no explicit class", () => {
    for (const sourceKey of ["shift_log", "ai_runtime", "local_seed"] as const) {
      expect(
        resolveFreshness({ sourceKey, capturedAt: before(MINUTE), asOf: ANCHOR_NOW }),
      ).toBe("unknown");
    }
  });

  it("returns unknown when asOf or capturedAt cannot be parsed", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(MINUTE),
        asOf: "not-a-timestamp",
      }),
    ).toBe("unknown");

    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: "not-a-timestamp",
        asOf: ANCHOR_NOW,
      }),
    ).toBe("unknown");
  });

  it("keeps missing and unknown separate conditions", () => {
    const missing = resolveFreshness({
      sourceKey: "historian",
      capturedAt: null,
      asOf: ANCHOR_NOW,
    });
    const unknown = resolveFreshness({
      sourceKey: "historian",
      capturedAt: before(MINUTE),
      asOf: "",
    });
    expect(missing).toBe("missing");
    expect(unknown).toBe("unknown");
    expect(missing).not.toBe(unknown);
  });
});

describe("resolveFreshness — orthogonality (Decision 4)", () => {
  it("never returns synthetic, whatever the source or timing", () => {
    const states: FreshnessState[] = [];
    for (const sourceKey of [
      "historian",
      "cmms",
      "inventory",
      "procurement",
      "turnaround_scheduling",
      "shift_log",
      "ai_runtime",
      "local_seed",
    ] as const) {
      for (const capturedAt of [
        null,
        "",
        "bad",
        before(MINUTE),
        before(20 * MINUTE),
        before(48 * HOUR),
      ]) {
        states.push(resolveFreshness({ sourceKey, capturedAt, asOf: ANCHOR_NOW }));
      }
    }

    expect(states.length).toBe(48);
    for (const state of states) {
      expect(state).not.toBe("synthetic");
      expect(ALL_FRESHNESS_STATES).toContain(state);
    }
  });

  it("accepts no source mode, integration state or provenance input", () => {
    const capturedAt = before(10 * MINUTE);
    const state = resolveFreshness({
      sourceKey: "historian",
      capturedAt,
      asOf: ANCHOR_NOW,
    });

    expect(state).toBe("fresh");
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt,
        asOf: ANCHOR_NOW,
        // Unsupported axes must not change the result.
        ...({
          sourceMode: "snowflake",
          integrationState: "synthetic",
          provenance: "human",
        } as Record<string, unknown>),
      }),
    ).toBe(state);
  });

  it("lets the same source be either fresh or stale purely on time", () => {
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(5 * MINUTE),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("fresh");
    expect(
      resolveFreshness({
        sourceKey: "historian",
        capturedAt: before(5 * HOUR),
        asOf: ANCHOR_NOW,
      }),
    ).toBe("stale");
  });

  it("is pure — identical inputs always produce identical output", () => {
    const input = {
      sourceKey: "cmms",
      capturedAt: before(3 * HOUR),
      asOf: ANCHOR_NOW,
    } as const;
    const first = resolveFreshness(input);
    for (let i = 0; i < 5; i += 1) {
      expect(resolveFreshness(input)).toBe(first);
    }
  });
});
