import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Large tabular metric value with an aligned unit. */
export function MetricValue({
  value,
  unit,
  className,
}: {
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("metric-value inline-flex items-baseline gap-1", className || "text-text-primary")}>
      <span className="text-metric-lg tabular-nums">{value}</span>
      {unit ? <span className="text-sm text-text-muted">{unit}</span> : null}
    </span>
  );
}

export function MetricDelta({
  value,
  direction,
  goodDirection = "down",
  suffix,
}: {
  value: number;
  direction?: "up" | "down";
  /** Which direction is "good" (green). E.g. OEE up is good; losses down is good. */
  goodDirection?: "up" | "down";
  suffix?: string;
}) {
  const dir = direction ?? (value >= 0 ? "up" : "down");
  const isGood = dir === goodDirection;
  const arrow = dir === "up" ? "▲" : "▼";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        isGood ? "text-healthy-text" : "text-critical-text",
      )}
    >
      <span aria-hidden>{arrow}</span>
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  footnote,
  accent,
  emphasis,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  footnote?: ReactNode;
  accent?: "brand" | "healthy" | "attention" | "critical" | "ai" | "planned" | "neutral";
  emphasis?: boolean;
}) {
  const valueTone: Record<string, string> = {
    brand: "text-brand-text",
    healthy: "text-healthy-text",
    attention: "text-attention-text",
    critical: "text-critical-text",
    ai: "text-ai-text",
    planned: "text-planned-text",
    neutral: "text-text-primary",
  };
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-subtle">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <MetricValue value={value} unit={unit} className={accent ? valueTone[accent] : ""} />
        {delta}
      </div>
      {footnote ? (
        <div className="mt-1.5 text-xs text-text-secondary">{footnote}</div>
      ) : null}
    </div>
  );
}

/** Compact key/value row list for dense specs. */
export function KeyValueList({
  items,
}: {
  items: Array<{ key: ReactNode; value: ReactNode }>;
}) {
  return (
    <dl className="divide-y divide-border">
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-sm text-text-secondary">{it.key}</dt>
          <dd className="text-right text-sm font-medium tabular-nums text-text-primary">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
