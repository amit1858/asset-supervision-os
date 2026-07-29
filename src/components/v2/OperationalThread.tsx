"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/layout/icons";
import { useOperationalContext } from "@/context/OperationalContext";
import { buildOperationalThread } from "@/v2/thread";

/**
 * The operational thread indicator — the persistent Signal→…→Value story that
 * links personas around the active asset (blueprint §5). It is a NAVIGATION seam
 * only in Phase 1: each stage names the accountable persona and links to the
 * `/v2` surface where that stage's work lives, preserving the asset context. No
 * events, approvals, or outcomes are fabricated. When no asset thread is active,
 * it explains how to start one instead of inventing a story.
 */
export function OperationalThread({ assetTag: assetTagOverride }: { assetTag?: string } = {}) {
  const ctx = useOperationalContext();
  const personaId = ctx.personaId;
  const assetTag = assetTagOverride ?? ctx.assetTag;

  if (!assetTag) {
    return (
      <section
        aria-label="Operational thread"
        className="rounded-md border border-dashed border-border bg-surface px-4 py-3 text-xs text-text-secondary"
      >
        No active asset thread. Open an asset record to follow it across
        personas — from signal through to realised value.
      </section>
    );
  }

  const thread = buildOperationalThread(assetTag, personaId);

  return (
    <section aria-label="Operational thread" className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon name="asset" size={16} className="text-brand" />
          <h2 className="text-sm font-semibold text-text-primary">
            Operational thread · {thread.assetTag}
          </h2>
        </div>
        <Link
          href={thread.assetRecordHref}
          className="text-xs font-semibold text-brand-text hover:underline"
        >
          Open Asset 360 →
        </Link>
      </div>

      <ol className="flex flex-col gap-px sm:flex-row sm:flex-wrap sm:gap-0">
        {thread.stages.map((stage, i) => (
          <li key={stage.key} className="min-w-0 flex-1 sm:basis-1/4 lg:basis-0">
            <Link
              href={stage.href}
              aria-current={stage.isCurrent ? "step" : undefined}
              className={cn(
                "flex h-full flex-col gap-0.5 border-b border-r border-border px-3 py-2.5 transition-colors hover:bg-elevated",
                stage.isCurrent && "bg-brand-subtle",
              )}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums",
                    stage.isCurrent
                      ? "bg-brand text-white"
                      : "bg-elevated text-text-muted",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                {stage.label}
              </span>
              <span className={cn("truncate text-xs", stage.isCurrent ? "font-semibold text-brand-text" : "text-text-secondary")}>
                {stage.ownerName}
                {stage.isCurrent ? " · you" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
