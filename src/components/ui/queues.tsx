import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** A titled container for a list section, with an item count. */
export function QueueSection({
  title,
  count,
  actions,
  children,
  description,
}: {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {typeof count === "number" ? (
            <span className="rounded bg-elevated px-1.5 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
              {count}
            </span>
          ) : null}
        </div>
        {actions}
      </div>
      {description ? (
        <p className="border-b border-border bg-elevated/50 px-4 py-1.5 text-xs text-text-muted">{description}</p>
      ) : null}
      {children}
    </section>
  );
}

export interface RecordRow {
  id: string;
  /** Leading monospace identifier (e.g. equipment tag or WO number). */
  ref?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}

/** Dense enterprise record list (rows, not cards). */
export function RecordList({ rows, empty }: { rows: RecordRow[]; empty?: ReactNode }) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-text-muted">{empty ?? "No records."}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const inner = (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              {r.ref ? <span className="shrink-0">{r.ref}</span> : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{r.primary}</div>
                {r.secondary ? <div className="truncate text-xs text-text-secondary">{r.secondary}</div> : null}
              </div>
            </div>
            {r.trailing ? <div className="flex shrink-0 items-center gap-3">{r.trailing}</div> : null}
          </div>
        );
        return (
          <li key={r.id} className="hover:bg-elevated/50">
            {r.href ? (
              <Link href={r.href} className="block focus-visible:bg-elevated">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Work queue — prioritised list of work items a persona owns. */
export function WorkQueue({
  title,
  rows,
  count,
  actions,
  description,
  empty,
}: {
  title: ReactNode;
  rows: RecordRow[];
  count?: number;
  actions?: ReactNode;
  description?: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <QueueSection title={title} count={count ?? rows.length} actions={actions} description={description}>
      <RecordList rows={rows} empty={empty} />
    </QueueSection>
  );
}

export interface ApprovalItem {
  id: string;
  ref?: ReactNode;
  title: ReactNode;
  owner: string;
  due?: string;
  valueLabel?: ReactNode;
  href?: string;
  action?: ReactNode;
}

/** Approval queue — items awaiting a decision by an authorised persona. */
export function ApprovalQueue({ items, empty }: { items: ApprovalItem[]; empty?: ReactNode }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-text-muted">{empty ?? "No approvals pending."}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {a.ref}
                <span className="truncate text-sm font-medium text-text-primary">{a.title}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                <span>Owner: {a.owner}</span>
                {a.due ? <span>Due {a.due}</span> : null}
                {a.valueLabel ? <span>{a.valueLabel}</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {a.href ? (
                <Link href={a.href} className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-elevated">
                  Review
                </Link>
              ) : null}
              {a.action}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface ExceptionItem {
  id: string;
  severity: "critical" | "attention" | "info";
  label: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}

/** Exception panel — deviations requiring intervention, ranked by severity. */
export function ExceptionPanel({ items, empty }: { items: ExceptionItem[]; empty?: ReactNode }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-text-muted">{empty ?? "No exceptions."}</div>;
  }
  const dot: Record<string, string> = {
    critical: "bg-critical",
    attention: "bg-attention",
    info: "bg-info",
  };
  const sym: Record<string, string> = { critical: "◆", attention: "▲", info: "ℹ" };
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[e.severity])} aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                <span className="sr-only">{e.severity}: </span>
                <span aria-hidden className="mr-1 text-text-muted">{sym[e.severity]}</span>
                {e.label}
              </div>
              {e.detail ? <div className="text-xs text-text-secondary">{e.detail}</div> : null}
            </div>
          </div>
          {e.trailing ? <div className="shrink-0">{e.trailing}</div> : null}
        </li>
      ))}
    </ul>
  );
}
