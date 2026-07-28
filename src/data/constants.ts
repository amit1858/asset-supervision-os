/**
 * Synthetic-data constants for the K-201 demonstration.
 *
 * All timestamps are derived from a FIXED anchor so the dataset is identical on
 * every run and in every environment (no wall-clock dependency). Every value
 * here is synthetic and does not represent any real plant, company, or product.
 */

export const SEED = 20260727;

/** Fixed "current time" for the demo (matches the demo narrative date). */
export const ANCHOR_NOW = "2026-07-27T00:00:00.000Z";

/** Length of the observed operational history. */
export const HISTORY_DAYS = 90;

/** Trend window (days) the risk engine uses for slope/projection. */
export const TREND_WINDOW_DAYS = 30;

export const PLANT = {
  id: "plant-gc",
  code: "GC-REFINERY",
  name: "Gulf Coast Refinery (synthetic)",
  region: "US Gulf Coast",
  timezone: "America/Chicago",
};

export const LINE = {
  id: "line-hds2",
  code: "HDS-2",
  name: "Diesel Hydrotreater Unit 2",
  product: "Ultra-low-sulfur diesel",
  designRateUnitsPerHour: 1000, // bbl/h nameplate
  idealRateUnitsPerHour: 950, // bbl/h sustainable ideal
  unit: "bbl",
};

/** Contribution margin used for financial-exposure calculations (synthetic). */
export const CONTRIBUTION_MARGIN_PER_BBL = 12;

/** Reference exposure that normalises risk "consequence" to ~1.0. */
export const REFERENCE_EXPOSURE_USD = 1_500_000;

/** Assumed unplanned-failure outage duration for K-201 (days). */
export const K201_UNPLANNED_OUTAGE_DAYS = 4;

export const CURRENCY = "USD";

/** K-201 sensor thresholds. Vibration bands per ISO 10816-3 (large machines). */
export const K201_SENSORS = {
  vibration: {
    channel: "vibration_overall" as const,
    label: "Overall vibration (RMS)",
    unit: "mm/s",
    warningThreshold: 7.1,
    criticalThreshold: 11.2,
    alarmDirection: "above" as const,
  },
  bearingTempDe: {
    channel: "bearing_temp_de" as const,
    label: "Bearing temperature (drive end)",
    unit: "°C",
    warningThreshold: 85,
    criticalThreshold: 105,
    alarmDirection: "above" as const,
  },
  bearingTempNde: {
    channel: "bearing_temp_nde" as const,
    label: "Bearing temperature (non-drive end)",
    unit: "°C",
    warningThreshold: 85,
    criticalThreshold: 105,
    alarmDirection: "above" as const,
  },
};
