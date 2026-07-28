import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Section, Card, CardHeader, CardBody, Grid } from "@/components/ui/Card";
import { EnterprisePageHeader } from "@/components/ui/enterprise";
import { OEEGauge } from "@/components/ui/Indicators";
import { MetricCard } from "@/components/ui/Metric";
import { LossWaterfallChart, RankedLossBars, type WaterfallStep } from "@/components/ui/Charts";
import { Table, TBody, Td, Th, THead, TRow } from "@/components/ui/Table";
import { ProvenanceTag } from "@/components/ui/Badge";
import { getDataset } from "@/data/seed";
import { analyzeK201 } from "@/data/k201-analysis";
import { LINE, CONTRIBUTION_MARGIN_PER_BBL, TREND_WINDOW_DAYS } from "@/data/constants";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";

export default function OeePage() {
  const db = getDataset();
  const analysis = analyzeK201(db);
  const oee = analysis.recentOee;

  const idealForPlanned =
    (oee.inputs.idealRateUnitsPerHour * oee.inputs.plannedProductionMinutes) / 60;

  const steps: WaterfallStep[] = [
    { label: "Ideal output", units: idealForPlanned, kind: "base", color: "var(--color-brand)" },
    { label: "Availability", units: oee.losses.availabilityLossUnits, kind: "loss", color: "var(--chart-availability)" },
    { label: "Performance", units: oee.losses.performanceLossUnits, kind: "loss", color: "var(--chart-performance)" },
    { label: "Quality", units: oee.losses.qualityLossUnits, kind: "loss", color: "var(--chart-quality)" },
    { label: "Good output", units: oee.inputs.goodUnits, kind: "result", color: "var(--color-healthy)" },
  ];

  // Downtime attribution over the recent window.
  const recentRuns = db.productionRuns
    .filter((r) => r.productionLineId === LINE.id)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .slice(-TREND_WINDOW_DAYS);
  const cutoff = recentRuns[0]?.periodStart ?? "";
  const downtimeByCat = new Map<string, number>();
  for (const e of db.downtimeEvents) {
    if (e.startedAt >= cutoff) {
      downtimeByCat.set(e.category, (downtimeByCat.get(e.category) ?? 0) + e.minutes);
    }
  }
  const downtimeRows = Array.from(downtimeByCat.entries())
    .map(([category, minutes]) => {
      const units = (minutes / 60) * LINE.idealRateUnitsPerHour;
      return { category, minutes, units, usd: units * CONTRIBUTION_MARGIN_PER_BBL };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const qualityByCat = new Map<string, number>();
  for (const q of db.qualityEvents) {
    if (q.occurredAt >= cutoff) {
      qualityByCat.set(q.category, (qualityByCat.get(q.category) ?? 0) + q.defectiveUnits);
    }
  }

  return (
    <AppShell crumbs={[{ label: "Operations", href: "/" }, { label: "OEE Loss Intelligence" }]}>
      <EnterprisePageHeader
        eyebrow="Reliability · unit performance"
        title="OEE Loss Intelligence"
        description={`${LINE.name} · rolled-up ${TREND_WINDOW_DAYS}-day OEE · deterministic`}
      />
      <div className="mx-auto w-full max-w-content px-6 py-6">
        <Section title="Overall equipment effectiveness">
          <Grid cols={4}>
            <Card>
              <CardBody>
                <OEEGauge
                  oee={oee.oee}
                  availability={oee.availability}
                  performance={oee.performance}
                  quality={oee.quality}
                  compact
                />
              </CardBody>
            </Card>
            <MetricCard label="Availability" value={fmtPercent(oee.availability, 1)} footnote={`${fmtNumber(oee.losses.availabilityLossUnits)} bbl lost`} />
            <MetricCard label="Performance" value={fmtPercent(oee.performance, 1)} footnote={`${fmtNumber(oee.losses.performanceLossUnits)} bbl speed loss`} />
            <MetricCard label="Quality" value={fmtPercent(oee.quality, 1)} footnote={`${fmtNumber(oee.losses.qualityLossUnits)} bbl off-spec`} />
          </Grid>
        </Section>

        <Section
          title="Ranked loss attribution"
          description="Bars scaled to the largest loss so each is legible; performance (speed) loss is the dominant loss"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardBody>
                <RankedLossBars
                  unit="bbl"
                  losses={[
                    { label: "Availability loss (downtime)", units: oee.losses.availabilityLossUnits, color: "var(--chart-availability)" },
                    { label: "Performance loss (speed)", units: oee.losses.performanceLossUnits, color: "var(--chart-performance)" },
                    { label: "Quality loss (off-spec)", units: oee.losses.qualityLossUnits, color: "var(--chart-quality)" },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Ideal → good reconciliation" actions={<ProvenanceTag provenance="deterministic" size="sm" />} />
              <CardBody>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between"><span className="text-text-secondary">Ideal output</span><span className="tabular-nums font-medium">{fmtNumber(idealForPlanned)} bbl</span></li>
                  <li className="flex justify-between text-text-secondary"><span>− Availability</span><span className="tabular-nums">{fmtNumber(oee.losses.availabilityLossUnits)}</span></li>
                  <li className="flex justify-between text-text-secondary"><span>− Performance</span><span className="tabular-nums">{fmtNumber(oee.losses.performanceLossUnits)}</span></li>
                  <li className="flex justify-between text-text-secondary"><span>− Quality</span><span className="tabular-nums">{fmtNumber(oee.losses.qualityLossUnits)}</span></li>
                  <li className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>= Good output</span><span className="tabular-nums text-healthy-text">{fmtNumber(oee.inputs.goodUnits)} bbl</span></li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section title="Loss waterfall" description="Ideal output stepping down through availability, performance, and quality losses to good output (bbl)">
          <Card>
            <CardBody>
              <LossWaterfallChart steps={steps} unit="bbl" />
            </CardBody>
          </Card>
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Downtime & speed-loss attribution">
            <Table caption="Downtime attribution by category">
              <THead>
                <TRow>
                  <Th>Category</Th>
                  <Th numeric>Minutes</Th>
                  <Th numeric>Lost bbl</Th>
                  <Th numeric>Exposure</Th>
                </TRow>
              </THead>
              <TBody>
                {downtimeRows.map((r) => (
                  <TRow key={r.category}>
                    <Td className="capitalize">{r.category.replace(/_/g, " ")}</Td>
                    <Td numeric>{fmtNumber(r.minutes)}</Td>
                    <Td numeric>{fmtNumber(r.units)}</Td>
                    <Td numeric>{fmtCurrency(r.usd, "USD", true)}</Td>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </Section>

          <Section title="Quality loss attribution">
            <Card>
              <CardHeader title="Off-spec attribution" actions={<ProvenanceTag provenance="deterministic" size="sm" />} />
              <CardBody>
                {qualityByCat.size > 0 ? (
                  <ul className="space-y-2">
                    {Array.from(qualityByCat.entries()).map(([cat, units]) => (
                      <li key={cat} className="flex items-center justify-between text-sm">
                        <span className="capitalize text-text-secondary">{cat.replace(/_/g, " ")}</span>
                        <span className="tabular-nums font-medium">{fmtNumber(units)} bbl</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-muted">No quality losses in window.</p>
                )}
                <div className="mt-4 rounded border border-critical-border bg-critical-subtle px-3 py-2 text-sm text-critical-text">
                  Asset-to-production link: K-201 deterioration drives the speed-loss
                  component.{" "}
                  <Link href="/assets/K-201" className="font-semibold underline">
                    Open K-201 →
                  </Link>
                </div>
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
