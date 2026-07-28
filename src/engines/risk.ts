import type { Criticality, EventSeverity, RecommendedDisposition } from "@/domain/enums";

/**
 * Deterministic asset-risk engine.
 *
 * Everything here is an exact rule/calculation over measured data plus a
 * transparent linear-trend extrapolation (the only "statistical" element).
 * No AI is involved — the LLM later only *explains* these numbers.
 *
 * Pipeline:  channel assessment → health score → probability × consequence
 *            → risk score → recommended disposition (business rules).
 */

const HORIZON_DAYS = 60; // planning horizon for trend-based projection

const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  A: 1.0,
  B: 0.8,
  C: 0.6,
  D: 0.4,
  E: 0.2,
};

export interface TrendPoint {
  /** Days from the start of the window (x-axis). */
  day: number;
  value: number;
}

export interface ChannelInput {
  channel: string;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  alarmDirection: "above" | "below";
  /** Ordered readings, oldest first. */
  series: TrendPoint[];
}

export interface ChannelAssessment {
  channel: string;
  unit: string;
  latestValue: number;
  warningThreshold: number;
  criticalThreshold: number;
  status: "normal" | "warning" | "critical";
  breachedWarning: boolean;
  breachedCritical: boolean;
  /** Normalised severity 0–1 (0 = nominal, 0.4 ≈ warning, 1 = critical). */
  severity: number;
  /** Deterioration rate in units/day (sign follows alarm direction). */
  slopePerDay: number;
  /** Days until the critical threshold at current slope, null if not trending. */
  projectedDaysToCritical: number | null;
}

export interface RiskInputs {
  assetTag: string;
  criticality: Criticality;
  channels: ChannelInput[];
  /** Financial exposure already computed by the OEE engine (USD). */
  financialExposureUsd: number;
  /** Reference exposure that normalises consequence to ~1.0 (USD). */
  referenceExposureUsd?: number;
  /** Lead time to procure/execute a fix (days) — drives immediate vs planned. */
  repairLeadTimeDays?: number;
  /** Days until the next turnaround window opens, if any. */
  daysToNextTurnaround?: number | null;
}

export interface RiskResult {
  assetTag: string;
  healthScore: number; // 0–100 (100 = healthy)
  probabilityOfFailure: number; // 0–1
  consequence: number; // 0–1
  riskScore: number; // 0–100
  severity: EventSeverity;
  confidence: number; // 0–1
  recommendedDisposition: RecommendedDisposition;
  projectedDaysToCritical: number | null;
  channels: ChannelAssessment[];
  rationale: string[]; // deterministic, human-readable reasons
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Ordinary least-squares slope/intercept over (day, value) points. */
export function linearSlope(points: TrendPoint[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.value ?? 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.day;
    sy += p.value;
    sxx += p.day * p.day;
    sxy += p.day * p.value;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function assessChannel(input: ChannelInput): ChannelAssessment {
  const { series, alarmDirection, warningThreshold, criticalThreshold } = input;
  const latest = series[series.length - 1];
  const latestValue = latest?.value ?? 0;

  const breachedCritical =
    alarmDirection === "above"
      ? latestValue >= criticalThreshold
      : latestValue <= criticalThreshold;
  const breachedWarning =
    alarmDirection === "above"
      ? latestValue >= warningThreshold
      : latestValue <= warningThreshold;

  // Normalised severity: 0 at nominal baseline, ~0.4 at warning, 1 at critical.
  const nominal =
    alarmDirection === "above"
      ? warningThreshold * 0.5
      : warningThreshold * 1.5;
  let severity: number;
  if (breachedCritical) {
    severity = 1;
  } else if (breachedWarning) {
    const frac =
      (latestValue - warningThreshold) / (criticalThreshold - warningThreshold);
    severity = 0.4 + 0.6 * clamp01(Math.abs(frac));
  } else {
    const frac = (latestValue - nominal) / (warningThreshold - nominal);
    severity = 0.4 * clamp01(frac);
  }

  const { slope } = linearSlope(series);
  const slopePerDay = slope;

  // Project days to critical along the trend, only if worsening.
  let projectedDaysToCritical: number | null = null;
  const worsening =
    alarmDirection === "above" ? slopePerDay > 1e-9 : slopePerDay < -1e-9;
  if (worsening && !breachedCritical) {
    const remaining = criticalThreshold - latestValue;
    const days = remaining / slopePerDay;
    if (days > 0 && Number.isFinite(days)) {
      projectedDaysToCritical = days;
    }
  } else if (breachedCritical) {
    projectedDaysToCritical = 0;
  }

  const status: ChannelAssessment["status"] = breachedCritical
    ? "critical"
    : breachedWarning
      ? "warning"
      : "normal";

  return {
    channel: input.channel,
    unit: input.unit,
    latestValue,
    warningThreshold,
    criticalThreshold,
    status,
    breachedWarning,
    breachedCritical,
    severity: clamp01(severity),
    slopePerDay,
    projectedDaysToCritical,
  };
}

function severityBand(riskScore: number): EventSeverity {
  if (riskScore >= 70) return "critical";
  if (riskScore >= 45) return "high";
  if (riskScore >= 25) return "medium";
  if (riskScore >= 10) return "low";
  return "info";
}

/** Compute a full deterministic risk assessment for an asset. */
export function computeRisk(inputs: RiskInputs): RiskResult {
  const channels = inputs.channels.map(assessChannel);
  const referenceExposure = inputs.referenceExposureUsd ?? 1_000_000;

  const overallSeverity = channels.reduce((m, c) => Math.max(m, c.severity), 0);

  // Soonest projected time-to-critical across channels.
  const projections = channels
    .map((c) => c.projectedDaysToCritical)
    .filter((d): d is number => d !== null);
  const projectedDaysToCritical =
    projections.length > 0 ? Math.min(...projections) : null;

  const trendFactor =
    projectedDaysToCritical !== null
      ? clamp01(1 - projectedDaysToCritical / HORIZON_DAYS)
      : 0;

  // Health degrades from 100 (nominal) toward ~45 at critical, minus trend.
  const healthScore = Math.round(
    clamp01(1 - (0.55 * overallSeverity + 0.15 * trendFactor)) * 100,
  );

  const probabilityOfFailure = clamp01(
    overallSeverity * 0.8 + trendFactor * 0.2,
  );

  const criticalityWeight = CRITICALITY_WEIGHT[inputs.criticality];
  const normalizedFinancial = clamp01(
    inputs.financialExposureUsd / referenceExposure,
  );
  const consequence = clamp01(
    criticalityWeight * 0.6 + normalizedFinancial * 0.4,
  );

  const riskScore = Math.round(100 * probabilityOfFailure * consequence);
  const severity = severityBand(riskScore);

  // Confidence: more data + clearer breach → higher, capped below certainty.
  const totalPoints = inputs.channels.reduce((s, c) => s + c.series.length, 0);
  const dataDensity = clamp01(totalPoints / (inputs.channels.length * 60 || 1));
  const breachClarity = channels.some((c) => c.breachedCritical)
    ? 1
    : channels.some((c) => c.breachedWarning)
      ? 0.7
      : 0.4;
  const confidence = clamp01(
    0.5 + 0.3 * dataDensity + 0.15 * breachClarity - 0.15,
  );

  const recommendedDisposition = decideDisposition({
    hasCriticalBreach: channels.some((c) => c.breachedCritical),
    projectedDaysToCritical,
    repairLeadTimeDays: inputs.repairLeadTimeDays ?? 21,
    daysToNextTurnaround: inputs.daysToNextTurnaround ?? null,
    riskScore,
  });

  const rationale = buildRationale(channels, {
    riskScore,
    healthScore,
    projectedDaysToCritical,
    recommendedDisposition,
    consequence,
    financialExposureUsd: inputs.financialExposureUsd,
  });

  return {
    assetTag: inputs.assetTag,
    healthScore,
    probabilityOfFailure,
    consequence,
    riskScore,
    severity,
    confidence,
    recommendedDisposition,
    projectedDaysToCritical,
    channels,
    rationale,
  };
}

function decideDisposition(args: {
  hasCriticalBreach: boolean;
  projectedDaysToCritical: number | null;
  repairLeadTimeDays: number;
  daysToNextTurnaround: number | null;
  riskScore: number;
}): RecommendedDisposition {
  const {
    hasCriticalBreach,
    projectedDaysToCritical,
    repairLeadTimeDays,
    daysToNextTurnaround,
    riskScore,
  } = args;

  // A confirmed critical breach on a high-risk asset cannot wait.
  if (hasCriticalBreach && riskScore >= 45) return "immediate";

  if (projectedDaysToCritical !== null) {
    // Failure projected before we could even procure & execute a repair.
    if (projectedDaysToCritical <= repairLeadTimeDays) return "immediate";
    // Turnaround opens (and closes the risk) before projected failure.
    if (
      daysToNextTurnaround !== null &&
      daysToNextTurnaround < projectedDaysToCritical
    ) {
      return "next_turnaround";
    }
    // Trending but time available → schedule planned maintenance.
    if (projectedDaysToCritical <= HORIZON_DAYS) return "planned_maintenance";
  }

  if (riskScore >= 25) return "planned_maintenance";
  return "monitor";
}

function buildRationale(
  channels: ChannelAssessment[],
  ctx: {
    riskScore: number;
    healthScore: number;
    projectedDaysToCritical: number | null;
    recommendedDisposition: RecommendedDisposition;
    consequence: number;
    financialExposureUsd: number;
  },
): string[] {
  const out: string[] = [];
  for (const c of channels) {
    if (c.status !== "normal") {
      out.push(
        `${c.channel} at ${c.latestValue.toFixed(2)} ${c.unit} ${
          c.status === "critical" ? "exceeds critical" : "exceeds warning"
        } threshold (${
          c.status === "critical" ? c.criticalThreshold : c.warningThreshold
        } ${c.unit}).`,
      );
    }
    if (c.projectedDaysToCritical !== null && c.projectedDaysToCritical > 0) {
      out.push(
        `${c.channel} trending toward critical in ~${Math.round(
          c.projectedDaysToCritical,
        )} days at current rate.`,
      );
    }
  }
  if (ctx.projectedDaysToCritical !== null) {
    out.push(
      `Earliest projected time-to-critical across channels is ~${Math.round(
        ctx.projectedDaysToCritical,
      )} days.`,
    );
  }
  out.push(
    `Consequence weighting ${(ctx.consequence * 100).toFixed(
      0,
    )}/100 with financial exposure of $${Math.round(
      ctx.financialExposureUsd,
    ).toLocaleString("en-US")}.`,
  );
  out.push(
    `Deterministic recommendation: ${ctx.recommendedDisposition.replace(
      /_/g,
      " ",
    )} (risk ${ctx.riskScore}/100, health ${ctx.healthScore}/100).`,
  );
  return out;
}
