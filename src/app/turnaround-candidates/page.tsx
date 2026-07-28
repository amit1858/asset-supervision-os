import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { LandingLayout } from "@/components/landing/LandingLayout";
import { WorkQueue, QueueSection } from "@/components/ui/queues";
import { ReadinessBadge, EquipmentId, DispositionBadge } from "@/components/ui/Badge";
import { getDataset } from "@/data/seed";
import { fmtCurrency, fmtDate } from "@/lib/format";

export default function TurnaroundCandidatesPage() {
  const db = getDataset();
  const project = db.turnaroundProjects[0];
  const assetById = new Map(db.assets.map((a) => [a.id, a]));

  const packages = db.turnaroundWorkPackages;
  const emergent = packages.filter((w) => w.originatingConditionEventId !== null);

  const candidateRecs = db.recommendations.filter((r) => r.disposition === "next_turnaround");

  const wpRows = packages.map((w) => {
    const asset = w.assetId ? assetById.get(w.assetId) : undefined;
    const atRisk = Object.values(w.readiness).some((r) => r === "at_risk" || r === "not_started");
    return {
      id: w.id,
      ref: <span className="equipment-id text-xs">{w.code}</span>,
      primary: w.title,
      secondary: (
        <span>
          {asset ? <span className="equipment-id mr-1">{asset.tag}</span> : null}
          {w.discipline}
          {w.onCriticalPath ? <span className="ml-1 font-medium text-critical-text">· critical path</span> : null}
          {w.originatingConditionEventId ? <span className="ml-1 text-planned-text">· from condition event</span> : null}
        </span>
      ),
      trailing: (
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-xs text-text-secondary">{fmtCurrency(w.estimatedCost, project?.currency ?? "USD", true)}</span>
          <ReadinessBadge status={atRisk ? "at_risk" : "on_track"} size="sm" />
        </span>
      ),
    };
  });

  const recRows = candidateRecs.map((r) => {
    const asset = assetById.get(r.assetId);
    return {
      id: r.id,
      ref: asset ? <EquipmentId tag={asset.tag} size="sm" /> : undefined,
      primary: r.title,
      secondary: `Owner: ${r.decisionOwner}`,
      trailing: <DispositionBadge disposition={r.disposition} size="sm" />,
      href: asset ? `/assets/${asset.tag}` : undefined,
    };
  });

  return (
    <AppShell crumbs={[{ label: "Turnaround" }, { label: "Turnaround Candidates" }]}>
      <LandingLayout
        personaId="turnaround_manager"
        title="Turnaround Candidates"
        description="Emerging asset risks and reliability recommendations proposed for the next turnaround scope."
        kpis={[
          { label: "Candidate packages", value: emergent.length, emphasis: "attention" },
          { label: "Recommended to turnaround", value: candidateRecs.length },
          { label: "Total packages", value: packages.length },
          { label: "Critical-path", value: packages.filter((w) => w.onCriticalPath).length },
          { label: "Scoped cost", value: fmtCurrency(packages.reduce((s, w) => s + w.estimatedCost, 0), project?.currency ?? "USD", true) },
          { label: "Days to freeze", value: project ? Math.max(0, Math.round((new Date(project.scopeFreezeDate).getTime() - new Date(db.meta.generatedAt).getTime()) / 86_400_000)) : "—" },
        ]}
      >
        <QueueSection title="Emerging candidates from condition events" count={emergent.length} description="Work packages raised from asset condition — the Asset ↔ Turnaround link.">
          <WorkQueue title="Work packages" rows={wpRows} />
        </QueueSection>
        {recRows.length > 0 ? (
          <WorkQueue title="Recommendations proposed for turnaround" rows={recRows} />
        ) : null}
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
          Manage full scope and readiness in the{" "}
          <Link href="/turnaround" className="font-medium text-brand-text hover:underline">Turnaround Control Tower</Link>.
        </div>
      </LandingLayout>
    </AppShell>
  );
}
