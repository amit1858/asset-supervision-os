import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { buildPersonaBrief } from "@/brief/service";
import { QueueSection, ApprovalQueue, WorkQueue } from "@/components/ui/queues";
import { EquipmentId, CriticalityBadge, AssetStatusBadge } from "@/components/ui/Badge";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { fmtCurrency, fmtDate, fmtPercent } from "@/lib/format";

export default function PlantOverviewPage() {
  const cc = getRepository().getCommandCenter();
  const db = getDataset();
  const assetById = new Map(db.assets.map((a) => [a.id, a]));

  const readinessVals = Object.values(cc.turnaround.readiness);
  const readyChecks = readinessVals.reduce((s, v) => s + v.ready, 0);
  const totalChecks = readinessVals.reduce((s, v) => s + v.total, 0);

  const approvals = cc.pendingApprovals.map((r) => {
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

  const attentionRows = cc.attentionAssets.map((s) => ({
    id: s.asset.id,
    ref: <EquipmentId tag={s.asset.tag} size="sm" />,
    primary: s.asset.name,
    secondary: (
      <span className="inline-flex items-center gap-1.5">
        <CriticalityBadge level={s.asset.criticality} size="sm" />
        <AssetStatusBadge status={s.asset.operationalStatus} size="sm" />
      </span>
    ),
    trailing: s.riskScore !== null ? <span className="tabular-nums text-sm font-semibold text-critical-text">Risk {s.riskScore}</span> : null,
    href: `/assets/${s.asset.tag}`,
  }));

  return (
    <AppShell crumbs={[{ label: "Leadership" }, { label: "Plant Overview" }]}>
      <LandingLayout
        personaId="plant_manager"
        title="Plant Executive Overview"
        brief={buildPersonaBrief("plant_manager")}
        kpis={[
          { label: "Plant OEE (30-day)", value: fmtPercent(cc.oee.oee, 1), emphasis: "default" },
          { label: "Value at stake", value: fmtCurrency(cc.activeExposureUsd, "USD", true), emphasis: "critical", hint: "unresolved decisions" },
          { label: "Turnaround readiness", value: `${readyChecks}/${totalChecks}`, hint: `${Math.round((readyChecks / totalChecks) * 100)}% checks` },
          { label: "Assets in critical condition", value: cc.counts.critical, emphasis: cc.counts.critical > 0 ? "critical" : "healthy" },
          { label: "Requiring attention", value: cc.counts.requiringAttention, emphasis: "attention" },
          { label: "Pending decisions", value: cc.counts.pendingDecisions },
        ]}
      >
        <QueueSection title="Awaiting your authority" count={approvals.length} description="High-value decisions escalated for Plant Manager approval.">
          <ApprovalQueue items={approvals} empty="No decisions awaiting your authority." />
        </QueueSection>
        <WorkQueue title="Assets requiring attention" rows={attentionRows} description="Site-wide assets in critical or attention status." empty="No assets require attention." />
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
          Drill into the{" "}
          <Link href="/reliability" className="font-medium text-brand-text hover:underline">Reliability Command Center</Link>,{" "}
          <Link href="/oee" className="font-medium text-brand-text hover:underline">OEE Loss Intelligence</Link>, or{" "}
          <Link href="/turnaround" className="font-medium text-brand-text hover:underline">Turnaround Control Tower</Link>.
        </div>
      </LandingLayout>
    </AppShell>
  );
}
