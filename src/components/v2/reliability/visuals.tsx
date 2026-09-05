import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type {
  GovernedMetricView,
  LifecycleProjectionEntryView,
  OperationalHorizonView,
  SignalSensorView,
} from "@/v2/reliability/view-types";
import { formatUtcDate } from "@/v2/reliability/view-types";
import { TrustFreshnessPill } from "./primitives";

/**
 * September 8 visual-first reliability components — pure CSS + accessible SVG.
 *
 * These render already-resolved governed view-model data. They compute NO
 * governed value, read NO clock and import NO server module. Every visual
 * carries a text/tabular alternative and never relies on colour alone: status
 * is always reinforced by a label and a distinct shape.
 */

/** A faithful 0..1 proportion bar for a governed ratio/score. Neutral fill — no
 * invented threshold band; it visualises the value's own domain only. */
export function ProportionBar({ ratio, label }: { ratio: number | null; label: string }) {
  const pct = ratio === null || !Number.isFinite(ratio) ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-elevated"
      role="img"
      aria-label={label}
    >
      <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} aria-hidden />
    </div>
  );
}

/**
 * A compact, scannable strip of the governed condition & risk metrics. Health,
 * risk and OEE carry a proportion bar (their own 0–100 / 0–1 domain); TTC and
 * exposure are shown as governed values. No band, threshold or colour-coded
 * verdict is invented.
 */
export function ConditionRiskStrip({
  metrics,
  oee,
}: {
  metrics: readonly GovernedMetricView[];
  oee: GovernedMetricView;
}) {
  const cells: Array<{ metric: GovernedMetricView; bar: number | null | undefined }> = [];
  for (const m of metrics) {
    const bar =
      m.key === "health" || m.key === "risk"
        ? m.rawValue === null
          ? null
          : m.rawValue / 100
        : undefined;
    cells.push({ metric: m, bar });
  }
  cells.push({ metric: oee, bar: oee.rawValue });

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map(({ metric, bar }) => (
        <div key={metric.key} className="rounded-md border border-border bg-elevated px-3 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {metric.label}
          </div>
          <div
            className={cn(
              "mt-0.5 text-lg font-semibold tabular-nums",
              metric.available ? "text-text-primary" : "text-text-muted",
            )}
          >
            {metric.display}
          </div>
          {bar !== undefined ? <ProportionBar ratio={bar} label={`${metric.label} level`} /> : null}
          <div className="mt-1.5">
            <TrustFreshnessPill
              freshness={metric.freshness}
              freshnessLabel={metric.freshnessLabel}
              trustLabel={metric.trustLabel}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Sensor trend chart -----------------------------------------------------

interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly pad: number;
  readonly polyline: string;
  readonly warnY: number | null;
  readonly critY: number | null;
  readonly latest: { x: number; y: number } | null;
  readonly yMin: number;
  readonly yMax: number;
}

/** Deterministic chart geometry from a governed reading series. Pure math. */
export function sensorGeometry(sensor: SignalSensorView): ChartGeometry {
  const width = 320;
  const height = 120;
  const pad = 8;
  const values = sensor.points.map((p) => p.v);
  const candidates = [
    ...values,
    ...(sensor.warningThreshold !== null ? [sensor.warningThreshold] : []),
    ...(sensor.criticalThreshold !== null ? [sensor.criticalThreshold] : []),
  ];
  const yMin = candidates.length ? Math.min(...candidates) : 0;
  const yMaxRaw = candidates.length ? Math.max(...candidates) : 1;
  const yMax = yMaxRaw === yMin ? yMin + 1 : yMaxRaw;
  const n = sensor.points.length;

  const xAt = (i: number): number =>
    n <= 1 ? pad : pad + (i / (n - 1)) * (width - 2 * pad);
  const yAt = (v: number): number =>
    height - pad - ((v - yMin) / (yMax - yMin)) * (height - 2 * pad);

  const polyline = sensor.points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(" ");
  const warnY = sensor.warningThreshold !== null ? yAt(sensor.warningThreshold) : null;
  const critY = sensor.criticalThreshold !== null ? yAt(sensor.criticalThreshold) : null;
  const latest =
    n > 0 ? { x: xAt(n - 1), y: yAt(sensor.points[n - 1]!.v) } : null;

  return { width, height, pad, polyline, warnY, critY, latest, yMin, yMax };
}

/**
 * An honest line chart of the real governed reading series with labelled units,
 * warning/critical reference lines read from the seed thresholds, the latest
 * point highlighted, and an accessible text + tabular alternative. No point is
 * fabricated or smoothed.
 */
export function SensorTrendChart({ sensor }: { sensor: SignalSensorView }) {
  const g = sensorGeometry(sensor);
  const summary =
    `${sensor.label}: latest ${sensor.latestDisplay} across ${sensor.points.length} readings. ` +
    (sensor.warningThreshold !== null ? `Warning ${sensor.warningThreshold} ${sensor.unit}. ` : "") +
    (sensor.criticalThreshold !== null ? `Critical ${sensor.criticalThreshold} ${sensor.unit}.` : "");

  return (
    <figure className="rounded-md border border-border bg-elevated p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-text-primary">{sensor.label}</span>
        <span className="text-[11px] tabular-nums text-text-secondary">{sensor.latestDisplay}</span>
      </figcaption>
      {sensor.points.length > 1 ? (
        <svg
          viewBox={`0 0 ${g.width} ${g.height}`}
          className="h-28 w-full"
          role="img"
          aria-label={summary}
          preserveAspectRatio="none"
        >
          {g.critY !== null ? (
            <line
              x1={g.pad}
              x2={g.width - g.pad}
              y1={g.critY}
              y2={g.critY}
              className="stroke-critical"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          ) : null}
          {g.warnY !== null ? (
            <line
              x1={g.pad}
              x2={g.width - g.pad}
              y1={g.warnY}
              y2={g.warnY}
              className="stroke-attention"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}
          <polyline
            points={g.polyline}
            fill="none"
            className="stroke-info"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {g.latest ? (
            <circle cx={g.latest.x} cy={g.latest.y} r={2.5} className="fill-info-text" />
          ) : null}
        </svg>
      ) : (
        <div className="py-6 text-center text-[11px] text-text-muted">
          Not enough readings to plot a trend.
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
        <span className="tabular-nums">
          Scale {g.yMin.toFixed(1)}–{g.yMax.toFixed(1)} {sensor.unit}
        </span>
        {sensor.warningThreshold !== null ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-0 w-3 border-t border-dashed border-attention-border" aria-hidden />
            Warning {sensor.warningThreshold} {sensor.unit}
          </span>
        ) : null}
        {sensor.criticalThreshold !== null ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-0 w-3 border-t border-dotted border-critical-border" aria-hidden />
            Critical {sensor.criticalThreshold} {sensor.unit}
          </span>
        ) : null}
      </div>
      <details className="mt-2 text-[11px]">
        <summary className="cursor-pointer text-text-secondary">Show readings as a table</summary>
        <table className="mt-1 w-full text-left tabular-nums text-text-muted">
          <tbody>
            <tr>
              <td className="py-0.5 pr-3">Latest reading</td>
              <td className="py-0.5">{sensor.latestDisplay}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-3">Readings in window</td>
              <td className="py-0.5">{sensor.points.length}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-3">Warning threshold</td>
              <td className="py-0.5">
                {sensor.warningThreshold !== null ? `${sensor.warningThreshold} ${sensor.unit}` : "—"}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-3">Critical threshold</td>
              <td className="py-0.5">
                {sensor.criticalThreshold !== null ? `${sensor.criticalThreshold} ${sensor.unit}` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// --- Operational horizon timeline ------------------------------------------

/**
 * A single-axis comparison of the governed horizons (failure, lead time,
 * turnaround, slack). The failure marker is rendered with a distinct critical
 * shape and label; the message states plainly that a lead-time fit is not a
 * safe-to-wait signal. Markers carry day values and source notes; a text list
 * is the accessible alternative.
 */
export function OperationalHorizonTimeline({ horizon }: { horizon: OperationalHorizonView }) {
  const plotted = horizon.markers.filter((m) => m.days !== null && m.key !== "slack");
  const maxDays = plotted.reduce((acc, m) => Math.max(acc, m.days ?? 0), 1) * 1.08;

  return (
    <div>
      {horizon.available ? (
        <div className="relative mt-2 mb-6 h-10">
          <div className="absolute left-0 right-0 top-5 h-px bg-border-strong" aria-hidden />
          {plotted.map((m) => {
            const left = `${Math.max(0, Math.min(100, ((m.days ?? 0) / maxDays) * 100))}%`;
            const isFailure = m.key === "failure";
            return (
              <div
                key={m.key}
                className="absolute -translate-x-1/2 text-center"
                style={{ left }}
              >
                <span
                  className={cn(
                    "mx-auto block h-2.5 w-2.5",
                    isFailure ? "rotate-45 bg-critical" : "rounded-full bg-info",
                  )}
                  aria-hidden
                />
                <span className="mt-1 block whitespace-nowrap text-[10px] tabular-nums text-text-secondary">
                  {m.display}
                </span>
                {m.absoluteDate ? (
                  <span className="block whitespace-nowrap text-[9px] tabular-nums text-text-muted">
                    {formatUtcDate(m.absoluteDate)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <ul className="space-y-1">
        {horizon.markers.map((m) => (
          <li key={m.key} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <span
                className={cn(
                  "h-2 w-2",
                  m.key === "failure" ? "rotate-45 bg-critical" : "rounded-full bg-info",
                )}
                aria-hidden
              />
              {m.label}
              <span className="text-text-muted">· {m.sourceNote}</span>
            </span>
            <span className="tabular-nums text-text-primary">
              {m.display}
              {m.absoluteDate ? (
                <span className="ml-1.5 font-normal text-text-muted">
                  · {formatUtcDate(m.absoluteDate)}
                  {m.absoluteDateKind === "presentation-derived" ? " (projected)" : ""}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 rounded-md border border-attention-border bg-attention-subtle px-3 py-2 text-[11px] text-attention-text">
        {horizon.comparisonMessage}
      </p>
    </div>
  );
}

// --- Lifecycle stepper ------------------------------------------------------

/**
 * The governed lifecycle projection as a horizontal stepper: Signal → Production
 * observation → Assessment → Recommendation. The final projected step is the
 * current phase; a distinct trailing node makes explicit that a human decision
 * is pending and is NOT part of the persisted audit trail.
 */
export function LifecycleStepper({
  entries,
  pendingLabel,
}: {
  entries: readonly LifecycleProjectionEntryView[];
  pendingLabel: string;
}) {
  const lastIndex = entries.length - 1;
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
      {entries.map((e, i) => {
        const current = i === lastIndex;
        return (
          <li key={e.eventId} className="flex-1 sm:flex sm:flex-col">
            <div className="flex items-center gap-2 sm:flex-col sm:items-start">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                  current
                    ? "border-info-border bg-info-subtle text-info-text"
                    : "border-border bg-elevated text-text-muted",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    current ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {e.typeLabel}
                </div>
                <div className="text-[10px] tabular-nums text-text-muted">{e.asOf}</div>
              </div>
            </div>
          </li>
        );
      })}
      <li className="flex-1 sm:flex sm:flex-col">
        <div className="flex items-center gap-2 sm:flex-col sm:items-start">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-dashed border-attention-border bg-attention-subtle text-[10px] font-semibold text-attention-text"
            aria-hidden
          >
            ·
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-attention-text">{pendingLabel}</div>
            <div className="text-[10px] text-text-muted">Not yet in the audit trail</div>
          </div>
        </div>
      </li>
    </ol>
  );
}

/** A dense expander used to progressively disclose evidence detail. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-text-secondary">
        {summary}
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}
