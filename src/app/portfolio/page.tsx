import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { WorkQueue } from "@/components/ui/queues";
import { EquipmentId, CriticalityBadge, AssetStatusBadge } from "@/components/ui/Badge";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { fmtCurrency } from "@/lib/format";

export default function PortfolioPage() {
  const repo = getRepository();
  const cc = repo.getCommandCenter();
  const db = getDataset();
  const riskByAsset = new Map(
    [...cc.attentionAssets, ...cc.monitoredAssets].map((s) => [s.asset.id, s.riskScore]),
  );

  const rows = [...db.assets]
    .sort((a, b) => rank(a.criticality) - rank(b.criticality))
    .map((a) => {
      const r = riskByAsset.get(a.id);
      return {
        id: a.id,
        ref: <EquipmentId tag={a.tag} size="sm" />,
        primary: a.name,
        secondary: (
          <span className="inline-flex items-center gap-1.5">
            <CriticalityBadge level={a.criticality} size="sm" />
            <AssetStatusBadge status={a.operationalStatus} size="sm" />
            <span className="text-text-muted">{a.assetType}</span>
          </span>
        ),
        trailing: typeof r === "number"
          ? <span className="tabular-nums text-sm font-semibold text-critical-text">Risk {r}</span>
          : <span className="text-xs text-text-muted">—</span>,
        href: `/assets/${a.tag}`,
      };
    });

  return (
    <AppShell crumbs={[{ label: "Reliability" }, { label: "Asset Risk Portfolio" }]}>
      <LandingLayout
        personaId="reliability_manager"
        title="Asset Risk Portfolio"
        kpis={[
          { label: "Assets", value: cc.counts.underSupervision },
          { label: "Requiring attention", value: cc.counts.requiringAttention, emphasis: "attention" },
          { label: "In critical condition", value: cc.counts.critical, emphasis: cc.counts.critical > 0 ? "critical" : "healthy" },
          { label: "Monitored", value: cc.counts.monitored },
          { label: "Open recommendations", value: cc.counts.openRecommendations },
          { label: "Value at stake", value: fmtCurrency(cc.activeExposureUsd, "USD", true), emphasis: "critical" },
        ]}
      >
        <WorkQueue title="Asset portfolio" rows={rows} description="Every supervised asset ranked by criticality classification, with current condition and deterministic risk where a condition model exists." empty="No assets." />
      </LandingLayout>
    </AppShell>
  );
}

function rank(c: string): number {
  return { A: 0, B: 1, C: 2, D: 3, E: 4 }[c as "A"] ?? 5;
}
