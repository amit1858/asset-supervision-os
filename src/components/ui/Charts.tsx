import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";

export interface TrendSeries {
  label: string;
  unit: string;
  color: string;
  points: Array<{ timestamp: string; value: number }>;
  warningThreshold?: number;
  criticalThreshold?: number;
}

/**
 * Line chart for a single sensor channel with warning/critical threshold lines.
 * Pure SVG (scales responsively via viewBox). Exact values are exposed through
 * native <title> tooltips and an accessible summary, so no client JS is needed.
 */
export function SensorTrendChart({
  series,
  height = 200,
}: {
  series: TrendSeries;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const values = series.points.map((p) => p.value);
  const thresholds = [series.warningThreshold, series.criticalThreshold].filter(
    (t): t is number => typeof t === "number",
  );
  const dataMin = Math.min(...values, ...thresholds);
  const dataMax = Math.max(...values, ...thresholds);
  const span = dataMax - dataMin || 1;
  const yMin = dataMin - span * 0.08;
  const yMax = dataMax + span * 0.08;

  const x = (i: number) =>
    pad.left + (series.points.length <= 1 ? 0 : (i / (series.points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const path = series.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const xTickIdx = [0, Math.floor(series.points.length / 2), series.points.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i && v >= 0,
  );

  const last = series.points[series.points.length - 1];

  return (
    <figure className="w-full">
      <figcaption className="sr-only">
        {series.label} trend in {series.unit}. Latest value {last?.value} {series.unit}.
        {series.warningThreshold ? ` Warning threshold ${series.warningThreshold} ${series.unit}.` : ""}
        {series.criticalThreshold ? ` Critical threshold ${series.criticalThreshold} ${series.unit}.` : ""}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${series.label} trend`}>
        {/* grid + y ticks */}
        {tickVals.map((tv, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(tv)}
              y2={y(tv)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={y(tv) + 3} textAnchor="end" fontSize={10} fill="var(--chart-axis)">
              {tv.toFixed(1)}
            </text>
          </g>
        ))}

        {/* threshold lines */}
        {series.warningThreshold !== undefined && (
          <ThresholdLine y={y(series.warningThreshold)} x1={pad.left} x2={W - pad.right} color="var(--chart-threshold-warning)" label={`Warning ${series.warningThreshold}`} />
        )}
        {series.criticalThreshold !== undefined && (
          <ThresholdLine y={y(series.criticalThreshold)} x1={pad.left} x2={W - pad.right} color="var(--chart-threshold-critical)" label={`Critical ${series.criticalThreshold}`} />
        )}

        {/* data line */}
        <path d={path} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" />

        {/* points w/ native tooltips */}
        {series.points.map((p, i) =>
          i % 3 === 0 || i === series.points.length - 1 ? (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={i === series.points.length - 1 ? 3.5 : 2} fill={series.color}>
              <title>{`${fmtDate(p.timestamp)}: ${p.value} ${series.unit}`}</title>
            </circle>
          ) : null,
        )}

        {/* x ticks */}
        {xTickIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--chart-axis)">
            {fmtDate(series.points[i]!.timestamp)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function ThresholdLine({
  y,
  x1,
  x2,
  color,
  label,
}: {
  y: number;
  x1: number;
  x2: number;
  color: string;
  label: string;
}) {
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={1.25} strokeDasharray="5 3" />
      <text x={x2} y={y - 3} textAnchor="end" fontSize={9} fill={color} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

export interface WaterfallStep {
  label: string;
  units: number;
  kind: "base" | "loss" | "result";
  color: string;
}

/**
 * OEE loss waterfall: Ideal output stepping down through availability,
 * performance, and quality losses to actual good output. Units labelled.
 */
export function LossWaterfallChart({
  steps,
  unit,
  height = 220,
}: {
  steps: WaterfallStep[];
  unit: string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { top: 16, right: 16, bottom: 40, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxVal = Math.max(...steps.map((s) => s.units), 1);
  const barW = (innerW / steps.length) * 0.62;
  const gap = innerW / steps.length;
  const yScale = (v: number) => (v / maxVal) * innerH;

  let running = 0;
  const geoms = steps.map((s, i) => {
    const cx = pad.left + gap * i + gap / 2;
    let top: number;
    let h: number;
    if (s.kind === "base" || s.kind === "result") {
      h = yScale(s.units);
      top = pad.top + innerH - h;
      running = s.units;
    } else {
      h = yScale(s.units);
      const prevTop = pad.top + innerH - yScale(running);
      top = prevTop;
      running = running - s.units;
    }
    return { s, cx, top, h };
  });

  return (
    <figure className="w-full">
      <figcaption className="sr-only">
        OEE loss waterfall in {unit}: {steps.map((s) => `${s.label} ${Math.round(s.units)}`).join(", ")}.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="OEE loss waterfall">
        <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="var(--chart-grid)" />
        {geoms.map(({ s, cx, top, h }, i) => (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(2, h)} rx={2} fill={s.color}>
              <title>{`${s.label}: ${Math.round(s.units).toLocaleString("en-US")} ${unit}`}</title>
            </rect>
            <text x={cx} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--chart-axis)">
              {Math.round(s.units).toLocaleString("en-US")}
            </text>
            <text x={cx} y={H - 22} textAnchor="middle" fontSize={9.5} fill="var(--color-text-secondary)">
              {s.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Small inline sparkline (no axes) for dense tables/cards. */
export function Sparkline({
  values,
  color = "var(--chart-vibration)",
  width = 96,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible")} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export interface RankedLoss {
  label: string;
  units: number;
  color: string;
}

/**
 * Ranked loss-attribution bars. Bars are scaled to the LARGEST loss (not to
 * ideal output), so availability/performance/quality losses remain visually
 * distinguishable even though each is small relative to ideal throughput.
 * Exact values, units, and share-of-total-loss are shown as text (accessible).
 */
export function RankedLossBars({
  losses,
  unit,
}: {
  losses: RankedLoss[];
  unit: string;
}) {
  const sorted = [...losses].sort((a, b) => b.units - a.units);
  const max = Math.max(...sorted.map((l) => l.units), 1);
  const total = sorted.reduce((s, l) => s + l.units, 0) || 1;

  return (
    <ul className="space-y-3">
      {sorted.map((l, i) => (
        <li key={l.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="flex items-center gap-2 text-text-primary">
              {i === 0 ? (
                <span className="rounded-sm bg-critical-subtle px-1 text-[10px] font-semibold text-critical-text">
                  Largest loss
                </span>
              ) : null}
              {l.label}
            </span>
            <span className="tabular-nums text-text-secondary">
              <span className="font-semibold text-text-primary">
                {Math.round(l.units).toLocaleString("en-US")}
              </span>{" "}
              {unit} · {((l.units / total) * 100).toFixed(0)}%
            </span>
          </div>
          <div
            className="mt-1 h-3 w-full overflow-hidden rounded bg-elevated"
            role="img"
            aria-label={`${l.label}: ${Math.round(l.units)} ${unit}, ${((l.units / total) * 100).toFixed(0)}% of total loss`}
          >
            <div
              className="h-full rounded"
              style={{ width: `${(l.units / max) * 100}%`, backgroundColor: l.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
