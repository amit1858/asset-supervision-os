import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { EnterprisePageHeader, SummaryStrip } from "@/components/ui/enterprise";
import { MyBrief } from "@/components/brief/MyBrief";
import { buildPersonaBrief } from "@/brief/service";
import { WorkQueue, ApprovalQueue, ExceptionPanel, QueueSection } from "@/components/ui/queues";
import { OEEGauge } from "@/components/ui/Indicators";
import { EquipmentId, CriticalityBadge, AssetStatusBadge, DispositionBadge } from "@/components/ui/Badge";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { fmtCurrency, fmtDate, fmtDays, fmtNumber, fmtPercent } from "@/lib/format";

export default function ReliabilityCommandCenter() {
  const repo = getRepository();
  const cc = repo.getCommandCenter();
  const db = getDataset();
  const assetById = new Map(db.assets.map((a) => [a.id, a]));

  const approvalItems = cc.pendingApprovals.map((r) => {
    const asset = assetById.get(r.assetId);
    return {
      id: r.id,
      ref: asset ? <EquipmentId tag={asset.tag} size="sm" /> : undefined,
      title: r.title,
      owner: r.decisionOwner,
      due: r.dueBy ? fmtDate(r.dueBy) : undefined,
      valueLabel: `${fmtCurrency(r.valueAtStakeUsd, r.currency, true)} at stake`,
      href: asset ? `/assets/${asset.tag}` : undefined,
    };
  });

  const riskRows = cc.attentionAssets.map((s) => ({
    id: s.asset.id,
    ref: <EquipmentId tag={s.asset.tag} size="sm" />,
    primary: s.asset.name,
    secondary: (
      <span className="inline-flex items-center gap-1.5">
        <CriticalityBadge level={s.asset.criticality} size="sm" />
        <AssetStatusBadge status={s.asset.operationalStatus} size="sm" />
      </span>
    ),
    trailing: (
      <>
        {s.riskScore !== null ? (
          <span className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-text-muted">Risk</span>
            <span className="tabular-nums text-sm font-semibold text-critical-text">{s.riskScore}</span>
          </span>
        ) : null}
        {s.openRecommendation ? <DispositionBadge disposition={s.openRecommendation.disposition} size="sm" /> : null}
      </>
    ),
    href: `/assets/${s.asset.tag}`,
  }));

  const monitoredRows = cc.monitoredAssets.map((s) => ({
    id: s.asset.id,
    ref: <EquipmentId tag={s.asset.tag} size="sm" />,
    primary: s.asset.name,
    secondary: <CriticalityBadge level={s.asset.criticality} size="sm" />,
    trailing: <AssetStatusBadge status={s.asset.operationalStatus} size="sm" />,
    href: `/assets/${s.asset.tag}`,
  }));

  // Maintenance execution readiness (real data).
  const openWorkOrders = db.workOrders.filter((w) => w.status !== "completed" && w.status !== "cancelled");
  const constrainedSpares = db.inventoryBalances.filter((b) => b.onHandQty - b.reservedQty <= 0);

  // Emerging turnaround candidates (work packages raised from condition events).
  const candidateExceptions = db.turnaroundWorkPackages
    .filter((w) => w.originatingConditionEventId !== null)
    .map((w) => ({
      id: w.id,
      severity: "attention" as const,
      label: `${w.code} — ${w.title}`,
      detail: `From condition event · materials ${w.readiness.materials.replace(/_/g, " ")}`,
      trailing: (
        <Link href="/turnaround-candidates" className="text-xs font-medium text-brand-text hover:underline">
          View
        </Link>
      ),
    }));

  const materialExceptions = constrainedSpares.map((b) => {
    const part = db.spareParts.find((p) => p.id === b.sparePartId);
    return {
      id: b.id,
      severity: "critical" as const,
      label: `${part?.partNumber ?? b.sparePartId} not in stock`,
      detail: `${part?.description ?? ""} · ${part?.leadTimeDays ?? "?"}-day lead time`,
    };
  });

  return (
    <AppShell crumbs={[{ label: "Reliability" }, { label: "Command Center" }]}>
      <EnterprisePageHeader
        eyebrow="Reliability Manager · reliability"
        title="Reliability Command Center"
        description="Decisions requiring attention, time-critical asset risks, execution readiness, and production impact for the unit."
        meta={
          <>
            <span>{cc.plantName}</span>
            <span>As of {fmtDate(cc.generatedAt)}</span>
          </>
        }
      />

      <div className="mx-auto w-full max-w-content px-6 py-6">
        <div className="mb-6">
          <MyBrief brief={buildPersonaBrief("reliability_manager")} />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My Workspace</h2>

        {/* Reconciling counts */}
        <div className="mb-6">
          <SummaryStrip
            items={[
              { label: "Under supervision", value: cc.counts.underSupervision, hint: "assets" },
              { label: "Requiring attention", value: cc.counts.requiringAttention, hint: `${cc.counts.critical} critical · ${cc.counts.attention} attention`, emphasis: cc.counts.requiringAttention > 0 ? "attention" : "default" },
              { label: "Monitored", value: cc.counts.monitored, hint: "watch only" },
              { label: "In maintenance", value: cc.counts.inMaintenance, hint: "planned work" },
              { label: "Open recommendations", value: cc.counts.openRecommendations, hint: `${cc.counts.pendingDecisions} pending decision` },
              { label: "Value at stake", value: fmtCurrency(cc.activeExposureUsd, "USD", true), hint: "unresolved · plant", emphasis: "critical" },
            ]}
          />
          <p className="mt-1.5 text-[11px] text-text-muted">
            Counts reconcile: requiring attention = critical + attention; under supervision = all
            monitored assets across every status.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* 1. Decisions requiring attention */}
            <QueueSection
              title="Decisions requiring attention"
              count={approvalItems.length}
              description="Recommendations awaiting a human decision. Approvals are recorded with the active persona in context."
            >
              <ApprovalQueue items={approvalItems} empty="No decisions pending." />
            </QueueSection>

            {/* 2. Time-critical asset risks */}
            <WorkQueue
              title="Time-critical asset risks"
              rows={riskRows}
              description="Assets whose status requires attention, ranked by deterministic risk."
              empty="No assets currently require attention."
            />

            {/* 4. Production & OEE impact */}
            <QueueSection title="Production & OEE impact" actions={<Link href="/oee" className="text-xs font-medium text-brand-text hover:underline">OEE Loss Intelligence →</Link>}>
              <div className="p-4">
                <OEEGauge oee={cc.oee.oee} availability={cc.oee.availability} performance={cc.oee.performance} quality={cc.oee.quality} compact />
                <p className="mt-3 text-xs text-text-muted">
                  Largest loss: {cc.topLoss.category} — {fmtNumber(cc.topLoss.units)} bbl. Unit OEE{" "}
                  {fmtPercent(cc.oee.oee, 1)}.
                </p>
              </div>
            </QueueSection>

            {/* 6. Monitored asset portfolio */}
            <WorkQueue
              title="Monitored asset portfolio"
              rows={monitoredRows}
              description="Assets under monitoring with no action required yet."
              empty="No monitored assets."
            />
          </div>

          <div className="space-y-6">
            {/* 3. Maintenance execution readiness */}
            <QueueSection title="Maintenance execution readiness">
              <div className="space-y-2 p-4 text-sm">
                <Row label="Open work orders" value={openWorkOrders.length} />
                <Row label="Parts-constrained" value={constrainedSpares.length} tone={constrainedSpares.length > 0 ? "critical" : "default"} />
                <Row label="Turnaround-linked" value={db.turnaroundWorkPackages.filter((w) => w.originatingConditionEventId).length} />
                <Link href="/planning" className="mt-1 inline-block text-xs font-medium text-brand-text hover:underline">
                  Open Planning Workbench →
                </Link>
              </div>
            </QueueSection>

            {/* Material exceptions */}
            <QueueSection title="Material exceptions" count={materialExceptions.length}>
              <ExceptionPanel items={materialExceptions} empty="No material exceptions." />
            </QueueSection>

            {/* 5. Emerging turnaround candidates */}
            <QueueSection title="Emerging turnaround candidates" count={candidateExceptions.length}>
              <ExceptionPanel items={candidateExceptions} empty="No emerging candidates." />
            </QueueSection>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "critical" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums font-semibold ${tone === "critical" ? "text-critical-text" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
