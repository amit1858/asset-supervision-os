import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { buildPersonaBrief } from "@/brief/service";
import { WorkQueue } from "@/components/ui/queues";
import { EquipmentId, CriticalityBadge, AssetStatusBadge } from "@/components/ui/Badge";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { fmtDays } from "@/lib/format";

export default function WatchlistPage() {
  const repo = getRepository();
  const cc = repo.getCommandCenter();
  const db = getDataset();

  const riskByAsset = new Map(
    [...cc.attentionAssets, ...cc.monitoredAssets].map((s) => [s.asset.id, s.riskScore]),
  );
  const hero = repo.getAsset360(db.meta.heroAssetTag);
  const projected = hero?.risk?.projectedDaysToCritical ?? null;

  // Watchlist: assets that are not plainly normal, plus the hero asset, ranked.
  const rows = db.assets
    .filter((a) => a.operationalStatus !== "normal" || a.tag === db.meta.heroAssetTag)
    .sort((a, b) => rank(a.criticality) - rank(b.criticality))
    .map((a) => ({
      id: a.id,
      ref: <EquipmentId tag={a.tag} size="sm" />,
      primary: a.name,
      secondary: (
        <span className="inline-flex items-center gap-1.5">
          <CriticalityBadge level={a.criticality} size="sm" />
          <AssetStatusBadge status={a.operationalStatus} size="sm" />
        </span>
      ),
      trailing: (() => {
        const r = riskByAsset.get(a.id);
        return typeof r === "number" ? (
          <span className="tabular-nums text-sm font-semibold text-critical-text">Risk {r}</span>
        ) : (
          <span className="text-xs text-text-muted">no model</span>
        );
      })(),
      href: `/assets/${a.tag}`,
    }));

  return (
    <AppShell crumbs={[{ label: "Reliability" }, { label: "Asset Watchlist" }]}>
      <LandingLayout
        personaId="reliability_engineer"
        title="Asset Watchlist"
        brief={buildPersonaBrief("reliability_engineer")}
        kpis={[
          { label: "Watchlist assets", value: rows.length },
          { label: "Deteriorating trends", value: db.conditionEvents.filter((c) => c.provenance === "statistical" || !c.acknowledged).length, emphasis: "attention" },
          { label: "Nearest time-to-critical", value: fmtDays(projected), emphasis: "attention", hint: "K-201 vibration" },
          { label: "Drafted recommendations", value: db.recommendations.filter((r) => r.status === "open").length },
          { label: "Assets in critical condition", value: cc.counts.critical },
          { label: "Monitored", value: cc.counts.monitored },
        ]}
      >
        <WorkQueue
          title="Watchlist"
          rows={rows}
          description="Assets under active reliability watch. Open Asset 360 for condition trends, technical evidence, and failure-mode investigation."
          empty="No assets on the watchlist."
        />
      </LandingLayout>
    </AppShell>
  );
}

function rank(c: string): number {
  return { A: 0, B: 1, C: 2, D: 3, E: 4 }[c as "A"] ?? 5;
}
