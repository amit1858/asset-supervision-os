import { describe, it, expect } from "vitest";
import {
  defaultSourceStates,
  sourceHasData,
  INTEGRATION_STATE_META,
  SOURCE_LABELS,
  type SourceKey,
} from "./integration";

describe("source / integration state mapping", () => {
  it("maps the local seed to synthetic and external systems to not_connected", () => {
    const keys: SourceKey[] = ["local_seed", "cmms", "historian", "procurement", "inventory", "shift_log"];
    const states = defaultSourceStates(keys);
    const byKey = new Map(states.map((s) => [s.key, s.state]));
    expect(byKey.get("local_seed")).toBe("synthetic");
    expect(byKey.get("cmms")).toBe("not_connected");
    expect(byKey.get("historian")).toBe("not_connected");
    expect(byKey.get("procurement")).toBe("not_connected");
    expect(byKey.get("inventory")).toBe("not_connected");
    expect(byKey.get("shift_log")).toBe("not_connected");
  });

  it("labels every source and integration state", () => {
    const keys = Object.keys(SOURCE_LABELS) as SourceKey[];
    for (const k of keys) expect(SOURCE_LABELS[k].length).toBeGreaterThan(0);
    for (const s of ["connected", "partial", "not_connected", "stale", "error", "synthetic"] as const) {
      expect(INTEGRATION_STATE_META[s].label.length).toBeGreaterThan(0);
    }
  });

  it("knows which states can supply factual records", () => {
    expect(sourceHasData("connected")).toBe(true);
    expect(sourceHasData("partial")).toBe(true);
    expect(sourceHasData("synthetic")).toBe(true);
    expect(sourceHasData("not_connected")).toBe(false);
    expect(sourceHasData("error")).toBe(false);
    expect(sourceHasData("stale")).toBe(false);
  });
});
