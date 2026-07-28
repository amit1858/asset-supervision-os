import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { buildPersonaBrief } from "@/brief/service";
import { WorkQueue, ExceptionPanel, QueueSection } from "@/components/ui/queues";
import { RestrictedAction } from "@/components/ui/CapabilityGate";
import { AssetThreadNotice } from "@/components/landing/AssetThreadNotice";
import { getDataset } from "@/data/seed";
import { fmtCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function MaterialsPage({ searchParams }: { searchParams: { asset?: string } }) {
  const db = getDataset();
  const focusTag = searchParams.asset ?? null;
  const focusAsset = focusTag ? db.assets.find((a) => a.tag === focusTag) : undefined;

  const balanceByPart = new Map(db.inventoryBalances.map((b) => [b.sparePartId, b]));

  const blocked = db.spareParts
    .map((p) => ({ part: p, bal: balanceByPart.get(p.id) }))
    .filter(({ bal }) => bal && bal.onHandQty - bal.reservedQty <= 0);

  const belowReorder = db.inventoryBalances
    .filter((b) => b.onHandQty <= b.reorderPoint)
    .map((b) => {
      const part = db.spareParts.find((p) => p.id === b.sparePartId);
      return {
        id: b.id,
        severity: (b.onHandQty === 0 ? "critical" : "attention") as "critical" | "attention",
        label: `${part?.partNumber ?? b.sparePartId} — ${b.onHandQty} on hand (reorder ${b.reorderPoint})`,
        detail: `${part?.description ?? ""} · ${part?.leadTimeDays ?? "?"}-day lead${part?.criticalSpare ? " · critical spare" : ""}`,
        trailing: (
          <RestrictedAction capability="expedite_material">
            <button className="rounded border border-border-strong px-2 py-0.5 text-xs font-medium hover:bg-elevated">Expedite</button>
          </RestrictedAction>
        ),
      };
    });

  const spareRows = db.spareParts.map((p) => {
    const bal = balanceByPart.get(p.id);
    const avail = (bal?.onHandQty ?? 0) - (bal?.reservedQty ?? 0);
    return {
      id: p.id,
      ref: <span className="equipment-id text-xs">{p.partNumber}</span>,
      primary: p.description,
      secondary: `${p.category} · ${p.leadTimeDays}-day lead · ${fmtCurrency(p.unitCost, p.currency, true)}`,
      trailing: (
        <span className={`tabular-nums text-sm font-semibold ${avail > 0 ? "text-healthy-text" : "text-critical-text"}`}>
          {avail > 0 ? `${avail} in stock` : "Not in stock"}
        </span>
      ),
    };
  });

  const longestLead = Math.max(0, ...db.spareParts.map((p) => p.leadTimeDays));

  return (
    <AppShell crumbs={[{ label: "Materials" }, { label: "Material Exceptions" }]}>
      <LandingLayout
        personaId="materials_coordinator"
        title="Material Exceptions"
        brief={buildPersonaBrief("materials_coordinator", { assetTag: focusTag })}
        kpis={[
          { label: "Material-blocked", value: blocked.length, emphasis: blocked.length > 0 ? "critical" : "healthy" },
          { label: "Below reorder", value: belowReorder.length, emphasis: "attention" },
          { label: "Critical spares", value: db.spareParts.filter((p) => p.criticalSpare).length },
          { label: "Longest lead", value: `${longestLead}d`, hint: "days" },
          { label: "Open expedites", value: "—", hint: "Procurement not connected" },
          { label: "Reservations", value: db.inventoryBalances.reduce((s, b) => s + b.reservedQty, 0) },
        ]}
      >
        {focusAsset ? <AssetThreadNotice tag={focusAsset.tag} name={focusAsset.name} /> : null}
        <QueueSection title="Critical spares below reorder" count={belowReorder.length} description="Spares at or below reorder point — expedite where lead time threatens planned work.">
          <ExceptionPanel items={belowReorder} empty="All spares above reorder point." />
        </QueueSection>
        <WorkQueue title="Spare inventory" rows={spareRows} description="Current spare availability against upcoming work." empty="No spares tracked." />
      </LandingLayout>
    </AppShell>
  );
}
