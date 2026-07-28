import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { buildPersonaBrief } from "@/brief/service";
import { QueueSection, ExceptionPanel, WorkQueue } from "@/components/ui/queues";
import { EquipmentId, CriticalityBadge, SeverityBadge } from "@/components/ui/Badge";
import { RestrictedAction } from "@/components/ui/CapabilityGate";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { computeShiftMetrics } from "@/data/shift-metrics";
import { fmtPercent, fmtRelative } from "@/lib/format";

export default function ShiftPage() {
  const cc = getRepository().getCommandCenter();
  const db = getDataset();
  const assetById = new Map(db.assets.map((a) => [a.id, a]));
  const shift = computeShiftMetrics(db.productionRuns);

  const deviations = db.conditionEvents
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .map((e) => {
      const asset = assetById.get(e.assetId);
      return {
        id: e.id,
        severity: (e.severity === "critical" || e.severity === "high" ? "critical" : e.severity === "medium" ? "attention" : "info") as "critical" | "attention" | "info",
        label: (
          <span>
            {asset ? <span className="equipment-id mr-1">{asset.tag}</span> : null}
            {e.rule}
          </span>
        ),
        detail: `${e.detail} · ${fmtRelative(e.detectedAt)}`,
        trailing: <SeverityBadge severity={e.severity} size="sm" />,
      };
    });

  const responseRows = cc.attentionAssets.map((s) => ({
    id: s.asset.id,
    ref: <EquipmentId tag={s.asset.tag} size="sm" />,
    primary: s.asset.name,
    secondary: <CriticalityBadge level={s.asset.criticality} size="sm" />,
    trailing: (
      <RestrictedAction capability="issue_operating_instruction">
        <button className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-elevated">Issue instruction</button>
      </RestrictedAction>
    ),
    href: `/assets/${s.asset.tag}`,
  }));

  return (
    <AppShell crumbs={[{ label: "Operations" }, { label: "Shift Command" }]}>
      <LandingLayout
        personaId="shift_supervisor"
        title="Shift Command Center"
        brief={buildPersonaBrief("shift_supervisor")}
        kpis={[
          { label: "Shift OEE", value: shift.shiftOee === null ? "—" : fmtPercent(shift.shiftOee, 1), hint: shift.shiftOee === null ? "Awaiting shift production data" : undefined },
          { label: "Shift availability", value: shift.shiftAvailability === null ? "—" : fmtPercent(shift.shiftAvailability, 1), hint: shift.shiftAvailability === null ? "Awaiting shift production data" : undefined },
          { label: "Active deviations", value: deviations.length, emphasis: deviations.length > 0 ? "attention" : "default" },
          { label: "Assets needing response", value: cc.attentionAssets.length, emphasis: "attention" },
          { label: "30-day unit benchmark", value: fmtPercent(shift.benchmark30d.oee, 1), hint: "OEE — not a shift value" },
          { label: "Open work requests", value: "—", hint: "CMMS not connected" },
        ]}
      >
        <QueueSection title="Active deviations" count={deviations.length} description="Condition deviations detected on the unit this shift.">
          <ExceptionPanel items={deviations} empty="No active deviations." />
        </QueueSection>
        <WorkQueue title="Assets needing an operating response" rows={responseRows} empty="No operating response required." />
      </LandingLayout>
    </AppShell>
  );
}
