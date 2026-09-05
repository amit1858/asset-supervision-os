import Link from "next/link";
import { cn } from "@/lib/cn";
import { SectionCard, TrustFreshnessPill } from "@/components/v2/reliability/primitives";
import { OperationalHorizonTimeline } from "@/components/v2/reliability/visuals";
import { formatUtcInstant } from "@/v2/reliability/view-types";
import type {
  EvidenceLineageRowView,
  TurnaroundAccountabilityView,
  TurnaroundControlView,
  TurnaroundIdentityView,
  TurnaroundSummaryView,
  TurnaroundWorkOrderView,
} from "@/v2/turnaround/view-types";

/**
 * September 9 Turnaround Control experience — pure presentation.
 *
 * Every figure arrives resolved on the view model; these components compute
 * nothing and import no server module. There are NO scheduling, procurement,
 * approval or scope-mutation controls. The governed subject identity
 * (turnaround scope / work order / asset) is shown verbatim, and the mandatory
 * "a fit is not safe to wait" caution is always present.
 */

const READINESS_TONE: Record<
  TurnaroundWorkOrderView["readinessKind"],
  { text: string; shape: string }
> = {
  ready: { text: "text-healthy-text", shape: "rounded-full bg-healthy" },
  blocked: { text: "text-critical-text", shape: "rounded-none bg-critical" },
  available_zero: { text: "text-text-secondary", shape: "rounded-sm bg-border-strong" },
  missing_evidence: { text: "text-text-secondary", shape: "rounded-sm bg-border-strong" },
  not_required: { text: "text-text-muted", shape: "rounded-sm bg-border-strong" },
};

function TurnaroundHeader({
  summary,
  identity,
}: {
  summary: TurnaroundSummaryView;
  identity: TurnaroundIdentityView;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Turnaround control · Scope fit
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            {identity.turnaroundName} <span className="text-text-muted">· {identity.scopePackageCode}</span>
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {summary.assetName} <span className="text-text-muted">· {summary.tag}</span>
          </p>
        </div>
        <Link
          href={summary.assetHref}
          className="shrink-0 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-info-text hover:underline"
        >
          ← Back to Asset 360
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Turnaround fit" value={summary.fitDisplay} />
        <Stat label="Max spare lead" value={summary.maxLeadDisplay} />
        <Stat label="Days until turnaround" value={summary.daysUntilDisplay} />
        <Stat label="Slack" value={summary.slackDisplay} />
      </dl>
      <p className="mt-2 text-[11px] text-text-muted">
        Turnaround fit evaluated {formatUtcInstant(summary.evaluatedAt)}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

/** The exact governed subject the turnaround-fit calculation was evaluated for. */
function GovernedSubjectIdentity({ identity }: { identity: TurnaroundIdentityView }) {
  return (
    <SectionCard
      eyebrow="Governed subject"
      title="Turnaround fit was evaluated for this exact subject"
      aside="Identity shown verbatim"
    >
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <IdentityCell label="Turnaround scope" id={identity.turnaroundScopeId} human={identity.scopePackageCode} />
        <IdentityCell label="Work order" id={identity.workOrderId} human={identity.workOrderNumber} />
        <IdentityCell label="Asset" id={identity.assetId} human={identity.assetTag} />
      </dl>
    </SectionCard>
  );
}

function IdentityCell({ label, id, human }: { label: string; id: string; human: string }) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-semibold text-text-primary">{id}</div>
      <div className="text-[11px] text-text-secondary">{human}</div>
    </div>
  );
}

/**
 * The mandatory read-only caution. A lead-time fit against the turnaround window
 * is NOT a safe-to-wait signal.
 */
function SafeToWaitWarning({ text }: { text: string }) {
  return (
    <div
      role="note"
      className="rounded-md border border-attention-border bg-attention-subtle px-4 py-3"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-attention-text">
        A fit is not a licence to wait
      </div>
      <p className="mt-1 text-xs text-text-primary">{text}</p>
    </div>
  );
}

function WorkOrderTiming({ orders }: { orders: readonly TurnaroundWorkOrderView[] }) {
  return (
    <SectionCard
      eyebrow="Work orders in scope"
      title="Immediate work vs turnaround-held work"
      aside="Timing is derived from the governed subject"
    >
      <div className="space-y-2.5">
        {orders.map((o) => {
          const tone = READINESS_TONE[o.readinessKind];
          return (
            <div key={o.workOrderId} className="rounded-md border border-border bg-elevated px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary">
                    {o.workOrderNumber} <span className="font-normal text-text-muted">· {o.workOrderId}</span>
                  </div>
                  <div className="text-[11px] text-text-secondary">{o.title}</div>
                </div>
                <TrustFreshnessPill
                  freshness="fresh"
                  freshnessLabel={o.freshnessLabel}
                  trustLabel="Deterministic calculation"
                />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Materials readiness
                  </div>
                  <div className="mt-0.5 inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2", tone.shape)} aria-hidden />
                    <span className={cn("text-xs font-semibold", tone.text)}>{o.materialsDisplay}</span>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Execution timing
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs font-semibold",
                      o.timing === "turnaround_scoped" ? "text-info-text" : "text-text-primary",
                    )}
                  >
                    {o.timingLabel}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function AccountabilityCard({
  accountability,
}: {
  accountability: TurnaroundAccountabilityView;
}) {
  return (
    <SectionCard eyebrow="Human accountability" title="Who owns the next decision">
      <dl className="space-y-2 text-xs">
        <Row label="Decision status" value={accountability.decisionStatusLabel} />
        <Row label="Next governed action" value={accountability.nextActLabel} />
        <Row label="Decision owner" value={accountability.decisionOwnerName} />
        <Row label="Turnaround scope owner" value={accountability.scopeOwnerName} />
        <Row
          label="Endorsement"
          value={accountability.endorsementRequired ? accountability.endorsementNote : "No separate endorsement required"}
        />
      </dl>
      <p className="mt-2 text-[11px] text-text-muted">{accountability.readOnlyNotice}</p>
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  );
}

function EvidenceLineage({ rows }: { rows: readonly EvidenceLineageRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-text-secondary">
        Evidence lineage · turnaround &amp; work readiness
      </summary>
      <div className="overflow-x-auto border-t border-border p-4">
        <table className="w-full text-left text-xs">
          <thead className="text-text-muted">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 font-medium">Value</th>
              <th className="px-2 py-1.5 font-medium">Trust</th>
              <th className="px-2 py-1.5 font-medium">Formula</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5 font-medium">Evidence</th>
              <th className="px-2 py-1.5 font-medium">As of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border">
                <td className="px-2 py-1.5 font-medium text-text-primary">{r.label}</td>
                <td className="px-2 py-1.5 text-text-secondary">{r.trustLabel}</td>
                <td className="px-2 py-1.5 tabular-nums text-text-muted">{r.formulaVersion}</td>
                <td className="px-2 py-1.5 text-text-muted">{r.sourceMode}</td>
                <td className="px-2 py-1.5 text-text-muted">
                  {r.evidenceIds.length > 0 ? r.evidenceIds.join(", ") : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-text-muted">{r.asOf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TurnaroundControlWorkspace({ view }: { view: TurnaroundControlView }) {
  return (
    <div className="space-y-4">
      <TurnaroundHeader summary={view.summary} identity={view.identity} />
      <SafeToWaitWarning text={view.safeToWaitWarning} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <GovernedSubjectIdentity identity={view.identity} />
          <SectionCard
            eyebrow="Operational horizon"
            title="Failure horizon vs lead time vs turnaround"
            aside={view.summary.fitDisplay}
          >
            <OperationalHorizonTimeline horizon={view.horizon} />
            {view.summary.availableDate ? (
              <div className="mt-2 text-[11px] text-text-muted">
                Earliest spare availability · <span className="tabular-nums">{view.summary.availableDate}</span>
              </div>
            ) : null}
          </SectionCard>
          <WorkOrderTiming orders={view.workOrders} />
        </div>
        <div className="space-y-4">
          <AccountabilityCard accountability={view.accountability} />
        </div>
      </div>
      <EvidenceLineage rows={view.evidenceLineage} />
    </div>
  );
}
