import Link from "next/link";
import { cn } from "@/lib/cn";
import { SectionCard, TrustFreshnessPill } from "@/components/v2/reliability/primitives";
import { OperationalHorizonTimeline } from "@/components/v2/reliability/visuals";
import type {
  EvidenceLineageRowView,
  InventoryBridgeView,
  MaintenanceMaterialsView,
  MaterialsAccountabilityView,
  MaintenanceSummaryView,
  OperationalHorizonView,
  TurnaroundFitView,
  WorkOrderReadinessRowView,
} from "@/v2/materials/view-types";

/**
 * September 8 Maintenance & Materials experience — pure presentation.
 *
 * Every figure arrives resolved on the view model; these components compute
 * nothing and import no server module. There are NO action controls: no
 * approval, procurement or scheduling button exists here. Readiness and
 * inventory health are shown as distinct dimensions, negatives are always
 * visible, and unavailable is never rendered as zero.
 */

const READINESS_TONE: Record<
  WorkOrderReadinessRowView["readinessKind"],
  { text: string; shape: string; bg: string }
> = {
  ready: { text: "text-healthy-text", shape: "rounded-full bg-healthy", bg: "" },
  blocked: { text: "text-critical-text", shape: "rounded-none bg-critical", bg: "" },
  available_zero: { text: "text-text-secondary", shape: "rounded-sm bg-border-strong", bg: "" },
  missing_evidence: { text: "text-text-secondary", shape: "rounded-sm bg-border-strong", bg: "" },
  not_required: { text: "text-text-muted", shape: "rounded-sm bg-border-strong", bg: "" },
};

export function MaintenanceSummaryHeader({ summary }: { summary: MaintenanceSummaryView }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Maintenance &amp; materials · Work readiness
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            {summary.assetName} <span className="text-text-muted">· {summary.tag}</span>
          </h2>
          {summary.interventionTitle ? (
            <p className="mt-0.5 max-w-2xl text-xs text-text-secondary">
              {summary.interventionTitle}
            </p>
          ) : null}
        </div>
        <Link
          href={summary.assetHref}
          className="shrink-0 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-info-text hover:underline"
        >
          ← Back to Asset 360
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="Work orders" value={String(summary.workOrderCount)} />
        <SummaryStat
          label="Materials-blocked"
          value={String(summary.blockedCount)}
          emphasis={summary.blockedCount > 0}
        />
        <SummaryStat label="Turnaround fit" value={summary.turnaroundFitDisplay} />
        <SummaryStat label="Recommendation" value={summary.recommendationStatusLabel} />
      </dl>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          emphasis ? "text-critical-text" : "text-text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function WorkOrderReadinessMatrix({ rows }: { rows: readonly WorkOrderReadinessRowView[] }) {
  return (
    <SectionCard
      eyebrow="Work-order readiness"
      title="Materials readiness vs inventory health"
      aside="Two distinct dimensions"
    >
      <div className="space-y-3">
        {rows.map((row) => (
          <WorkOrderReadinessCard key={row.workOrderId} row={row} />
        ))}
      </div>
    </SectionCard>
  );
}

function WorkOrderReadinessCard({ row }: { row: WorkOrderReadinessRowView }) {
  const tone = READINESS_TONE[row.readinessKind];
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-text-primary">
            {row.workOrderNumber} <span className="font-normal text-text-muted">· {row.workOrderId}</span>
          </div>
          <div className="text-[11px] text-text-secondary">{row.title}</div>
        </div>
        <TrustFreshnessPill
          freshness={row.freshness}
          freshnessLabel={row.freshnessLabel}
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
            <span className={cn("text-xs font-semibold", tone.text)}>{row.materialsDisplay}</span>
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Inventory health
          </div>
          <div className="mt-0.5 text-xs font-semibold text-text-primary">{row.inventoryDisplay}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        <Quant label="Required" value={row.requiredDisplay} />
        <Quant label="Available" value={row.availableDisplay} />
        <Quant label="Shortage" value={row.shortageDisplay} />
        <Quant label="Buffer" value={row.bufferDisplay} />
      </div>

      <InventoryPositionBridge
        bridge={row.bridge}
        defaultOpen={row.readinessKind === "blocked"}
      />
    </div>
  );
}

function Quant({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-1.5 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

const q = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "Unavailable" : String(value);

/**
 * The inventory-position bridge:
 *   On hand − Reserved − Required − Reorder point = Post-allocation buffer.
 *
 * Legs are governed inventory / calculation facts (negatives visible); the "="
 * result is the governed buffer envelope, never re-derived. The accessible
 * `equationText` restates the same arithmetic for assistive technology.
 */
export function InventoryPositionBridge({
  bridge,
  defaultOpen = false,
}: {
  bridge: InventoryBridgeView;
  defaultOpen?: boolean;
}) {
  if (bridge.legs.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-border bg-surface px-2.5 py-2 text-[11px] text-text-secondary">
        Inventory evidence unavailable — no governed inventory balance is on record for this work
        order.
      </div>
    );
  }
  const negative = (bridge.buffer.rawValue ?? 0) < 0;
  return (
    <details open={defaultOpen} className="mt-2 rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium text-text-secondary">
        Inventory position bridge
      </summary>
      <div className="border-t border-border px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Leg label="On hand" value={q(bridge.onHandTotal)} />
          <Op>−</Op>
          <Leg label="Reserved" value={q(bridge.reservedTotal)} />
          <Op>−</Op>
          <Leg label="Required" value={bridge.required.display} />
          <Op>−</Op>
          <Leg label="Reorder point" value={q(bridge.reorderPointTotal)} />
          <Op>=</Op>
          <span
            className={cn(
              "inline-flex flex-col items-center rounded-md border px-2 py-1 tabular-nums",
              negative
                ? "border-critical-border bg-critical-subtle text-critical-text"
                : "border-border bg-elevated text-text-primary",
            )}
          >
            <span className="text-[9px] font-medium uppercase tracking-wide">Buffer</span>
            <span className="text-sm font-semibold">{bridge.buffer.display}</span>
          </span>
        </div>
        <p className="sr-only">{bridge.equationText}</p>
        {bridge.legs.length > 0 ? (
          <div className="mt-1.5 text-[10px] text-text-muted">
            {bridge.legs.map((l) => l.partLabel).join(" · ")}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Leg({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col items-center rounded-md border border-border bg-elevated px-2 py-1 tabular-nums">
      <span className="text-[9px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
    </span>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span className="text-sm font-semibold text-text-muted" aria-hidden>
      {children}
    </span>
  );
}

export function SpareTurnaroundHorizon({
  turnaround,
  horizon,
}: {
  turnaround: TurnaroundFitView;
  horizon: OperationalHorizonView;
}) {
  return (
    <SectionCard
      eyebrow="Spare &amp; turnaround horizon"
      title="Failure horizon vs lead time vs turnaround"
      aside={turnaround.available ? turnaround.fitDisplay : "Unavailable"}
    >
      <OperationalHorizonTimeline horizon={horizon} />
      {turnaround.available && turnaround.availableDate ? (
        <div className="mt-2 text-[11px] text-text-muted">
          Earliest spare availability · <span className="tabular-nums">{turnaround.availableDate}</span>
        </div>
      ) : null}
    </SectionCard>
  );
}

/**
 * Read-only human accountability. States the next governed act, who owns it and
 * the endorsement condition — and offers NO control that would take that act.
 */
export function MaterialsAccountabilityCard({
  accountability,
}: {
  accountability: MaterialsAccountabilityView;
}) {
  return (
    <SectionCard eyebrow="Human accountability" title="Who owns the next decision">
      <dl className="space-y-2 text-xs">
        <Row label="Decision status" value={accountability.decisionStatusLabel} />
        <Row label="Next governed action" value={accountability.nextActLabel} />
        <Row label="Responsible" value={accountability.nextActPersonaName} />
        <Row
          label="Endorsement"
          value={
            accountability.endorsementRequired
              ? "Plant Manager endorsement required after Reliability Manager approval"
              : "No separate endorsement required"
          }
        />
      </dl>
      {accountability.noDecisionRecorded ? (
        <div className="mt-3 rounded-md border border-dashed border-border bg-elevated px-3 py-2 text-[11px] text-text-secondary">
          No governed human decision has been recorded yet. This screen is read-only.
        </div>
      ) : null}
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

export function MaterialsEvidenceLineage({ rows }: { rows: readonly EvidenceLineageRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-text-secondary">
        Evidence lineage · materials &amp; turnaround
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

export function MaintenanceMaterialsWorkspace({ view }: { view: MaintenanceMaterialsView }) {
  return (
    <div className="space-y-4">
      <MaintenanceSummaryHeader summary={view.summary} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <WorkOrderReadinessMatrix rows={view.workOrders} />
          <SpareTurnaroundHorizon turnaround={view.turnaround} horizon={view.horizon} />
        </div>
        <div className="space-y-4">
          <MaterialsAccountabilityCard accountability={view.accountability} />
        </div>
      </div>
      <MaterialsEvidenceLineage rows={view.evidenceLineage} />
    </div>
  );
}
