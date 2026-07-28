import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageTitle, Section, Card, CardHeader, CardBody, Grid } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricCard, MetricValue, MetricDelta, KeyValueList } from "@/components/ui/Metric";
import { HealthScore, RiskIndicator, OEEGauge, ConfidenceIndicator } from "@/components/ui/Indicators";
import { SensorTrendChart, LossWaterfallChart, Sparkline } from "@/components/ui/Charts";
import {
  AssetStatusBadge,
  CriticalityBadge,
  SeverityBadge,
  DataFreshnessBadge,
  WorkOrderStatusBadge,
  ValueStatusBadge,
  DispositionBadge,
  ReadinessBadge,
  ProvenanceTag,
  EquipmentId,
} from "@/components/ui/Badge";
import { DeterministicVsAIIndicator, ModelBadge, TokenUsage } from "@/components/ui/AI";
import {
  EmptyState,
  LoadingSkeleton,
  CardSkeleton,
  ErrorState,
  StaleDataWarning,
  ConnectionStatus,
  SyntheticDataBanner,
} from "@/components/ui/Feedback";
import { Table, TBody, Td, Th, THead, TRow } from "@/components/ui/Table";
import { ApprovalControl } from "@/components/ui/ApprovalControl";
import type {
  AssetOperationalStatus,
  Criticality,
  EventSeverity,
} from "@/domain/enums";

const SAMPLE_SERIES = {
  label: "Overall vibration (RMS)",
  unit: "mm/s",
  color: "var(--chart-vibration)",
  warningThreshold: 7.1,
  criticalThreshold: 11.2,
  points: Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
    value: Number((5.3 + i * 0.12).toFixed(2)),
  })),
};

const COLOR_TOKENS = [
  ["Canvas", "bg-canvas"],
  ["Surface", "bg-surface"],
  ["Elevated", "bg-elevated"],
  ["Brand", "bg-brand"],
  ["Healthy", "bg-healthy"],
  ["Attention", "bg-attention"],
  ["Critical", "bg-critical"],
  ["Info", "bg-info"],
  ["Planned", "bg-planned"],
  ["AI", "bg-ai"],
];

export default function DesignSystemPage() {
  const statuses: AssetOperationalStatus[] = ["normal", "monitor", "attention", "critical", "offline", "maintenance", "planned_outage"];
  const severities: EventSeverity[] = ["info", "low", "medium", "high", "critical"];
  const criticalities: Criticality[] = ["A", "B", "C", "D", "E"];

  return (
    <AppShell crumbs={[{ label: "Design System" }]}>
      <PageContainer>
        <PageTitle
          title="Design System"
          context="Industrial Operations Intelligence — reusable tokens & components"
        />
        <div className="mb-4 flex items-center gap-2 rounded-md border border-attention-border bg-attention-subtle px-3 py-2 text-xs text-attention-text">
          <span aria-hidden>⚙</span>
          <span>
            <strong className="font-semibold">Internal development showcase.</strong> This route is
            not part of the product navigation or Presenter Mode. It exists for engineering
            reference only.
          </span>
        </div>
        <div className="mb-6"><SyntheticDataBanner /></div>

        {/* Typography */}
        <Section title="Typography">
          <Card><CardBody className="space-y-2">
            <h1 className="text-2xl font-semibold">Page title — Operations Command Center</h1>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Section heading</h2>
            <h3 className="text-sm font-semibold">Component heading</h3>
            <p className="text-sm text-text-primary">Body text — dense but readable operational content.</p>
            <p className="text-xs text-text-secondary">Supporting text and captions.</p>
            <p className="tabular-nums text-sm">Tabular metrics: 1,234.56 · 91.2% · 8.99 mm/s · $1,620,156</p>
            <p>Equipment identifier: <EquipmentId tag="K-201" /> <EquipmentId tag="P-210A" /></p>
            <p className="font-mono text-sm">Technical / code value: WO-48231</p>
          </CardBody></Card>
        </Section>

        {/* Colors */}
        <Section title="Colors" description="Restrained industrial palette; severity colors always paired with label + shape">
          <Card><CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {COLOR_TOKENS.map(([name, cls]) => (
                <div key={name}>
                  <div className={`h-12 rounded-md border border-border ${cls}`} />
                  <div className="mt-1 text-xs text-text-secondary">{name}</div>
                </div>
              ))}
            </div>
          </CardBody></Card>
        </Section>

        {/* Buttons */}
        <Section title="Buttons & controls">
          <Card><CardBody className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="success">☑ Approve</Button>
            <Button variant="danger">✕ Reject</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </CardBody></Card>
        </Section>

        {/* Status badges */}
        <Section title="Status hierarchy" description="Four separate concepts — never overloaded onto one badge">
          <Card><CardBody className="space-y-4">
            <Row label="Operational status">{statuses.map((s) => <AssetStatusBadge key={s} status={s} />)}</Row>
            <Row label="Event severity">{severities.map((s) => <SeverityBadge key={s} severity={s} />)}</Row>
            <Row label="Equipment criticality">{criticalities.map((c) => <CriticalityBadge key={c} level={c} />)}</Row>
            <Row label="Data freshness">
              <DataFreshnessBadge freshness="live" /><DataFreshnessBadge freshness="recent" />
              <DataFreshnessBadge freshness="stale" /><DataFreshnessBadge freshness="offline" />
            </Row>
            <Row label="Work order status">
              <WorkOrderStatusBadge status="planned" /><WorkOrderStatusBadge status="scheduled" />
              <WorkOrderStatusBadge status="in_progress" /><WorkOrderStatusBadge status="completed" />
            </Row>
            <Row label="Value status">
              <ValueStatusBadge status="projected" /><ValueStatusBadge status="validated" /><ValueStatusBadge status="realised" />
            </Row>
            <Row label="Disposition">
              <DispositionBadge disposition="immediate" /><DispositionBadge disposition="planned_maintenance" />
              <DispositionBadge disposition="next_turnaround" /><DispositionBadge disposition="monitor" />
            </Row>
            <Row label="Readiness">
              <ReadinessBadge status="ready" /><ReadinessBadge status="on_track" />
              <ReadinessBadge status="at_risk" /><ReadinessBadge status="not_started" />
            </Row>
            <Row label="Provenance">
              <ProvenanceTag provenance="measured" /><ProvenanceTag provenance="deterministic" />
              <ProvenanceTag provenance="business_rule" /><ProvenanceTag provenance="statistical" />
              <ProvenanceTag provenance="ai_generated" /><ProvenanceTag provenance="human" />
            </Row>
          </CardBody></Card>
        </Section>

        {/* Metrics & indicators */}
        <Section title="Operational cards & indicators">
          <Grid cols={4}>
            <MetricCard label="Unit OEE" value="91.2%" accent="brand" delta={<MetricDelta value={2} goodDirection="up" suffix="%" />} footnote="30-day rolled up" />
            <MetricCard label="Risk exposure" value="$1.6M" accent="critical" footnote="deterministic" />
            <Card><CardBody><HealthScore score={52} /></CardBody></Card>
            <Card><CardBody><RiskIndicator score={68} severity="high" /></CardBody></Card>
          </Grid>
          <div className="mt-4">
            <Grid cols={3}>
              <Card><CardBody><OEEGauge oee={0.912} availability={0.979} performance={0.939} quality={0.991} /></CardBody></Card>
              <Card><CardBody className="space-y-3">
                <ConfidenceIndicator value={0.61} />
                <div className="flex items-center gap-2"><MetricValue value="8.99" unit="mm/s" /><MetricDelta value={12} goodDirection="down" suffix="%" /></div>
                <Sparkline values={SAMPLE_SERIES.points.map((p) => p.value)} />
              </CardBody></Card>
              <Card><CardBody>
                <KeyValueList items={[
                  { key: "Risk score", value: "68/100" },
                  { key: "Health", value: "52/100" },
                  { key: "Confidence", value: "61%" },
                ]} />
              </CardBody></Card>
            </Grid>
          </div>
        </Section>

        {/* Charts */}
        <Section title="Data visualization" description="Units, thresholds, timestamps, tooltips; observed vs synthetic labelled">
          <Grid cols={2}>
            <Card><CardHeader title="Sensor trend with thresholds" /><CardBody><SensorTrendChart series={SAMPLE_SERIES} /></CardBody></Card>
            <Card><CardHeader title="OEE loss waterfall" /><CardBody>
              <LossWaterfallChart unit="bbl" steps={[
                { label: "Ideal", units: 675000, kind: "base", color: "var(--color-brand)" },
                { label: "Availability", units: 14000, kind: "loss", color: "var(--chart-availability)" },
                { label: "Performance", units: 40000, kind: "loss", color: "var(--chart-performance)" },
                { label: "Quality", units: 5500, kind: "loss", color: "var(--chart-quality)" },
                { label: "Good", units: 615500, kind: "result", color: "var(--color-healthy)" },
              ]} />
            </CardBody></Card>
          </Grid>
        </Section>

        {/* Tables */}
        <Section title="Tables">
          <Table caption="Sample table">
            <THead><TRow><Th>Asset</Th><Th>Status</Th><Th numeric>Risk</Th><Th numeric>Exposure</Th></TRow></THead>
            <TBody>
              <TRow><Td><EquipmentId tag="K-201" size="sm" /></Td><Td><AssetStatusBadge status="attention" size="sm" /></Td><Td numeric>68</Td><Td numeric>$1.6M</Td></TRow>
              <TRow><Td><EquipmentId tag="E-205" size="sm" /></Td><Td><AssetStatusBadge status="monitor" size="sm" /></Td><Td numeric>31</Td><Td numeric>$0.2M</Td></TRow>
            </TBody>
          </Table>
        </Section>

        {/* AI components */}
        <Section title="AI & governance components">
          <Grid cols={2}>
            <Card><CardHeader title="Model & tokens" /><CardBody className="space-y-3">
              <ModelBadge provider="nvidia" model="meta/llama-3.1-70b-instruct" />
              <ModelBadge provider="mock" model="mock/deterministic-explainer" />
              <TokenUsage input={2100} output={480} />
              <DeterministicVsAIIndicator />
            </CardBody></Card>
            <Card><CardHeader title="Approval control (human authority)" /><CardBody>
              <ApprovalControl recommendationId="rec-demo" disposition="immediate" />
            </CardBody></Card>
          </Grid>
        </Section>

        {/* States */}
        <Section title="Loading, empty, error, offline & stale states">
          <Grid cols={3}>
            <Card><CardHeader title="Loading" /><CardBody><LoadingSkeleton /></CardBody></Card>
            <CardSkeleton />
            <Card><CardHeader title="Empty" /><CardBody><EmptyState title="No data" description="Nothing to show yet." /></CardBody></Card>
            <Card><CardHeader title="Error" /><CardBody><ErrorState description="Failed to load sensor stream." /></CardBody></Card>
            <Card><CardHeader title="Stale / offline" /><CardBody className="space-y-2">
              <StaleDataWarning since="2 days ago" />
              <div><ConnectionStatus mode="local" /></div>
              <div><ConnectionStatus mode="offline" /></div>
            </CardBody></Card>
          </Grid>
        </Section>
      </PageContainer>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
