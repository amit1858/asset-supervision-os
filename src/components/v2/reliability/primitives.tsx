import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { FreshnessState } from "@/v2/domain/freshness-state";
import type { GovernedMetricView } from "@/v2/reliability/view-types";

/**
 * September 6–7 Reliability experience — pure presentation primitives.
 *
 * These render already-resolved governed view-model data. They perform NO
 * governed calculation, read NO clock, and import NO server module. Status is
 * always conveyed with a text label (and a shape), never by colour alone.
 */

const FRESHNESS_TONE: Record<
  FreshnessState,
  { dot: string; text: string; shape: string }
> = {
  fresh: { dot: "bg-healthy", text: "text-healthy-text", shape: "rounded-full" },
  stale: { dot: "bg-attention", text: "text-attention-text", shape: "rounded-sm" },
  missing: { dot: "bg-critical", text: "text-critical-text", shape: "rounded-none" },
  unknown: { dot: "bg-border-strong", text: "text-text-secondary", shape: "rounded-full ring-1 ring-border" },
};

/** A freshness + trust chip. Colour is reinforced by a distinct shape AND text. */
export function TrustFreshnessPill({
  freshness,
  freshnessLabel,
  trustLabel,
}: {
  freshness: FreshnessState;
  freshnessLabel: string;
  trustLabel: string;
}) {
  const tone = FRESHNESS_TONE[freshness];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
      <span className={cn("h-1.5 w-1.5", tone.dot, tone.shape)} aria-hidden />
      <span className={tone.text}>{freshnessLabel}</span>
      <span className="text-text-muted">·</span>
      <span className="text-text-muted">{trustLabel}</span>
    </span>
  );
}

/** A bordered section with a dense header and optional aside. */
export function SectionCard({
  title,
  eyebrow,
  aside,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {eyebrow}
            </div>
          ) : null}
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        {aside ? <div className="shrink-0 text-xs text-text-muted">{aside}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A single governed metric cell — value plus provenance/freshness footer. */
export function GovernedMetricCell({ metric }: { metric: GovernedMetricView }) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {metric.label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          metric.available ? "text-text-primary" : "text-text-muted",
        )}
      >
        {metric.display}
      </div>
      <div className="mt-1.5">
        <TrustFreshnessPill
          freshness={metric.freshness}
          freshnessLabel={metric.freshnessLabel}
          trustLabel={metric.trustLabel}
        />
      </div>
      {!metric.available && metric.unavailableReason ? (
        <div className="mt-1 text-[11px] text-text-muted">
          {metric.unavailableReason}
        </div>
      ) : null}
    </div>
  );
}

/** A responsive grid of governed metric cells. */
export function MetricGrid({ metrics }: { metrics: readonly GovernedMetricView[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m) => (
        <GovernedMetricCell key={m.key} metric={m} />
      ))}
    </div>
  );
}
