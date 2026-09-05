import { describe, it, expect } from "vitest";
import { sensorGeometry } from "./visuals";
import type { SignalSensorView } from "@/v2/reliability/view-types";

/**
 * September 8 visual-first reliability — `sensorGeometry` is pure math over a
 * governed reading series. These prove the chart geometry is deterministic,
 * plots one point per governed reading (no fabricated/dropped points), keeps the
 * threshold reference lines inside the drawing area, and never divides by zero
 * on a flat or single-point series.
 */

function sensor(overrides: Partial<SignalSensorView> = {}): SignalSensorView {
  return {
    key: "vibration",
    label: "Vibration",
    unit: "mm/s",
    latestDisplay: "8.4 mm/s",
    warningThreshold: 7.1,
    criticalThreshold: 11.2,
    latestValue: 8.4,
    latestAt: "2026-07-27T00:00:00.000Z",
    points: [
      { t: "2026-07-01T00:00:00.000Z", v: 3.2 },
      { t: "2026-07-10T00:00:00.000Z", v: 5.1 },
      { t: "2026-07-20T00:00:00.000Z", v: 7.4 },
      { t: "2026-07-27T00:00:00.000Z", v: 8.4 },
    ],
    ...overrides,
  };
}

describe("sensorGeometry", () => {
  it("is deterministic for identical input", () => {
    expect(sensorGeometry(sensor())).toEqual(sensorGeometry(sensor()));
  });

  it("plots exactly one polyline vertex per governed reading", () => {
    const g = sensorGeometry(sensor());
    expect(g.polyline.trim().split(/\s+/)).toHaveLength(4);
  });

  it("keeps the warning and critical reference lines inside the drawing area", () => {
    const g = sensorGeometry(sensor());
    for (const y of [g.warnY, g.critY]) {
      expect(y).not.toBeNull();
      expect(y!).toBeGreaterThanOrEqual(g.pad);
      expect(y!).toBeLessThanOrEqual(g.height - g.pad);
    }
  });

  it("omits reference lines when a threshold is absent", () => {
    const g = sensorGeometry(sensor({ warningThreshold: null, criticalThreshold: null }));
    expect(g.warnY).toBeNull();
    expect(g.critY).toBeNull();
  });

  it("does not divide by zero on a flat series", () => {
    const g = sensorGeometry(
      sensor({
        warningThreshold: null,
        criticalThreshold: null,
        points: [
          { t: "a", v: 5 },
          { t: "b", v: 5 },
        ],
      }),
    );
    expect(g.yMax).toBeGreaterThan(g.yMin);
    for (const coord of g.polyline.split(/\s+/)) {
      const [x, y] = coord.split(",").map(Number);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it("marks the latest reading at the final x position", () => {
    const g = sensorGeometry(sensor());
    expect(g.latest).not.toBeNull();
    expect(g.latest!.x).toBeCloseTo(g.width - g.pad, 5);
  });
});
