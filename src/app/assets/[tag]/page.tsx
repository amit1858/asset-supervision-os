import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Section,
  Card,
  CardHeader,
  CardBody,
  Grid,
} from "@/components/ui/Card";
import { EnterprisePageHeader } from "@/components/ui/enterprise";
import {
  AssetStatusBadge,
  CriticalityBadge,
  DataFreshnessBadge,
  DispositionBadge,
  EquipmentId,
} from "@/components/ui/Badge";
import { HealthScore, RiskIndicator, OEEGauge, ConfidenceIndicator } from "@/components/ui/Indicators";
import { SensorTrendChart, type TrendSeries } from "@/components/ui/Charts";
import { EvidencePanel } from "@/components/ui/Evidence";
import { AIInsightCard, DeterministicVsAIIndicator } from "@/components/ui/AI";
import { ApprovalControl } from "@/components/ui/ApprovalControl";
import {
  WorkOrderTable,
  SpareAvailability,
  EventTimeline,
  MaintenanceHistoryTable,
  FinancialImpact,
} from "@/components/ui/Operational";
import { EmptyState } from "@/components/ui/Feedback";
import { MetricCard, KeyValueList } from "@/components/ui/Metric";
import { getRepository } from "@/data/repository";
import type { Recommendation } from "@/domain/types";
import { AssetContextSync } from "@/components/landing/AssetContextSync";
import { METRIC_CHART_COLOR } from "@/design-system/status";
import { fmtCurrency, fmtDate, fmtDays } from "@/lib/format";
import { cn } from "@/lib/cn";

const CHANNEL_COLOR: Record<string, string> = {
  vibration_overall: METRIC_CHART_COLOR.vibration!,
  bearing_temp_de: METRIC_CHART_COLOR.temperature!,
  bearing_temp_nde: "var(--chart-5)",
};

export default function Asset360Page({ params }: { params: { tag: string } }) {
  const repo = getRepository();
  const tag = decodeURIComponent(params.tag);
  const model = repo.getAsset360(tag);
  if (!model) notFound();

  const { asset, sensors, risk, analysis, recommendation, evidence, aiInteraction } = model;

  const sensorSeries: TrendSeries[] = sensors.map(({ definition, readings }) => ({
    label: definition.label,
    unit: definition.unit,
    color: CHANNEL_COLOR[definition.channel] ?? "var(--chart-1)",
    warningThreshold: definition.warningThreshold,
    criticalThreshold: definition.criticalThreshold,
    points: readings.map((r) => ({ timestamp: r.timestamp, value: r.value })),
  }));

  return (
    <AppShell
      crumbs={[
        { label: "Operations", href: "/" },
        { label: "Asset 360" },
        { label: asset.tag },
      ]}
    >
      <AssetContextSync tag={asset.tag} />
      <EnterprisePageHeader
        eyebrow="Reliability Engineer · asset condition"
        title={
          <span className="flex items-center gap-3">
            <EquipmentId tag={asset.tag} size="lg" />
            <span>{asset.name}</span>
          </span>
        }
        description={`${asset.assetType} · ${asset.manufacturer} ${asset.model} · commissioned ${fmtDate(asset.commissionedOn)}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <CriticalityBadge level={asset.criticality} size="sm" />
            <AssetStatusBadge status={asset.operationalStatus} size="sm" />
          </span>
        }
        secondaryActions={<DataFreshnessBadge freshness="recent" />}
      />
      <div className="mx-auto w-full max-w-content px-6 py-6">
        {risk === null || analysis === null ? (
          <EmptyState
            title="No condition model for this asset"
            description="This synthetic asset has no sensor stream in the Phase 1 dataset. The full condition, risk, and recommendation workflow is demonstrated on the hero asset K-201."
            action={
              <Link href="/assets/K-201" className="text-sm font-medium text-brand-text hover:underline">
                Open K-201 →
              </Link>
            }
          />
        ) : (
          <>
            {recommendation ? (
              <DecisionBanner
                recommendation={recommendation}
                projectedDays={risk.projectedDaysToCritical}
                turnaroundDays={model.turnaroundWindowInDays}
              />
            ) : null}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main column */}
            <div className="space-y-6 lg:col-span-2">
              {/* Current state */}
              <Section title="Current asset state">
                <Grid cols={3}>
                  <Card>
                    <CardBody>
                      <HealthScore score={risk.healthScore} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardBody>
                      <RiskIndicator score={risk.riskScore} severity={risk.severity} />
                    </CardBody>
                  </Card>
                  <MetricCard
                    label="Projected time-to-critical"
                    value={fmtDays(risk.projectedDaysToCritical)}
                    accent="attention"
                    footnote="Vibration trend, linear extrapolation"
                  />
                </Grid>
              </Section>

              {/* Sensor trends */}
              <Section
                title="Critical sensor trends"
                description="Observed data with warning and critical thresholds (synthetic)"
              >
                <div className="space-y-4">
                  {sensorSeries.map((s) => (
                    <Card key={s.label}>
                      <CardHeader
                        title={s.label}
                        subtitle={`Unit: ${s.unit} · latest ${
                          s.points[s.points.length - 1]?.value
                        } ${s.unit}`}
                        actions={<DataFreshnessBadge freshness="recent" size="sm" />}
                      />
                      <CardBody>
                        <SensorTrendChart series={s} />
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </Section>

              {/* OEE impact */}
              <Section title="Production & OEE impact" description="30-day rolled-up OEE for the constrained unit">
                <Card>
                  <CardBody>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <OEEGauge
                        oee={analysis.recentOee.oee}
                        availability={analysis.recentOee.availability}
                        performance={analysis.recentOee.performance}
                        quality={analysis.recentOee.quality}
                      />
                      <FinancialImpact
                        exposureUsd={analysis.totalExposureUsd}
                        breakdown={[
                          {
                            label: "Recent attributable loss (30-day)",
                            valueUsd: analysis.recentAttributableExposureUsd,
                          },
                          {
                            label: "Projected 4-day failure exposure",
                            valueUsd: analysis.projectedFailureExposureUsd,
                          },
                        ]}
                      />
                    </div>
                    <Link href="/oee" className="mt-4 inline-flex text-sm font-medium text-brand-text hover:underline">
                      Break down the losses →
                    </Link>
                  </CardBody>
                </Card>
              </Section>

              {/* Condition events */}
              <Section title="Condition & deterioration history">
                <Card>
                  <CardBody>
                    <EventTimeline events={model.conditionEvents} />
                  </CardBody>
                </Card>
              </Section>

              {/* Work orders */}
              <Section title="Open work orders">
                {model.workOrders.length > 0 ? (
                  <WorkOrderTable workOrders={model.workOrders} />
                ) : (
                  <EmptyState title="No open work orders" />
                )}
              </Section>

              {/* Maintenance history */}
              <Section title="Maintenance history">
                {model.maintenanceHistory.length > 0 ? (
                  <MaintenanceHistoryTable records={model.maintenanceHistory} />
                ) : (
                  <EmptyState title="No maintenance history" />
                )}
              </Section>
            </div>

            {/* Right rail — decision & evidence */}
            <div className="space-y-6">
              {recommendation ? (
                <div className="lg:sticky lg:top-24">
                  <Section title="Approve this decision">
                    <Card>
                      <CardHeader
                        title="Human approval required"
                        actions={<DispositionBadge disposition={recommendation.disposition} size="sm" />}
                      />
                      <CardBody className="space-y-3">
                        <KeyValueList
                          items={[
                            { key: "Value at stake (K-201)", value: fmtCurrency(recommendation.valueAtStakeUsd, recommendation.currency) },
                            { key: "Projected value enabled", value: fmtCurrency(recommendation.projectedValueEnabledUsd, recommendation.currency) },
                            { key: "Deterministic risk", value: `${risk.riskScore}/100` },
                            { key: "Decision owner", value: recommendation.decisionOwner },
                            { key: "Due by", value: recommendation.dueBy ? fmtDate(recommendation.dueBy) : "—" },
                          ]}
                        />
                        <div className="border-t border-border pt-3">
                          <ConfidenceIndicator value={recommendation.trendProjectionConfidence} />
                          <p className="mt-1.5 text-[11px] text-text-muted">
                            Trend-projection confidence is a deterministic assessment (data density and
                            threshold-breach clarity) — not an LLM or predictive-model confidence.
                          </p>
                        </div>
                        <div className="border-t border-border pt-3">
                          <ApprovalControl
                            recommendationId={recommendation.id}
                            disposition={recommendation.disposition}
                          />
                        </div>
                      </CardBody>
                    </Card>
                  </Section>

                  {aiInteraction && recommendation.aiRationale ? (
                    <Section title="AI explanation">
                      <AIInsightCard
                        text={recommendation.aiRationale}
                        interaction={aiInteraction}
                      />
                    </Section>
                  ) : null}

                  <Section
                    title="Evidence"
                    description="Every claim traced to its source and provenance"
                  >
                    <Card>
                      <CardBody>
                        <div className="mb-3">
                          <DeterministicVsAIIndicator />
                        </div>
                        <EvidencePanel evidence={evidence} />
                      </CardBody>
                    </Card>
                  </Section>

                  <Section title="Spare availability">
                    <Card>
                      <CardBody>
                        <SpareAvailability spares={model.spares} />
                        {model.linkedWorkPackage ? (
                          <div className="mt-3 rounded border border-planned-border bg-planned-subtle px-3 py-2 text-xs text-planned-text">
                            Linked to turnaround package{" "}
                            <span className="font-semibold">{model.linkedWorkPackage.code}</span> —{" "}
                            {model.linkedWorkPackage.title}.{" "}
                            <Link href="/turnaround" className="underline">
                              View in Control Tower
                            </Link>
                          </div>
                        ) : null}
                      </CardBody>
                    </Card>
                  </Section>
                </div>
              ) : null}
            </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

const ACTION_SYMBOL: Record<string, string> = {
  immediate_mitigation: "◆",
  inspection: "◈",
  replacement: "⚙",
  turnaround_overhaul: "▣",
};

const ACTION_LABEL: Record<string, string> = {
  immediate_mitigation: "Immediate mitigation",
  inspection: "Inspection / replacement",
  replacement: "Replacement",
  turnaround_overhaul: "Planned turnaround overhaul",
};

/** High-priority, full-width time-bound decision banner (top of Asset 360). */
function DecisionBanner({
  recommendation,
  projectedDays,
  turnaroundDays,
}: {
  recommendation: Recommendation;
  projectedDays: number | null;
  turnaroundDays: number | null;
}) {
  const approvalPending = recommendation.status === "open";
  return (
    <section
      aria-label="Recommended decision"
      className="mb-6 overflow-hidden rounded-md border border-critical-border bg-surface shadow-panel"
    >
      <div className="border-l-4 border-critical p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-critical-text">
            <span aria-hidden>◆</span> Recommended decision · deterministic
          </span>
          <span className="flex items-center gap-2">
            <DispositionBadge disposition={recommendation.disposition} />
            <span
              className={cn(
                "rounded border px-2 py-0.5 text-xs font-medium",
                approvalPending
                  ? "border-attention-border bg-attention-subtle text-attention-text"
                  : "border-healthy-border bg-healthy-subtle text-healthy-text",
              )}
            >
              Approval: {approvalPending ? "Pending" : "Recorded"}
            </span>
          </span>
        </div>

        <h2 className="mt-2 text-xl font-semibold leading-snug text-text-primary">
          {recommendation.title}
        </h2>

        {projectedDays !== null ? (
          <p className="mt-2 rounded border border-border bg-canvas px-3 py-1.5 text-sm text-text-secondary">
            Projected time-to-critical is <strong className="text-text-primary">~{Math.round(projectedDays)} days</strong>
            {turnaroundDays !== null ? (
              <>
                {" "}— earlier than the turnaround execution window in <strong className="text-text-primary">{turnaroundDays} days</strong>.
                The risk cannot wait for the turnaround.
              </>
            ) : (
              <> — action cannot wait for the next turnaround.</>
            )}
          </p>
        ) : null}

        <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {recommendation.actionPlan.map((a, i) => (
            <li key={i} className="rounded-md border border-border bg-elevated p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <span aria-hidden className="text-brand">{ACTION_SYMBOL[a.kind] ?? "•"}</span>
                {ACTION_LABEL[a.kind] ?? a.kind}
              </div>
              <p className="mt-1 text-sm text-text-primary">{a.label}</p>
              <p className="mt-1 text-xs font-medium text-brand-text">{a.timing}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-text-secondary">
          <span>
            Owner: <strong className="text-text-primary">{recommendation.decisionOwner}</strong>
          </span>
          <span>
            Due by:{" "}
            <strong className="text-text-primary">
              {recommendation.dueBy ? fmtDate(recommendation.dueBy) : "—"}
            </strong>
          </span>
          <span>
            Value at stake:{" "}
            <strong className="tabular-nums text-text-primary">
              {fmtCurrency(recommendation.valueAtStakeUsd, recommendation.currency)}
            </strong>
          </span>
        </div>
      </div>
    </section>
  );
}
