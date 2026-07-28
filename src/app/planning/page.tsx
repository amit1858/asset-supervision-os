import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { buildPersonaBrief } from "@/brief/service";
import { WorkQueue, ExceptionPanel, QueueSection } from "@/components/ui/queues";
import { WorkOrderStatusBadge, EquipmentId } from "@/components/ui/Badge";
import { RestrictedAction } from "@/components/ui/CapabilityGate";
import { AssetThreadNotice } from "@/components/landing/AssetThreadNotice";
import { getDataset } from "@/data/seed";
import { fmtCurrency, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function PlanningPage({ searchParams }: { searchParams: { asset?: string } }) {
  const db = getDataset();
  const assetById = new Map(db.assets.map((a) => [a.id, a]));
  const focusTag = searchParams.asset ?? null;
  const focusAsset = focusTag ? db.assets.find((a) => a.tag === focusTag) : undefined;

  const openWos = db.workOrders
    .filter((w) => w.status !== "completed" && w.status !== "cancelled")
    .sort((a, b) => (a.assetId === focusAsset?.id ? -1 : 0) - (b.assetId === focusAsset?.id ? -1 : 0));

  const rows = openWos.map((w) => {
    const asset = assetById.get(w.assetId);
    const missingParts = w.requiredSpareIds.filter((id) => {
      const bal = db.inventoryBalances.find((b) => b.sparePartId === id);
      return (bal?.onHandQty ?? 0) - (bal?.reservedQty ?? 0) <= 0;
    });
    return {
      id: w.id,
      ref: <span className="equipment-id text-xs">{w.number}</span>,
      primary: w.title,
      secondary: (
        <span>
          {asset ? <span className="equipment-id mr-1">{asset.tag}</span> : null}
          {w.type} · {w.priority}
          {missingParts.length > 0 ? <span className="ml-1 text-critical-text">· parts short</span> : null}
        </span>
      ),
      trailing: (
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-xs text-text-secondary">{fmtCurrency(w.estimatedCost, w.currency, true)}</span>
          <WorkOrderStatusBadge status={w.status} size="sm" />
          <RestrictedAction capability="prepare_work_order">
            <button className="rounded border border-border-strong px-2 py-0.5 text-xs font-medium hover:bg-elevated">Prepare</button>
          </RestrictedAction>
        </span>
      ),
    };
  });

  const partsShort = db.inventoryBalances
    .filter((b) => b.onHandQty - b.reservedQty <= 0)
    .map((b) => {
      const part = db.spareParts.find((p) => p.id === b.sparePartId);
      return {
        id: b.id,
        severity: "critical" as const,
        label: `${part?.partNumber ?? b.sparePartId} — not in stock`,
        detail: `${part?.description ?? ""} · ${part?.leadTimeDays ?? "?"}-day lead`,
      };
    });

  return (
    <AppShell crumbs={[{ label: "Maintenance" }, { label: "Planning Workbench" }]}>
      <LandingLayout
        personaId="maintenance_planner"
        title="Planning Workbench"
        brief={buildPersonaBrief("maintenance_planner", { assetTag: focusTag })}
        kpis={[
          { label: "Work orders to plan", value: openWos.length },
          { label: "Parts-constrained", value: partsShort.length, emphasis: partsShort.length > 0 ? "critical" : "healthy" },
          { label: "Scheduled", value: openWos.filter((w) => w.scheduledStart).length, hint: "have a start date" },
          { label: "Job-plan readiness", value: "—", hint: "CMMS not connected" },
          { label: "This week", value: "—", hint: "Scheduling not connected" },
          { label: "Backlog value", value: fmtCurrency(openWos.reduce((s, w) => s + w.estimatedCost, 0), "USD", true) },
        ]}
      >
        {focusAsset ? <AssetThreadNotice tag={focusAsset.tag} name={focusAsset.name} /> : null}
        <WorkQueue title="Work orders to plan" rows={rows} description="Approved and pending work requiring job plans, parts, and scheduling." empty="No open work orders." />
        <QueueSection title="Material constraints" count={partsShort.length}>
          <ExceptionPanel items={partsShort} empty="No material constraints." />
        </QueueSection>
      </LandingLayout>
    </AppShell>
  );
}
