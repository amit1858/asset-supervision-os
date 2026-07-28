import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  INTEGRATION_STATE_META,
  type IntegrationState,
  type SourceState,
} from "@/domain/integration";

/**
 * Enterprise page header — record/workspace header with breadcrumbs, title,
 * description, contextual primary/secondary actions, and an optional tab row.
 * Replaces ad-hoc PageTitle usage with a consistent, dense header.
 */
export function EnterprisePageHeader({
  title,
  description,
  eyebrow,
  primaryAction,
  secondaryActions,
  tabs,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-content px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-3xl text-sm text-text-secondary">{description}</p>
            ) : null}
            {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">{meta}</div> : null}
          </div>
          {primaryAction || secondaryActions ? (
            <div className="flex shrink-0 items-center gap-2">
              {secondaryActions}
              {primaryAction}
            </div>
          ) : null}
        </div>
        {tabs ? <div className="mt-3">{tabs}</div> : null}
      </div>
    </div>
  );
}

/** Horizontal tab set for record/workspace headers. */
export function Tabs({
  tabs,
  active,
}: {
  tabs: Array<{ key: string; label: string; href: string }>;
  active: string;
}) {
  return (
    <div className="flex gap-1 border-b border-border" role="tablist">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <a
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              isActive
                ? "border-brand text-brand-text"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}

/**
 * Summary strip — grouped KPIs in ONE bordered container with dividers, instead
 * of a row of independent metric cards. The default way to present related
 * metrics.
 */
export interface SummaryItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: "default" | "critical" | "attention" | "healthy";
}

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  const tone: Record<string, string> = {
    default: "text-text-primary",
    critical: "text-critical-text",
    attention: "text-attention-text",
    healthy: "text-healthy-text",
  };
  return (
    <div className="grid grid-cols-2 divide-border rounded-md border border-border bg-surface sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className="border-t border-border px-4 py-3 first:border-t-0 sm:border-t-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div>
          <div className={cn("mt-1 text-lg font-semibold tabular-nums", tone[it.emphasis ?? "default"])}>
            {it.value}
          </div>
          {it.hint ? <div className="mt-0.5 text-[11px] text-text-muted">{it.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Contextual action bar (primary/secondary actions for a section). */
export function CommandBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-elevated px-3 py-2", className)}>
      {children}
    </div>
  );
}

/** Filter bar with a leading label and inline filter controls. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Filters</span>
      {children}
    </div>
  );
}

/** Right-hand contextual detail panel. */
export function DetailPanel({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}

/** Neutral empty workspace (not an error) for queues/lists with no items. */
export function EmptyWorkspace({
  title,
  description,
  hint,
}: {
  title: string;
  description?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-text-secondary">{description}</p> : null}
      {hint ? <div className="mt-3">{hint}</div> : null}
    </div>
  );
}

/** Read-only banner explaining why an action is unavailable for this persona. */
export function ReadOnlyNotice({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-xs text-text-secondary" role="note">
      <span aria-hidden className="text-text-muted">🔒</span>
      <span>{reason}</span>
    </div>
  );
}

/** Source-system status — provenance and freshness of the underlying data. */
export function SourceStatus({
  sourceMode,
  freshness,
  updated,
}: {
  sourceMode: "local" | "snowflake";
  freshness: "live" | "recent" | "stale" | "offline";
  updated?: string;
}) {
  const src =
    sourceMode === "snowflake"
      ? { label: "Snowflake", dot: "bg-healthy" }
      : { label: "Local seeded source", dot: "bg-info" };
  const fresh: Record<string, { label: string; cls: string }> = {
    live: { label: "Live", cls: "text-healthy-text" },
    recent: { label: "Recent", cls: "text-text-secondary" },
    stale: { label: "Stale", cls: "text-attention-text" },
    offline: { label: "No feed", cls: "text-critical-text" },
  };
  return (
    <div className="inline-flex items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <span className={cn("h-1.5 w-1.5 rounded-full", src.dot)} aria-hidden />
        {src.label}
      </span>
      <span className={fresh[freshness]!.cls}>{fresh[freshness]!.label}{updated ? ` · ${updated}` : ""}</span>
    </div>
  );
}

const STATE_DOT: Record<string, string> = {
  healthy: "bg-healthy",
  attention: "bg-attention",
  neutral: "bg-neutralstatus",
  critical: "bg-critical",
  info: "bg-info",
};

/** A single integration-state chip (shape + label + colour; never colour alone). */
export function IntegrationBadge({ state }: { state: IntegrationState }) {
  const meta = INTEGRATION_STATE_META[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
      <span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[meta.tone])} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Panel listing source systems and their integration states (item 8). */
export function SourcePanel({ sources }: { sources: SourceState[] }) {
  return (
    <ul className="divide-y divide-border">
      {sources.map((s) => (
        <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="text-text-secondary">{s.label}</span>
          <span className="flex items-center gap-2">
            {s.note ? <span className="text-[11px] text-text-muted">{s.note}</span> : null}
            <IntegrationBadge state={s.state} />
          </span>
        </li>
      ))}
    </ul>
  );
}
