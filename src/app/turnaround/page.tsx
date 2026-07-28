import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Section, Card, CardHeader, CardBody, Grid } from "@/components/ui/Card";
import { EnterprisePageHeader, SummaryStrip } from "@/components/ui/enterprise";
import { MyBrief } from "@/components/brief/MyBrief";
import { buildPersonaBrief } from "@/brief/service";
import { ReadinessBadge } from "@/components/ui/Badge";
import { Table, TBody, Td, Th, THead, TRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/Feedback";
import { getDataset } from "@/data/seed";
import { fmtCurrency, fmtDate, fmtRelative } from "@/lib/format";
import type { ReadinessDimension } from "@/domain/enums";

const DIMS: ReadinessDimension[] = ["engineering", "materials", "labour", "permits"];

export default function TurnaroundPage() {
  const db = getDataset();
  const project = db.turnaroundProjects[0];
  const packages = db.turnaroundWorkPackages;

  if (!project) {
    return (
      <AppShell crumbs={[{ label: "Turnaround" }, { label: "Turnaround Control Tower" }]}>
        <div className="mx-auto w-full max-w-content px-6 py-6">
          <EmptyState title="No active turnaround" />
        </div>
      </AppShell>
    );
  }

  const criticalPathAtRisk = packages.filter(
    (p) => p.onCriticalPath && Object.values(p.readiness).some((r) => r === "at_risk" || r === "not_started"),
  );
  const totalScopeCost = packages.reduce((s, p) => s + p.estimatedCost, 0);
  const emergentPackages = packages.filter((p) => p.originatingConditionEventId !== null);

  // Readiness checks: one per (work package × dimension). Completed = ready|on_track.
  const totalChecks = packages.length * DIMS.length;
  const completedChecks = packages.reduce(
    (s, p) => s + DIMS.filter((d) => p.readiness[d] === "ready" || p.readiness[d] === "on_track").length,
    0,
  );
  const readinessPct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  return (
    <AppShell crumbs={[{ label: "Turnaround" }, { label: "Turnaround Control Tower" }]}>
      <EnterprisePageHeader
        eyebrow="Turnaround Manager · turnaround"
        title="Turnaround Control Tower"
        description={`${project.name} · ${project.code}`}
      />
      <div className="mx-auto w-full max-w-content px-6 py-6">
        <div className="mb-6">
          <MyBrief brief={buildPersonaBrief("turnaround_manager")} />
        </div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My Workspace</h2>
        <div className="mb-6">
          <SummaryStrip
            items={[
              { label: "Execution window", value: fmtRelative(project.windowStart), hint: `${fmtDate(project.windowStart)} – ${fmtDate(project.windowEnd)}` },
              { label: "Scope freeze", value: fmtRelative(project.scopeFreezeDate), hint: fmtDate(project.scopeFreezeDate), emphasis: "attention" },
              { label: "Critical-path at risk", value: criticalPathAtRisk.length, emphasis: criticalPathAtRisk.length > 0 ? "critical" : "healthy" },
              { label: "Scoped cost", value: fmtCurrency(totalScopeCost, project.currency, true), hint: `Budget ${fmtCurrency(project.budget, project.currency, true)}` },
              { label: "Readiness", value: `${completedChecks}/${totalChecks}`, hint: `${readinessPct}% checks` },
              { label: "Work packages", value: packages.length },
            ]}
          />
        </div>

        <Section title="Readiness by dimension">
          <Card>
            <CardHeader
              title={
                <span
                  title="A readiness check is one readiness dimension (engineering, materials, labour, permits) for one work package. Completed = ready or on-track. Total = work packages × 4 dimensions."
                  className="cursor-help"
                >
                  {completedChecks} of {totalChecks} readiness checks completed — {readinessPct}%
                </span>
              }
              subtitle={`${packages.length} work packages × ${DIMS.length} dimensions · hover for calculation`}
            />
            <CardBody>
              <div className="mb-3 flex items-center gap-2 rounded border border-border bg-canvas px-3 py-2 text-sm text-text-secondary">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-attention" />
                <span>
                  <strong className="font-semibold text-text-primary">Recommended next action:</strong> Expedite K-201
                  materials and initiate permit preparation.
                </span>
              </div>
              <Grid cols={4}>
                {DIMS.map((dim) => {
                  const ready = packages.filter((p) => p.readiness[dim] === "ready" || p.readiness[dim] === "on_track").length;
                  return (
                    <div key={dim} className="rounded border border-border bg-surface p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-text-muted capitalize">{dim}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{ready}/{packages.length}</div>
                      <div className="mt-1">
                        <ReadinessBadge status={ready === packages.length ? "ready" : ready > 0 ? "on_track" : "at_risk"} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </Grid>
            </CardBody>
          </Card>
        </Section>

        <Section title="Work packages" description="Scope readiness across engineering, materials, labour, and permits">
          <Table caption="Turnaround work packages">
            <THead>
              <TRow>
                <Th>Package</Th>
                <Th>Title</Th>
                {DIMS.map((d) => (
                  <Th key={d} className="capitalize">{d}</Th>
                ))}
                <Th>Critical path</Th>
                <Th numeric>Est. cost</Th>
              </TRow>
            </THead>
            <TBody>
              {packages.map((p) => (
                <TRow key={p.id}>
                  <Td className="font-mono text-xs font-semibold">{p.code}</Td>
                  <Td>{p.title}</Td>
                  {DIMS.map((d) => (
                    <Td key={d}>
                      <ReadinessBadge status={p.readiness[d]} size="sm" />
                    </Td>
                  ))}
                  <Td>{p.onCriticalPath ? <span className="text-critical-text font-semibold">● Yes</span> : <span className="text-text-muted">No</span>}</Td>
                  <Td numeric>{fmtCurrency(p.estimatedCost, project.currency, true)}</Td>
                </TRow>
              ))}
            </TBody>
          </Table>
        </Section>

        <Section title="Emerging asset risks in scope" description="Work packages created from condition events (Asset ↔ Turnaround link)">
          <Card>
            <CardBody>
              {emergentPackages.length > 0 ? (
                <ul className="space-y-2">
                  {emergentPackages.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded border border-planned-border bg-planned-subtle px-3 py-2">
                      <div>
                        <span className="font-mono text-xs font-semibold text-planned-text">{p.code}</span>{" "}
                        <span className="text-sm text-text-primary">{p.title}</span>
                        <p className="text-xs text-text-secondary">Originated from condition event {p.originatingConditionEventId}</p>
                      </div>
                      <Link href="/assets/K-201" className="text-sm font-medium text-brand-text hover:underline">
                        View asset →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No emergent scope" />
              )}
              <p className="mt-3 text-xs text-text-muted">
                Note: K-201&apos;s projected time-to-critical is earlier than the scope-freeze
                date, so the deterministic recommendation is to intervene now and retain the
                full overhaul in turnaround scope.
              </p>
            </CardBody>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
