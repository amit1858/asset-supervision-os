import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="mb-2 text-2xl text-text-muted" aria-hidden>
        {icon ?? "◍"}
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function LoadingSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="skeleton mb-3 h-3 w-24" />
      <div className="skeleton mb-2 h-8 w-32" />
      <div className="skeleton h-2 w-full" />
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-critical-border bg-critical-subtle px-4 py-4" role="alert">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-critical-text" aria-hidden>
          ◆
        </span>
        <div>
          <p className="text-sm font-semibold text-critical-text">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-text-secondary">{description}</p> : null}
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function StaleDataWarning({ since }: { since: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded border border-attention-border bg-attention-subtle px-2 py-1 text-xs text-attention-text" role="status">
      <span aria-hidden>▲</span>
      <span>Data may be stale — last updated {since}</span>
    </div>
  );
}

export function ConnectionStatus({
  mode,
}: {
  mode: "local" | "snowflake" | "offline";
}) {
  const map = {
    local: { label: "Local seeded data", dot: "bg-info", cls: "text-info-text" },
    snowflake: { label: "Snowflake connected", dot: "bg-healthy", cls: "text-healthy-text" },
    offline: { label: "Offline", dot: "bg-critical", cls: "text-critical-text" },
  } as const;
  const m = map[mode];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

/** Persistent reminder that all figures are synthetic demonstration data. */
export function SyntheticDataBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-planned-border bg-planned-subtle text-planned-text",
        compact ? "rounded px-2 py-1 text-[11px]" : "rounded-md border px-3 py-2 text-xs",
      )}
      role="note"
    >
      <span aria-hidden>◈</span>
      <span>
        <strong className="font-semibold">Synthetic demonstration data.</strong> All plants,
        assets, sensors, costs and recommendations are generated for demonstration only.
      </span>
    </div>
  );
}
