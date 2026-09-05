import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  GovernedMetricCell,
  SectionCard,
  TrustFreshnessPill,
} from "@/components/v2/reliability/primitives";
import { formatUtcInstant } from "@/v2/reliability/view-types";
import type {
  EvidenceLineageRowView,
  LossSegmentView,
  LossVisualizationView,
  OeeLossView,
} from "@/v2/oee/view-types";

/**
 * September 9 OEE & Loss Intelligence experience — pure presentation.
 *
 * Every figure arrives resolved on the view model; these components compute
 * nothing and import no server module. This is the LINE OEE for HDS-2, never a
 * per-asset OEE for K-201. The loss split is drawn only from governed loss
 * magnitudes and their proven-additive total; each exact magnitude is always
 * shown as a numeric label, never hidden behind the bar.
 */

const SEGMENT_TONE: Record<LossSegmentView["key"], string> = {
  availability: "bg-info",
  performance: "bg-attention",
  quality: "bg-border-strong",
};

function OeeHeader({ view }: { view: OeeLossView }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            OEE &amp; loss intelligence · Production line
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            Governed OEE · {view.summary.lineLabel}
          </h2>
        </div>
        <Link
          href={view.assetContext.assetHref}
          className="shrink-0 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-info-text hover:underline"
        >
          K-201 Asset 360 →
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        OEE evaluated {formatUtcInstant(view.summary.evaluatedAt)}
      </p>
    </div>
  );
}

function OeeComponentGrid({ view }: { view: OeeLossView }) {
  return (
    <SectionCard
      eyebrow="Governed OEE"
      title="Line effectiveness and its three components"
      aside={view.oee.display}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GovernedMetricCell metric={view.oee} />
        {view.components.map((m) => (
          <GovernedMetricCell key={m.key} metric={m} />
        ))}
      </div>
    </SectionCard>
  );
}

function LossSplit({ losses }: { losses: LossVisualizationView }) {
  return (
    <SectionCard
      eyebrow="Loss tree"
      title="Where the lost production went"
      aside={losses.presentation === "proportional_split" ? "Proportional split" : "Independent"}
    >
      <p className="text-[11px] text-text-secondary">{losses.rationale}</p>

      {losses.presentation === "proportional_split" && losses.totalUnits !== null ? (
        <div
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-elevated"
          role="img"
          aria-label={`Loss split, total ${losses.totalDisplay} ${losses.unitLabel}`}
        >
          {losses.segments.map((s) =>
            s.ratio === null ? null : (
              <div
                key={s.key}
                className={cn("h-full", SEGMENT_TONE[s.key])}
                style={{ width: `${Math.max(0, Math.min(1, s.ratio)) * 100}%` }}
                aria-hidden
              />
            ),
          )}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {losses.segments.map((s) => (
          <div
            key={s.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-elevated px-3 py-2"
          >
            <div className="inline-flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-sm", SEGMENT_TONE[s.key])} aria-hidden />
              <span className="text-xs font-semibold text-text-primary">{s.label}</span>
              <TrustFreshnessPill
                freshness={s.metric.freshness}
                freshnessLabel={s.metric.freshnessLabel}
                trustLabel={s.metric.trustLabel}
              />
            </div>
            <div className="inline-flex items-baseline gap-3 tabular-nums">
              <span className="text-sm font-semibold text-text-primary">{s.metric.display}</span>
              <span className="text-[11px] text-text-muted">{s.ratioDisplay} of loss</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2 text-[11px]">
        <span className="text-text-muted">Total loss ({losses.unitLabel})</span>
        <span className="tabular-nums font-semibold text-text-primary">{losses.totalDisplay}</span>
      </div>
    </SectionCard>
  );
}

function AssetContextNote({ view }: { view: OeeLossView }) {
  return (
    <SectionCard eyebrow="Scope" title="Line-level, not per-asset">
      <p className="text-xs text-text-secondary">{view.assetContext.note}</p>
      <Link
        href={view.assetContext.assetHref}
        className="mt-2 inline-block text-xs font-medium text-info-text hover:underline"
      >
        {view.assetContext.assetName} · {view.assetContext.tag} →
      </Link>
    </SectionCard>
  );
}

function OeeEvidenceLineage({ rows }: { rows: readonly EvidenceLineageRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-text-secondary">
        Evidence lineage · OEE &amp; loss tree
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
                  {r.evidenceIds.length > 0 ? `${r.evidenceIds.length} record(s)` : "—"}
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

export function OeeLossWorkspace({ view }: { view: OeeLossView }) {
  return (
    <div className="space-y-4">
      <OeeHeader view={view} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <OeeComponentGrid view={view} />
          <LossSplit losses={view.losses} />
        </div>
        <div className="space-y-4">
          <AssetContextNote view={view} />
        </div>
      </div>
      <OeeEvidenceLineage rows={view.evidenceLineage} />
    </div>
  );
}
