import Link from "next/link";
import type { PersonaBrief, BriefEvidence, BriefAction, BriefDecision } from "@/brief/types";
import { SourcePanel } from "@/components/ui/enterprise";
import { DeterministicVsAIIndicator } from "@/components/ui/AI";
import { DispositionBadge } from "@/components/ui/Badge";
import { PROVENANCE } from "@/design-system/status";
import { Icon } from "@/components/layout/icons";
import { DiscussBriefButton } from "@/components/voice/VoiceLauncher";
import { cn } from "@/lib/cn";
import { fmtCurrency, fmtDate } from "@/lib/format";
import type { Provenance } from "@/domain/enums";
import type { RecommendedDisposition } from "@/domain/enums";

/**
 * "My Brief" — the Chief of Staff briefing layer, compacted so the operational
 * workspace is visible within the first desktop viewport. It answers: what
 * changed, why it matters, what to do, who owns it, and when it is due. Full
 * evidence, secondary items, and governance notes live in an expandable drawer;
 * provenance is a small indicator beside claims, not a repeated chip.
 */
export function MyBrief({
  brief,
  variant = "default",
}: {
  brief: PersonaBrief;
  variant?: "default" | "v2";
}) {
  const v2 = variant === "v2";
  const primaryDecision = brief.decisions[0] ?? null;
  const primaryAction = [...brief.actions].sort((a, b) => a.priority - b.priority)[0] ?? null;
  const primaryBlocker = brief.blockers[0] ?? null;
  const hasSide = primaryBlocker !== null;

  const body = (
    <>
      {/* Max three concise change bullets */}
      {brief.summary.points.length > 0 ? (
        <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
          {brief.summary.points.slice(0, 3).map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Compact metric strip */}
      {brief.riskValue.length > 0 ? (
        <div className="grid grid-cols-2 divide-border overflow-hidden rounded border border-border sm:grid-cols-3 sm:divide-x">
          {brief.riskValue.slice(0, 3).map((rv) => (
            <div key={rv.label} className="border-t border-border px-3 py-1.5 first:border-t-0 sm:border-t-0">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted">
                <ProvDot provenance={rv.provenance} />
                {rv.label}
              </div>
              <div className="text-sm font-semibold tabular-nums text-text-primary">{rv.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Primary decision/action + key blocker (content-aware 8/4) */}
      <div className={cn("grid grid-cols-1 gap-3", hasSide && "lg:grid-cols-3")}>
        <div className={cn(hasSide && "lg:col-span-2")}>
          {primaryDecision ? (
            <PrimaryDecision decision={primaryDecision} v2={v2} />
          ) : primaryAction ? (
            <PrimaryAction action={primaryAction} />
          ) : (
            <div className="rounded border border-border bg-canvas px-3 py-2 text-sm text-text-muted">
              No action required for this persona right now.
            </div>
          )}
        </div>
        {primaryBlocker ? (
          <div className="rounded border border-border bg-canvas px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-attention-text">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-attention" />
              Key blocker
            </div>
            <div className="mt-0.5 text-sm font-medium text-text-primary">{primaryBlocker.summary}</div>
            <div className="text-xs text-text-secondary">Depends on: {primaryBlocker.dependency}</div>
            <EvidenceDots evidence={primaryBlocker.evidence} />
          </div>
        ) : null}
      </div>

      {/* Detail & evidence drawer (keeps the first viewport compact) */}
      {detailDrawer(brief)}
    </>
  );

  return (
    <section aria-label="My Brief" className="rounded-md border border-border bg-surface">
      {/* Heading + update time (governance detail lives in the drawer) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon name="candidates" size={16} className="text-brand" />
          <h2 className="text-sm font-semibold text-text-primary">{brief.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            Evidence-backed brief · Updated {fmtDate(brief.generatedAt)}
          </span>
          <DiscussBriefButton />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* One-sentence executive summary */}
        <p className="text-sm font-medium text-text-primary">{brief.summary.headline}</p>

        {v2 ? (
          <>
            {/* Visual-first command center: the operational workspace stays visible;
                the full brief collapses behind an at-a-glance strip. */}
            <BriefGlance brief={brief} />
            <details className="group rounded border border-border bg-canvas">
              <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary marker:content-none">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="chevron-down" size={13} className="transition-transform group-open:rotate-180" />
                  Full brief
                </span>
                <span className="text-text-muted">
                  {brief.changes.length} changes · {brief.actions.length + brief.decisions.length} items
                </span>
              </summary>
              <div className="space-y-3 border-t border-border p-3">{body}</div>
            </details>
          </>
        ) : (
          body
        )}
      </div>
    </section>
  );
}

/** The at-a-glance strip for the V2 command center: the governed decision
 * exposure, projected horizon, key blocker and human-decision status — enough to
 * orient without expanding the full brief. */
function BriefGlance({ brief }: { brief: PersonaBrief }) {
  const exposure = brief.riskValue.find((r) => /decision exposure/i.test(r.label));
  const horizon = brief.riskValue.find((r) => /time-to-critical/i.test(r.label));
  const blocker = brief.blockers[0] ?? null;
  const pendingDecision = brief.decisions.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded border border-border bg-canvas px-3 py-2 text-xs">
      {exposure ? <GlanceStat label={exposure.label} value={exposure.value} /> : null}
      {horizon ? <GlanceStat label={horizon.label} value={horizon.value} /> : null}
      {blocker ? (
        <span className="inline-flex items-center gap-1.5 text-attention-text">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-attention" />
          Blocker: {blocker.summary}
        </span>
      ) : null}
      {pendingDecision ? (
        <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-text-secondary">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          Awaiting a governed human decision
        </span>
      ) : null}
    </div>
  );
}

function GlanceStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-text-primary">{value}</span>
    </span>
  );
}

function detailDrawer(brief: PersonaBrief) {
  return (
    <>
      {/* Detail & evidence drawer (keeps the first viewport compact) */}
      <details className="group rounded border border-border bg-canvas">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="chevron-down" size={13} className="transition-transform group-open:rotate-180" />
              Brief detail & evidence
            </span>
            <span className="text-text-muted">
              {brief.changes.length} changes · {brief.actions.length + brief.decisions.length} items
            </span>
          </summary>
          <div className="space-y-4 border-t border-border p-3">
            {brief.changes.length > 0 ? (
              <DrawerBlock title="Changes since last review">
                <ul className="space-y-1.5">
                  {brief.changes.map((c) => (
                    <li key={c.id} className="text-sm">
                      <span className="font-medium text-text-primary">{c.summary}</span>
                      {c.detail ? <span className="text-text-secondary"> — {c.detail}</span> : null}
                      <EvidenceRow evidence={c.evidence} />
                    </li>
                  ))}
                </ul>
              </DrawerBlock>
            ) : null}

            {brief.decisions.length + brief.actions.length > 0 ? (
              <DrawerBlock title="Decisions & actions">
                <ul className="space-y-2">
                  {brief.decisions.map((d) => (
                    <li key={d.id} className="text-sm">
                      <span className="font-medium text-text-primary">Decision: {d.title}</span>
                      <span className="text-text-secondary"> — owner {d.owner.name}{d.dueBy ? `, due ${fmtDate(d.dueBy)}` : ""}</span>
                      <EvidenceRow evidence={d.evidence} />
                    </li>
                  ))}
                  {brief.actions.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium text-text-primary">{a.title}</span>
                      <span className="text-text-secondary"> — {a.why}</span>
                      <EvidenceRow evidence={a.evidence} />
                    </li>
                  ))}
                </ul>
              </DrawerBlock>
            ) : null}

            <DrawerBlock title="Source freshness">
              <div className="overflow-hidden rounded border border-border">
                <SourcePanel sources={brief.sources} />
              </div>
              {brief.unavailableSections.length > 0 ? (
                <ul className="mt-2 space-y-0.5">
                  {brief.unavailableSections.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-neutralstatus" />
                      Unavailable — {s}
                    </li>
                  ))}
                </ul>
              ) : null}
            </DrawerBlock>

            <DrawerBlock title="How to read this brief">
              <p className="mb-2 text-xs text-text-secondary">
                The Chief of Staff assembles governed facts — it is not a source of truth. Deterministic
                systems establish facts and calculations; source systems provide records; an AI may
                summarise but does not decide. Every item links to its evidence.
              </p>
              <DeterministicVsAIIndicator />
            </DrawerBlock>
          </div>
        </details>
      </>
  );
}

function PrimaryDecision({ decision, v2 }: { decision: BriefDecision; v2?: boolean }) {
  return (
    <div className="rounded border border-border bg-brand-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-text">
          <Icon name="approvals" size={13} /> {v2 ? "Governed decision" : "Decision awaiting you"}
        </span>
        {decision.disposition ? <DispositionBadge disposition={decision.disposition as RecommendedDisposition} size="sm" /> : null}
      </div>
      <div className="mt-1 text-sm font-semibold text-text-primary">{decision.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
        <span>Owner: {decision.owner.name}</span>
        {decision.dueBy ? <span>Due {fmtDate(decision.dueBy)}</span> : null}
        {decision.valueAtStakeUsd != null ? (
          <span>{fmtCurrency(decision.valueAtStakeUsd, "USD", true)} {v2 ? "decision exposure" : "at stake"}</span>
        ) : null}
        <EvidenceDots evidence={decision.evidence} inline />
      </div>
      {decision.href ? (
        <Link href={decision.href} className="mt-1.5 inline-block text-xs font-semibold text-brand-text hover:underline">
          {v2 ? "Review governed case →" : "Review \u0026 approve →"}
        </Link>
      ) : null}
    </div>
  );
}

function PrimaryAction({ action }: { action: BriefAction }) {
  return (
    <div className="rounded border border-border bg-brand-subtle px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-text">Priority action</span>
      <div className="mt-0.5 text-sm font-semibold text-text-primary">{action.title}</div>
      <p className="text-xs text-text-secondary">{action.why}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
        {action.dueBy ? <span>Due {fmtDate(action.dueBy)}</span> : null}
        {action.owner ? <span>Owner: {action.owner.name}</span> : null}
        <EvidenceDots evidence={action.evidence} inline />
      </div>
      {action.href ? (
        <Link href={action.href} className="mt-1.5 inline-block text-xs font-semibold text-brand-text hover:underline">
          Open →
        </Link>
      ) : null}
    </div>
  );
}

function ProvDot({ provenance }: { provenance: Provenance }) {
  const meta = PROVENANCE[provenance];
  return (
    <>
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full align-middle", meta.dotClass)} title={meta.label} aria-hidden />
      <span className="sr-only">{meta.label}: </span>
    </>
  );
}

/** Small provenance indicators (dots) — full evidence lives in the drawer. */
function EvidenceDots({ evidence, inline }: { evidence: BriefEvidence[]; inline?: boolean }) {
  if (evidence.length === 0) return null;
  const provs = Array.from(new Set(evidence.map((e) => e.provenance)));
  return (
    <span className={cn("inline-flex items-center gap-1", !inline && "mt-1")}>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">Evidence</span>
      {provs.map((p) => (
        <ProvDot key={p} provenance={p} />
      ))}
    </span>
  );
}

/** Full evidence list (drawer only). */
function EvidenceRow({ evidence }: { evidence: BriefEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
      {evidence.map((e, i) => {
        const meta = PROVENANCE[e.provenance];
        const chip = (
          <span className="inline-flex items-center gap-1 text-[11px] text-text-muted" title={`${e.label}: ${e.value} (${meta.label})`}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dotClass)} aria-hidden />
            {e.label}
          </span>
        );
        return e.href ? <Link key={i} href={e.href} className="hover:underline">{chip}</Link> : <span key={i}>{chip}</span>;
      })}
    </span>
  );
}

function DrawerBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
      {children}
    </div>
  );
}
