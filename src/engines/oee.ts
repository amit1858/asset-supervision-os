/**
 * Deterministic OEE (Overall Equipment Effectiveness) engine.
 *
 * OEE = Availability × Performance × Quality, using the standard loss model:
 *   Availability = Run Time / Planned Production Time
 *   Performance  = (Total Units Produced) / (Ideal Rate × Run Time)
 *   Quality      = Good Units / Total Units Produced
 *
 * All results are exact calculations from measured inputs — provenance
 * "deterministic". No AI, no statistics. Rounding is left to the display layer.
 */

export interface OeeInputs {
  plannedProductionMinutes: number;
  downtimeMinutes: number;
  idealRateUnitsPerHour: number;
  totalUnitsProduced: number;
  goodUnits: number;
}

export interface OeeComponents {
  availability: number; // 0–1
  performance: number; // 0–1 (clamped; see rawPerformance)
  quality: number; // 0–1
  oee: number; // 0–1
  /** Uncapped performance ratio, useful for data-quality checks. */
  rawPerformance: number;
}

export interface OeeLossBreakdown {
  runTimeMinutes: number;
  theoreticalMaxUnits: number;
  /** Units lost because the asset was down (availability loss). */
  availabilityLossUnits: number;
  /** Units lost to running slower than ideal (performance/speed loss). */
  performanceLossUnits: number;
  /** Good-unit shortfall from defects/rework (quality loss). */
  qualityLossUnits: number;
  totalLossUnits: number;
}

export interface OeeResult extends OeeComponents {
  losses: OeeLossBreakdown;
  inputs: OeeInputs;
}

const EMPTY: OeeResult = {
  availability: 0,
  performance: 0,
  quality: 0,
  oee: 0,
  rawPerformance: 0,
  losses: {
    runTimeMinutes: 0,
    theoreticalMaxUnits: 0,
    availabilityLossUnits: 0,
    performanceLossUnits: 0,
    qualityLossUnits: 0,
    totalLossUnits: 0,
  },
  inputs: {
    plannedProductionMinutes: 0,
    downtimeMinutes: 0,
    idealRateUnitsPerHour: 0,
    totalUnitsProduced: 0,
    goodUnits: 0,
  },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Compute OEE and the loss tree for a single set of inputs. */
export function computeOee(inputs: OeeInputs): OeeResult {
  const {
    plannedProductionMinutes,
    downtimeMinutes,
    idealRateUnitsPerHour,
    totalUnitsProduced,
    goodUnits,
  } = inputs;

  if (plannedProductionMinutes <= 0) {
    return { ...EMPTY, inputs };
  }

  const runTimeMinutes = Math.max(0, plannedProductionMinutes - downtimeMinutes);
  const availability = clamp01(runTimeMinutes / plannedProductionMinutes);

  const theoreticalMaxUnits = (idealRateUnitsPerHour * runTimeMinutes) / 60;
  const rawPerformance =
    theoreticalMaxUnits > 0 ? totalUnitsProduced / theoreticalMaxUnits : 0;
  const performance = clamp01(rawPerformance);

  const quality =
    totalUnitsProduced > 0 ? clamp01(goodUnits / totalUnitsProduced) : 0;

  const oee = availability * performance * quality;

  // Loss tree, expressed in production units against the plant ideal.
  const availabilityLossUnits = Math.max(
    0,
    (idealRateUnitsPerHour * downtimeMinutes) / 60,
  );
  const performanceLossUnits = Math.max(
    0,
    theoreticalMaxUnits - totalUnitsProduced,
  );
  const qualityLossUnits = Math.max(0, totalUnitsProduced - goodUnits);
  const totalLossUnits =
    availabilityLossUnits + performanceLossUnits + qualityLossUnits;

  return {
    availability,
    performance,
    quality,
    oee,
    rawPerformance,
    losses: {
      runTimeMinutes,
      theoreticalMaxUnits,
      availabilityLossUnits,
      performanceLossUnits,
      qualityLossUnits,
      totalLossUnits,
    },
    inputs,
  };
}

/**
 * Aggregate OEE across many runs by summing minutes and units first, then
 * computing ratios (a time-weighted "rolled-up" OEE, not an average of OEEs).
 */
export function aggregateOee(runs: OeeInputs[]): OeeResult {
  if (runs.length === 0) return EMPTY;

  const summed = runs.reduce<OeeInputs>(
    (acc, r) => ({
      plannedProductionMinutes:
        acc.plannedProductionMinutes + r.plannedProductionMinutes,
      downtimeMinutes: acc.downtimeMinutes + r.downtimeMinutes,
      // Ideal rate must be shared/consistent; take the max as the plant ideal.
      idealRateUnitsPerHour: Math.max(
        acc.idealRateUnitsPerHour,
        r.idealRateUnitsPerHour,
      ),
      totalUnitsProduced: acc.totalUnitsProduced + r.totalUnitsProduced,
      goodUnits: acc.goodUnits + r.goodUnits,
    }),
    {
      plannedProductionMinutes: 0,
      downtimeMinutes: 0,
      idealRateUnitsPerHour: 0,
      totalUnitsProduced: 0,
      goodUnits: 0,
    },
  );

  return computeOee(summed);
}

/**
 * Financial exposure of OEE losses = lost good-equivalent units × contribution
 * margin per unit. Deterministic; margin is a business input, not a prediction.
 */
export function financialExposure(
  lossUnits: number,
  contributionMarginPerUnit: number,
): number {
  return Math.max(0, lossUnits) * Math.max(0, contributionMarginPerUnit);
}
