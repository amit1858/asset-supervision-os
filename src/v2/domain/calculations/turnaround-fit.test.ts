import { describe, expect, it } from "vitest";

import {
  computeTurnaroundLeadTimeFit,
  TURNAROUND_EVIDENCE_STALE,
  TURNAROUND_EVIDENCE_UNAVAILABLE,
  TURNAROUND_EVIDENCE_UNOBSERVABLE,
  TURNAROUND_FIT_SELECTOR_VERSION,
  TURNAROUND_LEAD_TIME_FIT_FIELD_NAMES,
  TURNAROUND_LEAD_TIME_FIT_FORMULA_SET_VERSION,
  turnaroundFitSelector,
  type TurnaroundLeadTimeFitInput,
  type TurnaroundLeadTimeFitResult,
} from "./turnaround-fit";

const AS_OF = "2026-07-27T12:00:00.000Z";
const CAPTURED = "2026-07-27T06:00:00.000Z";
const WINDOW_START = "2026-10-23T00:00:00.000Z";

function valueOf(result: TurnaroundLeadTimeFitResult, name: string): number | null {
  const field = result.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`missing field ${name}`);
  return field.value;
}

function input(overrides: Partial<TurnaroundLeadTimeFitInput> = {}): TurnaroundLeadTimeFitInput {
  return {
    requiredSpareIds: ["sp-seal"],
    spareLeadTimes: [{ spareId: "sp-seal", leadTimeDays: 35 }],
    turnaroundStartIso: WINDOW_START,
    capturedAt: CAPTURED,
    asOf: AS_OF,
    ...overrides,
  };
}

describe("computeTurnaroundLeadTimeFit", () => {
  it("reproduces the golden 35 / 88 / 20696 / 53 fit", () => {
    const result = computeTurnaroundLeadTimeFit(input());
    expect(result.overall.status).toBe("produced");
    expect(result.fields.map((f) => f.name)).toEqual([...TURNAROUND_LEAD_TIME_FIT_FIELD_NAMES]);
    expect(valueOf(result, "maxLeadTimeDays")).toBe(35);
    expect(valueOf(result, "daysUntilTurnaround")).toBe(88);
    expect(valueOf(result, "availableDateEpochDay")).toBe(20696);
    expect(valueOf(result, "slackDays")).toBe(53);
    expect(new Date(20696 * 86_400_000).toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(turnaroundFitSelector(53).label).toBe("fits");
  });

  it("takes the maximum lead time across distinct spares", () => {
    const result = computeTurnaroundLeadTimeFit(
      input({
        requiredSpareIds: ["sp-brg", "sp-seal"],
        spareLeadTimes: [
          { spareId: "sp-brg", leadTimeDays: 21 },
          { spareId: "sp-seal", leadTimeDays: 35 },
        ],
      }),
    );
    expect(valueOf(result, "maxLeadTimeDays")).toBe(35);
  });

  it("treats exactly-on-time (zero slack) as fits", () => {
    // window 35 days out, lead time 35 → slack 0
    const result = computeTurnaroundLeadTimeFit(
      input({ turnaroundStartIso: "2026-08-31T00:00:00.000Z" }),
    );
    expect(valueOf(result, "slackDays")).toBe(0);
    expect(turnaroundFitSelector(0).label).toBe("fits");
  });

  it("labels negative slack at_risk", () => {
    // window only 10 days out, lead time 35 → slack -25
    const result = computeTurnaroundLeadTimeFit(
      input({ turnaroundStartIso: "2026-08-06T00:00:00.000Z" }),
    );
    expect(valueOf(result, "slackDays")).toBe(-25);
    expect(turnaroundFitSelector(valueOf(result, "slackDays")).label).toBe("at_risk");
  });

  it("gates to unavailable when a required lead time is missing", () => {
    const result = computeTurnaroundLeadTimeFit(
      input({ spareLeadTimes: [{ spareId: "sp-seal", leadTimeDays: null }] }),
    );
    expect(result.overall.status).toBe("unavailable");
    if (result.overall.status !== "unavailable") throw new Error("unreachable");
    expect(result.overall.reason).toBe(TURNAROUND_EVIDENCE_UNAVAILABLE);
  });

  it("gates to unavailable on stale evidence", () => {
    // captured well over the 24h turnaround window before asOf
    const result = computeTurnaroundLeadTimeFit(
      input({ capturedAt: "2026-07-20T00:00:00.000Z" }),
    );
    expect(result.overall.status).toBe("unavailable");
    if (result.overall.status !== "unavailable") throw new Error("unreachable");
    expect(result.overall.reason).toBe(TURNAROUND_EVIDENCE_STALE);
  });

  it("gates to unavailable on future-dated (unobservable) evidence", () => {
    const result = computeTurnaroundLeadTimeFit(
      input({ capturedAt: "2026-07-28T00:00:00.000Z" }),
    );
    expect(result.overall.status).toBe("unavailable");
    if (result.overall.status !== "unavailable") throw new Error("unreachable");
    expect(result.overall.reason).toBe(TURNAROUND_EVIDENCE_UNOBSERVABLE);
  });

  it("gates to unavailable when the turnaround window is unresolvable", () => {
    const result = computeTurnaroundLeadTimeFit(input({ turnaroundStartIso: null }));
    expect(result.overall.status).toBe("unavailable");
  });
});

describe("turnaroundFitSelector", () => {
  it("carries its version and the producing formula set", () => {
    const result = turnaroundFitSelector(53);
    expect(result.selectorVersion).toBe(TURNAROUND_FIT_SELECTOR_VERSION);
    expect(result.formulaSetVersion).toBe(TURNAROUND_LEAD_TIME_FIT_FORMULA_SET_VERSION);
    expect(result.basis).toContain("slackDays=53");
  });

  it("labels a null slack unavailable, never fits", () => {
    expect(turnaroundFitSelector(null).label).toBe("unavailable");
  });
});
