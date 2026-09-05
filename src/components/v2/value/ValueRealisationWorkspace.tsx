import Link from "next/link";
import { cn } from "@/lib/cn";
import { SectionCard, TrustFreshnessPill } from "@/components/v2/reliability/primitives";
import type {
  EvidenceLineageRowView,
  GovernedMetricView,
  OutstandingOutcomeRowView,
  SourceFactView,
  SourceProvenanceRowView,
  ValueRealisationView,
} from "@/v2/value/view-types";

/**
 * September 9 Value Realisation experience — pure presentation.
 *
 * Every figure arrives resolved on the view model; these components compute
 * nothing and import no server module. Four financial concepts are kept
 * strictly separate and separately labelled. A governed-envelope value and a
 * source fact are drawn distinctly: the governed value carries a trust/freshness
 * pill; a source fact carries an explicit "Sourced record — no calculation
 * envelope" tag and its source identity. Realised value is shown as an explicit
 * "not yet available" statement, never as $0.
 */

/** A governed-envelope figure — decision exposure. Distinctly tagged. */
function GovernedFigure({ metric }: { metric: GovernedMetricView }) {
  return (
    <div className="rounded-md border border-info-border bg-info-subtle px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {metric.label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
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
      <div className="mt-1 text-[11px] text-text-muted">
        Governed calculation envelope · calculation identity in evidence lineage
      </div>
      <div className="mt-0.5 text-[11px] text-text-secondary">
        Decision exposure is the governed business figure; it is a distinct
        measure from Portfolio value at stake.
      </div>
    </div>
  );
}

/** A repository/port source fact — distinctly tagged, never dressed as governed. */
function SourceFigure({ fact, emphasis = false }: { fact: SourceFactView; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-3",
        emphasis ? "border-border bg-elevated" : "border-border bg-surface",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {fact.label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          fact.available ? "text-text-primary" : "text-text-muted",
        )}
      >
        {fact.display}
      </div>
      <div className="mt-1 text-[11px] text-text-secondary">{fact.qualifier}</div>
      {!fact.available && fact.unavailableReason ? (
        <div className="mt-1 text-[11px] font-medium text-attention-text">
          {fact.unavailableReason}
        </div>
      ) : null}
      <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-text-muted">
        <span className="h-1.5 w-1.5 rounded-none bg-border-strong" aria-hidden />
        Sourced record — no calculation envelope
      </div>
      <div className="text-[11px] text-text-muted">{fact.sourceIdentity}</div>
    </div>
  );
}

function ValueHeader() {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Value realisation · Portfolio
      </div>
      <h2 className="text-base font-semibold text-text-primary">
        Four distinct value concepts, kept separate
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-text-secondary">
        Decision exposure, value at stake, projected value enabled and realised
        value are different measures and are never merged into a single number.
      </p>
    </div>
  );
}

function OutstandingTable({
  rows,
  scopeNote,
  count,
}: {
  rows: readonly OutstandingOutcomeRowView[];
  scopeNote: string;
  count: number;
}) {
  if (rows.length === 0) return null;
  return (
    <SectionCard
      eyebrow="AI recommendations"
      title={`Recommendations and projected value enabled · ${count}`}
    >
      <p className="mb-2 text-[11px] text-text-secondary">{scopeNote}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-text-muted">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 font-medium">Recommendation</th>
              <th className="px-2 py-1.5 font-medium">Projected value enabled</th>
              <th className="px-2 py-1.5 font-medium">Recommendation status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-2 py-1.5 font-medium text-text-primary">{r.description}</td>
                <td className="px-2 py-1.5 tabular-nums text-text-secondary">{r.projectedDisplay}</td>
                <td className="px-2 py-1.5 text-text-secondary">{r.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ValueEvidenceLineage({
  rows,
  provenance,
}: {
  rows: readonly EvidenceLineageRowView[];
  provenance: readonly SourceProvenanceRowView[];
}) {
  if (rows.length === 0 && provenance.length === 0) return null;
  return (
    <details className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-text-secondary">
        Evidence lineage &amp; source provenance
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        {rows.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Governed decision exposure · calculation identity
            </div>
            <div className="overflow-x-auto">
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
            <p className="mt-1 text-[11px] text-text-muted">
              The formula identifier above is calculation provenance for Decision
              exposure — not a token-economics metric and not the definition of
              Portfolio value at stake.
            </p>
          </div>
        ) : null}
        {provenance.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Source-fact provenance
            </div>
            <table className="w-full text-left text-xs">
              <thead className="text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 font-medium">Figure</th>
                  <th className="px-2 py-1.5 font-medium">Technical source</th>
                  <th className="px-2 py-1.5 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {provenance.map((p) => (
                  <tr key={p.key} className="border-b border-border">
                    <td className="px-2 py-1.5 font-medium text-text-primary">{p.label}</td>
                    <td className="px-2 py-1.5 text-text-muted">{p.provenanceIdentity}</td>
                    <td className="px-2 py-1.5 tabular-nums text-text-muted">{p.recordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-text-muted">
              These identities are data provenance only. Return-on-Token-Spend
              ratios and AI token economics are governed in the AI Control Tower,
              not presented here.
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ValueRealisationWorkspace({ view }: { view: ValueRealisationView }) {
  return (
    <div className="space-y-4">
      <ValueHeader />

      <SectionCard
        eyebrow="Four value concepts"
        title="Exposure, stake, projected and realised — each labelled distinctly"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <GovernedFigure metric={view.decisionExposure} />
          <SourceFigure fact={view.valueAtStake} />
          <SourceFigure fact={view.portfolioProjected} />
          <SourceFigure fact={view.realised} emphasis />
        </div>
        <p className="mt-3 rounded-md border border-attention-border bg-attention-subtle px-3 py-2 text-[11px] text-attention-text">
          {view.realisedNotice}
        </p>
        <p className="mt-2 text-[11px] text-text-muted">{view.conditionalNotice}</p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <OutstandingTable
            rows={view.outstandingRows}
            scopeNote={view.recommendationScopeNote}
            count={view.recommendationCount}
          />
        </div>
        <div className="space-y-4">
          <SectionCard eyebrow="K-201" title="Projected value enabled by the K-201 intervention">
            <SourceFigure fact={view.k201Projected} />
            <Link
              href="/v2/assets/K-201"
              className="mt-2 inline-block text-xs font-medium text-info-text hover:underline"
            >
              K-201 Asset 360 →
            </Link>
          </SectionCard>
          <SectionCard
            eyebrow="Decision throughput"
            title="Decisions and outcomes — separate populations"
          >
            <dl className="space-y-2 text-xs">
              <CountRow fact={view.decisionsSupported} />
              <CountRow fact={view.validatedOutcomes} />
              <CountRow fact={view.outstandingValidation} />
            </dl>
            <p className="mt-2 border-t border-border pt-2 text-[11px] text-text-secondary">
              {view.throughputScopeNote}
            </p>
          </SectionCard>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">{view.scopeNotice}</p>
      <ValueEvidenceLineage rows={view.evidenceLineage} provenance={view.sourceProvenance} />
    </div>
  );
}

function CountRow({ fact }: { fact: SourceFactView }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-muted">{fact.label}</dt>
      <dd className="text-right font-semibold tabular-nums text-text-primary">{fact.display}</dd>
    </div>
  );
}
