import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  formatUtcDate,
  formatUtcInstant,
  type AssetReliabilityView,
  type AuthorityActorView,
  type EvidenceLineageRowView,
  type LifecycleProjectionEntryView,
  type SignalNarrativeView,
  type WorkReadinessView,
} from "@/v2/reliability/view-types";
import { GovernedMetricCell, SectionCard, TrustFreshnessPill } from "./primitives";
import {
  ConditionRiskStrip,
  Disclosure,
  LifecycleStepper,
  OperationalHorizonTimeline,
  SensorTrendChart,
} from "./visuals";

/**
 * September 6–7 Reliability experience — Asset 360 + Assessment & Decision.
 *
 * A single depth-first journey for one asset: signal → assessment → evidence →
 * recommendation → decision → audit. Every governed number arrives already
 * resolved on `view`; this component renders but never computes. The decision
 * area is strictly read-only: it states the next permitted governed act and who
 * may take it, and offers NO mutation control.
 */
export function AssetReliabilityExperience({ view }: { view: AssetReliabilityView }) {
  return (
    <div className="space-y-4">
      <ExperienceHeader view={view} />

      <ConditionRiskStrip metrics={view.assessmentMetrics} oee={view.oee} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SignalSection signal={view.signal} />
          <HorizonSection view={view} />
          <RecommendationSection view={view} />
        </div>
        <div className="space-y-4">
          <AuthoritySection view={view} />
          <ReadinessSection view={view} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LifecycleSection entries={view.lifecycleProjection} />
        <AuditSection view={view} />
      </div>

      <AssessmentDetailDisclosure view={view} />
      <LineageSection rows={view.evidenceLineage} />
    </div>
  );
}

function ExperienceHeader({ view }: { view: AssetReliabilityView }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Asset 360 · Reliability assessment
        </div>
        <h2 className="text-base font-semibold text-text-primary">
          {view.assetName} <span className="text-text-muted">· {view.tag}</span>
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge label={view.authority.decisionStatusLabel} tone="attention" />
        <span className="text-[11px] text-text-muted tabular-nums">
          Assessment evaluated {formatUtcInstant(view.evaluatedAt)}
        </span>
      </div>
    </div>
  );
}

function AssessmentDetailDisclosure({ view }: { view: AssetReliabilityView }) {
  return (
    <Disclosure
      summary="Assessment detail · OEE breakdown, evaluation context and formula identity"
    >
      <div className="rounded-md border border-dashed border-border bg-elevated px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {view.assessmentContext.label}
          </span>
          <span className="text-sm font-semibold tabular-nums text-text-primary">
            {view.assessmentContext.display}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-text-muted">{view.assessmentContext.note}</p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Overall equipment effectiveness
          </span>
          <TrustFreshnessPill
            freshness={view.oee.freshness}
            freshnessLabel={view.oee.freshnessLabel}
            trustLabel={view.oee.trustLabel}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <GovernedMetricCell metric={view.oee} />
          {view.oeeBreakdown.map((m) => (
            <GovernedMetricCell key={m.key} metric={m} />
          ))}
        </div>
      </div>
    </Disclosure>
  );
}

function HorizonSection({ view }: { view: AssetReliabilityView }) {
  return (
    <SectionCard
      eyebrow="Operational horizon"
      title="Failure horizon vs lead time vs turnaround"
      aside={view.horizon.available ? "Governed horizons" : "Unavailable"}
    >
      <OperationalHorizonTimeline horizon={view.horizon} />
    </SectionCard>
  );
}

function SignalSection({ signal }: { signal: SignalNarrativeView }) {
  return (
    <SectionCard eyebrow="Signal & deterioration" title={signal.headline}>
      <p className="text-sm text-text-secondary">{signal.detail}</p>

      {signal.sensors.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {signal.sensors.map((s) => (
            <SensorTrendChart key={s.key} sensor={s} />
          ))}
        </div>
      ) : null}

      {signal.conditionEvents.length > 0 ? (
        <ol className="mt-3 space-y-2 border-l border-border pl-3">
          {signal.conditionEvents.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative">
              <span
                className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-attention"
                aria-hidden
              />
              <div className="text-xs font-medium text-text-primary">{e.label}</div>
              <div className="text-[11px] text-text-muted">
                <span className="tabular-nums">{formatUtcInstant(e.at)}</span> · {e.detail}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </SectionCard>
  );
}

function RecommendationSection({ view }: { view: AssetReliabilityView }) {
  const rec = view.recommendation;
  return (
    <SectionCard eyebrow="Recommendation" title="Proposed intervention" aside={rec.statusLabel}>
      {rec.available ? (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-text-primary">{rec.title}</div>
          <p className="text-sm text-text-secondary">{rec.summary}</p>
          {rec.interventionType ? (
            <div className="text-[11px] text-text-muted">
              Intervention type · {rec.interventionType}
            </div>
          ) : null}
        </div>
      ) : (
        <HonestEmpty
          title="No recommendation yet"
          detail="No governed recommendation is available for this asset."
        />
      )}
    </SectionCard>
  );
}

function AuthoritySection({ view }: { view: AssetReliabilityView }) {
  const a = view.authority;
  return (
    <SectionCard
      eyebrow="Assessment & decision"
      title="Governed decision"
      aside={a.phaseLabel}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-elevated px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Decision status</span>
            <span className="text-xs font-semibold text-text-primary">
              {a.decisionStatusLabel}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-text-muted">Next governed action</span>
            <span className="text-xs font-semibold text-text-primary">{a.nextActLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-text-muted">Responsible</span>
            <span className="text-xs font-semibold text-text-primary">
              {a.nextActPersonaName}
            </span>
          </div>
        </div>

        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            a.endorsementRequired
              ? "border-attention-border bg-attention-subtle text-attention-text"
              : "border-border bg-elevated text-text-secondary",
          )}
        >
          <span className="font-semibold">Endorsement:</span> {a.endorsementBanner}
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-elevated text-text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Persona</th>
                <th className="px-3 py-1.5 font-medium">Owns</th>
                <th className="px-3 py-1.5 font-medium">Standing</th>
              </tr>
            </thead>
            <tbody>
              {a.actors.map((actor) => (
                <ActorRow key={actor.personaId} actor={actor} />
              ))}
            </tbody>
          </table>
        </div>

        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            a.viewer.canActOnNext
              ? "border-healthy-border bg-healthy-subtle text-healthy-text"
              : "border-border bg-elevated text-text-secondary",
          )}
        >
          <span className="font-semibold">You ({a.viewer.displayName}):</span> {a.viewer.reason}
        </div>

        <p className="text-[11px] text-text-muted">{a.readOnlyNotice}</p>
      </div>
    </SectionCard>
  );
}

function ActorRow({ actor }: { actor: AuthorityActorView }) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-1.5">
        <div className="font-medium text-text-primary">{actor.displayName}</div>
        <div className="text-[11px] text-text-muted">{actor.role}</div>
      </td>
      <td className="px-3 py-1.5 text-text-secondary">{actor.actLabel}</td>
      <td className="px-3 py-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1",
            actor.eligibleNow ? "text-healthy-text" : "text-text-muted",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5",
              actor.eligibleNow ? "rounded-full bg-healthy" : "rounded-sm bg-border-strong",
            )}
            aria-hidden
          />
          {actor.standing}
        </span>
      </td>
    </tr>
  );
}

function ReadinessSection({ view }: { view: AssetReliabilityView }) {
  return (
    <SectionCard eyebrow="Execution readiness" title="Materials & turnaround fit">
      <div className="space-y-3">
        {view.workReadiness.map((wr) => (
          <ReadinessRow key={wr.workOrderId} wr={wr} />
        ))}
        <div className="text-[11px] text-text-muted tabular-nums">
          Work readiness evaluated{" "}
          {formatUtcInstant(view.workReadiness[0]?.evaluatedAt ?? null)}
        </div>

        <div className="rounded-md border border-border bg-elevated px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">Turnaround fit</span>
            {view.turnaround.available ? (
              <span className="text-xs font-semibold text-text-primary">
                {view.turnaround.fitDisplay}
              </span>
            ) : (
              <span className="text-xs text-text-muted">Unavailable</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-text-muted tabular-nums">
            Turnaround fit evaluated {formatUtcInstant(view.turnaround.evaluatedAt)}
          </div>
          {view.turnaround.available ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {view.turnaround.metrics.map((m) => (
                  <GovernedMetricCell key={m.key} metric={m} />
                ))}
              </div>
              {view.turnaround.availableDate ? (
                <div className="mt-2 text-[11px] text-text-muted">
                  Earliest available date · {formatUtcDate(view.turnaround.availableDate)}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-[11px] text-text-muted">
              No governed turnaround fit is available for this asset.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function ReadinessRow({ wr }: { wr: WorkReadinessView }) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-primary">Work order {wr.workOrderId}</span>
        <TrustFreshnessPill
          freshness={wr.freshness}
          freshnessLabel={wr.freshnessLabel}
          trustLabel="Deterministic calculation"
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-text-muted">Materials</span>
        <span className="font-semibold text-text-primary">{wr.materialsDisplay}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs">
        <span className="text-text-muted">Buffer</span>
        <span className="font-semibold tabular-nums text-text-primary">{wr.bufferDisplay}</span>
      </div>
    </div>
  );
}

function LifecycleSection({
  entries,
}: {
  entries: readonly LifecycleProjectionEntryView[];
}) {
  return (
    <SectionCard
      eyebrow="Governed lifecycle projection"
      title="Signal to proposed decision"
      aside="Derived from existing seeded evidence"
    >
      <LifecycleStepper entries={entries} pendingLabel="Reliability Manager decision" />
    </SectionCard>
  );
}

function AuditSection({ view }: { view: AssetReliabilityView }) {
  const audit = view.decisionAudit;
  return (
    <SectionCard eyebrow="Decision audit" title="What changed">
      {audit.entries.length > 0 ? (
        <ol className="space-y-2">
          {audit.entries.map((e) => (
            <li key={e.auditId} className="rounded-md border border-border bg-elevated px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">{e.action}</span>
                <span className="text-[11px] text-text-muted tabular-nums">{formatUtcInstant(e.at)}</span>
              </div>
              <div className="text-[11px] text-text-muted">
                {e.actorLabel} · {e.summary}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <HonestEmpty title={audit.emptyTitle} detail={audit.emptyDescription} />
      )}
      <div className="mt-3 rounded-md border border-dashed border-border bg-elevated px-3 py-2 text-[11px] text-text-secondary">
        <span className="font-semibold text-text-primary">Next governed action:</span>{" "}
        {audit.nextGovernedAction}
      </div>
    </SectionCard>
  );
}

function LineageSection({ rows }: { rows: readonly EvidenceLineageRowView[] }) {
  return (
    <Disclosure summary="Evidence lineage · source records & calculation identity for every governed value">
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
                  {r.evidenceIds.length > 0 ? r.evidenceIds.join(", ") : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-text-muted">{formatUtcInstant(r.asOf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Disclosure>
  );
}

function HonestEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-elevated px-3 py-4 text-center">
      <div className="text-xs font-medium text-text-secondary">{title}</div>
      <p className="mt-1 text-[11px] text-text-muted">{detail}</p>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "attention" | "healthy" | "critical" | "neutral";
}): ReactNode {
  const toneClass = {
    attention: "border-attention-border bg-attention-subtle text-attention-text",
    healthy: "border-healthy-border bg-healthy-subtle text-healthy-text",
    critical: "border-critical-border bg-critical-subtle text-critical-text",
    neutral: "border-border bg-elevated text-text-secondary",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}
