import { describe, it, expect } from "vitest";
import { computeRisk, linearSlope, type ChannelInput } from "./risk";

function ramp(from: number, slopePerDay: number, days = 30): { day: number; value: number }[] {
  return Array.from({ length: days }, (_, i) => ({ day: i, value: from + slopePerDay * i }));
}

describe("linearSlope", () => {
  it("recovers a known slope and intercept", () => {
    const { slope, intercept } = linearSlope([
      { day: 0, value: 0 },
      { day: 1, value: 2 },
      { day: 2, value: 4 },
    ]);
    expect(slope).toBeCloseTo(2, 10);
    expect(intercept).toBeCloseTo(0, 10);
  });

  it("returns zero slope for a single point", () => {
    expect(linearSlope([{ day: 0, value: 5 }]).slope).toBe(0);
  });
});

describe("computeRisk — K-201-shaped deterioration", () => {
  // Vibration rising from 5.3 to ~8.9 over 30 days (warning 7.1, critical 11.2).
  const channels: ChannelInput[] = [
    {
      channel: "Overall vibration",
      unit: "mm/s",
      warningThreshold: 7.1,
      criticalThreshold: 11.2,
      alarmDirection: "above",
      series: ramp(5.3, 0.124),
    },
  ];

  const result = computeRisk({
    assetTag: "K-201",
    criticality: "A",
    financialExposureUsd: 1_500_000,
    referenceExposureUsd: 1_500_000,
    repairLeadTimeDays: 21,
    daysToNextTurnaround: 88,
    channels,
  });

  it("flags the warning breach and projects time-to-critical", () => {
    const ch = result.channels[0]!;
    expect(ch.breachedWarning).toBe(true);
    expect(ch.breachedCritical).toBe(false);
    expect(result.projectedDaysToCritical).not.toBeNull();
    expect(result.projectedDaysToCritical!).toBeGreaterThan(15);
    expect(result.projectedDaysToCritical!).toBeLessThan(22);
  });

  it("recommends immediate action when failure precedes repair lead time", () => {
    // projected (~18d) < repair lead time (21d) -> cannot wait, not turnaround.
    expect(result.recommendedDisposition).toBe("immediate");
  });

  it("produces a high risk score for a criticality-A asset", () => {
    expect(result.riskScore).toBeGreaterThanOrEqual(45);
    expect(result.healthScore).toBeLessThan(70);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
  });

  it("emits human-readable deterministic rationale", () => {
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.rationale.join(" ")).toMatch(/vibration/i);
  });
});

describe("computeRisk — healthy asset", () => {
  const result = computeRisk({
    assetTag: "P-999",
    criticality: "C",
    financialExposureUsd: 0,
    channels: [
      {
        channel: "Overall vibration",
        unit: "mm/s",
        warningThreshold: 7.1,
        criticalThreshold: 11.2,
        alarmDirection: "above",
        series: ramp(2.5, 0),
      },
    ],
  });

  it("stays healthy and recommends monitoring", () => {
    expect(result.channels[0]!.status).toBe("normal");
    expect(result.healthScore).toBeGreaterThan(85);
    expect(result.recommendedDisposition).toBe("monitor");
    expect(result.projectedDaysToCritical).toBeNull();
  });
});

describe("computeRisk — schedules to turnaround when there is time", () => {
  it("defers to the next turnaround when it precedes projected failure", () => {
    const result = computeRisk({
      assetTag: "K-500",
      criticality: "B",
      financialExposureUsd: 400_000,
      repairLeadTimeDays: 10,
      daysToNextTurnaround: 20,
      channels: [
        {
          channel: "Overall vibration",
          unit: "mm/s",
          warningThreshold: 7.1,
          criticalThreshold: 11.2,
          alarmDirection: "above",
          // Slow rise: crosses warning, projects well beyond lead time & turnaround.
          series: ramp(7.2, 0.05),
        },
      ],
    });
    expect(result.projectedDaysToCritical!).toBeGreaterThan(20);
    expect(result.recommendedDisposition).toBe("next_turnaround");
  });
});
