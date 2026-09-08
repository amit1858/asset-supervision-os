import Link from "next/link";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";

const STATUS_LABELS: Record<string, string> = {
  normal: "Normal",
  monitor: "Watch",
  attention: "Attention",
  critical: "Critical",
  maintenance: "Maintenance",
  offline: "Offline",
  planned_outage: "Planned outage",
};

export function AssetRiskPortfolioWorkspace() {
  const repo = getRepository();
  const db = getDataset();
  const command = repo.getCommandCenter();
  const assessed = new Map(
    [...command.attentionAssets, ...command.monitoredAssets].map((item) => [item.asset.id, item]),
  );
  const recommendations = new Map(db.recommendations.map((item) => [item.assetId, item]));
  const rows = db.assets.map((asset) => {
    const summary = assessed.get(asset.id);
    return {
      asset,
      summary,
      recommendation: recommendations.get(asset.id) ?? null,
      unit: db.productionLines.find((line) => line.id === asset.productionLineId),
    };
  });

  return (
    <section data-journey-target="asset-risk-portfolio" aria-label="Asset Risk Portfolio" className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Asset Risk Portfolio</h2>
          <p className="mt-1 text-xs text-text-muted">Eight canonical assets from Gulf Coast Refinery (synthetic) · one HDS-2 operating unit.</p>
        </div>
        <div className="flex gap-2 text-xs text-text-secondary">
          <span className="rounded border border-border px-2 py-1">{rows.length} assets</span>
          <span className="rounded border border-border px-2 py-1">{command.counts.requiringAttention} attention</span>
          <span className="rounded border border-border px-2 py-1">{command.counts.pendingDecisions} open decisions</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-elevated text-[11px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Asset</th>
              <th className="px-4 py-2.5 font-semibold">Unit / class</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Governed assessment</th>
              <th className="px-4 py-2.5 font-semibold">Decision / constraint</th>
              <th className="px-4 py-2.5 font-semibold">Next record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ asset, summary, recommendation, unit }) => (
              <tr key={asset.id} className="hover:bg-elevated">
                <td className="px-4 py-3">
                  <Link href={`/v2/assets/${asset.tag}`} className="font-semibold text-brand-text hover:underline">{asset.tag}</Link>
                  <div className="text-xs text-text-secondary">{asset.name}</div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{unit?.code ?? "Not available"}<div className="text-xs text-text-muted">{asset.assetType}</div></td>
                <td className="px-4 py-3"><span className="rounded border border-border px-2 py-1 text-xs">{STATUS_LABELS[asset.operationalStatus] ?? "Not available"}</span></td>
                <td className="px-4 py-3 text-text-secondary">
                  {summary ? <span className="tabular-nums">Health {summary.healthScore ?? "Not assessed"} · Risk {summary.riskScore ?? "Not assessed"}</span> : <span className="text-text-muted">No governed assessment</span>}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {recommendation ? <><span>{recommendation.status === "open" ? "Open decision" : recommendation.status === "actioned" ? "Actioned · outcome pending" : "Closed"}</span><div className="text-xs text-text-muted">{asset.tag === "K-201" ? "Dry-gas-seal material constraint" : "Source record available"}</div></> : <span className="text-text-muted">No recommendation</span>}
                </td>
                <td className="px-4 py-3"><Link href={`/v2/assets/${asset.tag}`} className="text-xs font-medium text-brand-text hover:underline">Open Asset 360</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-4 py-3 text-xs text-text-muted">Synthetic source disclosure: asset identity and status are seeded records. Health, risk, value and citations are shown only where a governed assessment exists.</div>
    </section>
  );
}
