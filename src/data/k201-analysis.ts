import type {
  DowntimeEvent,
  ProductionRun,
  SensorReading,
} from "@/domain/types";
import {
  aggregateOee,
  financialExposure,
  type OeeInputs,
  type OeeResult,
} from "@/engines/oee";
import { computeRisk, type RiskResult, type TrendPoint } from "@/engines/risk";
import {
  CONTRIBUTION_MARGIN_PER_BBL,
  K201_SENSORS,
  K201_UNPLANNED_OUTAGE_DAYS,
  LINE,
  REFERENCE_EXPOSURE_USD,
  TREND_WINDOW_DAYS,
} from "./constants";

/**
 * Single source of truth for the K-201 deterministic analysis.
 *
 * Both the seed generator and the repository call this, so the risk score,
 * OEE, and financial exposure shown in Asset 360 are guaranteed to match the
 * seeded recommendation — there is no second, drifting implementation.
 */
export interface K201Analysis {
  risk: RiskResult;
  recentOee: OeeResult;
  recentAttributableExposureUsd: number;
  projectedFailureExposureUsd: number;
  totalExposureUsd: number;
  latest: { vibration: number; bearingTempDe: number; bearingTempNde: number };
}

const K201_ASSET_ID = "asset-k201";

function toOeeInputs(r: ProductionRun): OeeInputs {
  return {
    plannedProductionMinutes: r.plannedProductionMinutes,
    downtimeMinutes: r.downtimeMinutes,
    idealRateUnitsPerHour: r.idealRateUnitsPerHour,
    totalUnitsProduced: r.totalUnitsProduced,
    goodUnits: r.goodUnits,
  };
}

function seriesFor(
  readings: SensorReading[],
  channel: SensorReading["channel"],
): TrendPoint[] {
  const points = readings
    .filter((r) => r.assetId === K201_ASSET_ID && r.channel === channel)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((r, i) => ({ day: i, value: r.value }));
  return points.slice(-TREND_WINDOW_DAYS);
}

export function analyzeK201(input: {
  sensorReadings: SensorReading[];
  productionRuns: ProductionRun[];
  downtimeEvents: DowntimeEvent[];
}): K201Analysis {
  const trendVib = seriesFor(input.sensorReadings, "vibration_overall");
  const trendTde = seriesFor(input.sensorReadings, "bearing_temp_de");
  const trendTnde = seriesFor(input.sensorReadings, "bearing_temp_nde");

  const recentRuns = input.productionRuns
    .filter((r) => r.productionLineId === LINE.id)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .slice(-TREND_WINDOW_DAYS);
  const recentOee = aggregateOee(recentRuns.map(toOeeInputs));

  // K-201-attributable unplanned outage within the recent window.
  const cutoff = recentRuns[0]?.periodStart ?? "";
  const k201UnplannedMin = input.downtimeEvents
    .filter(
      (e) =>
        e.assetId === K201_ASSET_ID &&
        e.category === "equipment_failure" &&
        e.startedAt >= cutoff,
    )
    .reduce((s, e) => s + e.minutes, 0);

  const outageUnits = (k201UnplannedMin / 60) * LINE.idealRateUnitsPerHour;
  const attributableUnits = recentOee.losses.performanceLossUnits + outageUnits;
  const recentAttributableExposureUsd = financialExposure(
    attributableUnits,
    CONTRIBUTION_MARGIN_PER_BBL,
  );

  const projectedFailureUnits =
    K201_UNPLANNED_OUTAGE_DAYS * 24 * LINE.idealRateUnitsPerHour;
  const projectedFailureExposureUsd = financialExposure(
    projectedFailureUnits,
    CONTRIBUTION_MARGIN_PER_BBL,
  );

  const totalExposureUsd =
    recentAttributableExposureUsd + projectedFailureExposureUsd;

  const risk = computeRisk({
    assetTag: "K-201",
    criticality: "A",
    financialExposureUsd: totalExposureUsd,
    referenceExposureUsd: REFERENCE_EXPOSURE_USD,
    repairLeadTimeDays: 21,
    daysToNextTurnaround: 88,
    channels: [
      {
        channel: "Overall vibration",
        unit: "mm/s",
        warningThreshold: K201_SENSORS.vibration.warningThreshold,
        criticalThreshold: K201_SENSORS.vibration.criticalThreshold,
        alarmDirection: "above",
        series: trendVib,
      },
      {
        channel: "Bearing temp (DE)",
        unit: "°C",
        warningThreshold: K201_SENSORS.bearingTempDe.warningThreshold,
        criticalThreshold: K201_SENSORS.bearingTempDe.criticalThreshold,
        alarmDirection: "above",
        series: trendTde,
      },
      {
        channel: "Bearing temp (NDE)",
        unit: "°C",
        warningThreshold: K201_SENSORS.bearingTempNde.warningThreshold,
        criticalThreshold: K201_SENSORS.bearingTempNde.criticalThreshold,
        alarmDirection: "above",
        series: trendTnde,
      },
    ],
  });

  return {
    risk,
    recentOee,
    recentAttributableExposureUsd,
    projectedFailureExposureUsd,
    totalExposureUsd,
    latest: {
      vibration: trendVib[trendVib.length - 1]?.value ?? 0,
      bearingTempDe: trendTde[trendTde.length - 1]?.value ?? 0,
      bearingTempNde: trendTnde[trendTnde.length - 1]?.value ?? 0,
    },
  };
}
