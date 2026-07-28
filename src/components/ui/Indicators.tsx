import { cn } from "@/lib/cn";
import { fmtPercent } from "@/lib/format";
import type { EventSeverity } from "@/domain/enums";
import { EVENT_SEVERITY } from "@/design-system/status";

function bandForScore(score: number, invert = false): { label: string; color: string; text: string } {
  // invert=true means high is BAD (risk). Otherwise high is GOOD (health).
  const s = invert ? 100 - score : score;
  if (s >= 75) return { label: invert ? "Low" : "Good", color: "bg-healthy", text: "text-healthy-text" };
  if (s >= 50) return { label: invert ? "Elevated" : "Fair", color: "bg-attention", text: "text-attention-text" };
  return { label: invert ? "High" : "Poor", color: "bg-critical", text: "text-critical-text" };
}

/** Equipment health 0–100 (100 = healthy). */
export function HealthScore({ score }: { score: number }) {
  const band = bandForScore(score);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Health score
        </span>
        <span className={cn("text-xs font-semibold", band.text)}>{band.label}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="metric-value text-metric tabular-nums text-text-primary">{score}</span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
      <Track value={score} color={band.color} ariaLabel={`Health score ${score} of 100`} />
    </div>
  );
}

/** Risk score 0–100 (higher = worse) with a severity band. */
export function RiskIndicator({
  score,
  severity,
}: {
  score: number;
  severity: EventSeverity;
}) {
  const token = EVENT_SEVERITY[severity];
  const band = bandForScore(score, true);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Risk score
        </span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", token.className, "rounded border px-1.5 py-0.5")}>
          <span aria-hidden>{token.symbol}</span>
          {token.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="metric-value text-metric tabular-nums text-text-primary">{score}</span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
      <Track value={score} color={band.color} ariaLabel={`Risk score ${score} of 100`} />
    </div>
  );
}

/** OEE shown as a number plus its three component bars (no decorative dial). */
export function OEEGauge({
  oee,
  availability,
  performance,
  quality,
  compact = false,
}: {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  compact?: boolean;
}) {
  const components: Array<{ label: string; value: number; color: string }> = [
    { label: "Availability", value: availability, color: "bg-[var(--chart-availability)]" },
    { label: "Performance", value: performance, color: "bg-[var(--chart-performance)]" },
    { label: "Quality", value: quality, color: "bg-[var(--chart-quality)]" },
  ];
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="metric-value text-metric-lg tabular-nums text-text-primary">
          {fmtPercent(oee, 1)}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">OEE</span>
      </div>
      <div className={cn("mt-3 space-y-2", compact && "mt-2 space-y-1.5")}>
        {components.map((c) => (
          <div key={c.label}>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">{c.label}</span>
              <span className="tabular-nums font-medium text-text-primary">{fmtPercent(c.value, 1)}</span>
            </div>
            <Track value={c.value * 100} color={c.color} ariaLabel={`${c.label} ${fmtPercent(c.value)}`} thin />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Deterministic trend-projection / assessment confidence 0–1. This is NOT an
 * LLM or documented predictive-model confidence — it reflects data density and
 * how clearly thresholds are breached, from the deterministic risk engine.
 */
export function ConfidenceIndicator({
  value,
  label = "Trend-projection confidence",
}: {
  value: number;
  label?: string;
}) {
  const pips = 5;
  const filled = Math.round(value * pips);
  return (
    <div className="inline-flex items-center gap-2" aria-label={`${label} ${fmtPercent(value, 0)}`}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: pips }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-sm",
              i < filled ? "bg-brand" : "bg-elevated ring-1 ring-inset ring-border",
            )}
          />
        ))}
      </span>
      <span className="text-xs font-semibold tabular-nums text-text-primary">{fmtPercent(value, 0)}</span>
    </div>
  );
}

function Track({
  value,
  color,
  ariaLabel,
  thin,
}: {
  value: number;
  color: string;
  ariaLabel: string;
  thin?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("mt-1.5 w-full overflow-hidden rounded-full bg-elevated", thin ? "h-1.5" : "h-2")}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
