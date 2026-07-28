import { AppShell } from "@/components/layout/AppShell";
import { EnterprisePageHeader, Tabs, SummaryStrip, ReadOnlyNotice, EmptyWorkspace } from "@/components/ui/enterprise";
import { QueueSection } from "@/components/ui/queues";
import { MyBrief } from "@/components/brief/MyBrief";
import { buildPersonaBrief } from "@/brief/service";
import { MetricCard } from "@/components/ui/Metric";
import { ReturnOnTokenSpend, ModelBadge } from "@/components/ui/AI";
import { RestrictedAction } from "@/components/ui/CapabilityGate";
import { Table, TBody, Td, Th, THead, TRow } from "@/components/ui/Table";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { readOperationalContext } from "@/context/server";
import { personaCan } from "@/personas/registry";
import { fmtCost, fmtCurrency, fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";

const TAB_KEYS = ["agent-runs", "value-cost", "runtime"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export const dynamic = "force-dynamic";

export default function AgentControlTower({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const active: TabKey = TAB_KEYS.includes(searchParams.tab as TabKey)
    ? (searchParams.tab as TabKey)
    : "agent-runs";
  const { personaId } = readOperationalContext();

  return (
    <AppShell crumbs={[{ label: "AI Governance" }, { label: "Agent Control Tower" }]}>
      <EnterprisePageHeader
        eyebrow="AI Control Tower Administrator · ai governance"
        title="Agent Control Tower"
        description="Monitor AI agents, govern the model runtime, and account for AI value — with actual activity separated from estimated scenarios."
        tabs={
          <Tabs
            active={active}
            tabs={[
              { key: "agent-runs", label: "AI Runtime Activity", href: "/agent-control?tab=agent-runs" },
              { key: "value-cost", label: "Value & Cost", href: "/agent-control?tab=value-cost" },
              { key: "runtime", label: "Model Runtime", href: "/agent-control?tab=runtime" },
            ]}
          />
        }
      />
      <div className="mx-auto w-full max-w-content px-6 py-6">
        <div className="mb-6">
          <MyBrief brief={buildPersonaBrief("ai_admin")} />
        </div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My Workspace</h2>
        {active === "agent-runs" ? <AiRuntimeActivity canView={personaCan(personaId, "monitor_agent_runs")} /> : null}
        {active === "value-cost" ? <ValueCost canView={personaCan(personaId, "view_token_economics")} /> : null}
        {active === "runtime" ? <ModelRuntime canConfigure={personaCan(personaId, "configure_model_runtime")} /> : null}
      </div>
    </AppShell>
  );
}

function AiRuntimeActivity({ canView }: { canView: boolean }) {
  if (!canView) {
    return <EmptyWorkspace title="Not available for this persona" description="AI runtime activity requires the Monitor AI runtime activity capability." />;
  }
  const db = getDataset();
  const runs = [...db.aiInteractions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-6">
      <SummaryStrip
        items={[
          { label: "Inference runs", value: runs.length, hint: "offline mock" },
          { label: "Provider", value: "Mock", hint: "no external calls" },
          { label: "Grounded in evidence", value: `${runs.length}/${runs.length}`, hint: "evidence-linked" },
          { label: "Prompt versions", value: db.promptVersions.length, hint: "versioned" },
        ]}
      />
      <QueueSection
        title="Inference Ledger"
        count={runs.length}
        description="These are model/inference calls made by the mock deterministic explainer — not autonomous or tool-using agent executions. No agent runs are recorded in Phase 2A."
      >
        <Table caption="Inference ledger">
          <THead>
            <TRow>
              <Th>When</Th>
              <Th>Provider / model</Th>
              <Th>Use case</Th>
              <Th numeric>Tokens</Th>
              <Th>Evidence</Th>
            </TRow>
          </THead>
          <TBody>
            {runs.map((i) => (
              <TRow key={i.id}>
                <Td className="whitespace-nowrap text-text-secondary">{fmtDateTime(i.createdAt)}</Td>
                <Td><ModelBadge provider={i.provider} model={i.model} /></Td>
                <Td className="max-w-[240px] text-text-secondary">{i.useCase}</Td>
                <Td numeric>{fmtNumber(i.inputTokens + i.outputTokens)}</Td>
                <Td className="tabular-nums text-text-secondary">{i.evidenceIds.length} items</Td>
              </TRow>
            ))}
          </TBody>
        </Table>
      </QueueSection>
    </div>
  );
}

function ValueCost({ canView }: { canView: boolean }) {
  if (!canView) {
    return <EmptyWorkspace title="Not available for this persona" description="Token economics requires the View token economics capability." />;
  }
  const { metrics, byProvider, interactions } = getRepository().getRots();
  const db = getDataset();
  const decisionByRec = new Map(db.humanDecisions.map((d) => [d.recommendationId, d]));
  const outcomeByRec = new Map(db.operationalOutcomes.map((o) => [o.recommendationId, o]));

  return (
    <div className="space-y-6">
      <ReturnOnTokenSpend
        actualCostUsd={metrics.actualCostUsd}
        actualProvider={metrics.actualProvider}
        estimatedInferenceCostUsd={metrics.estimatedInferenceCostUsd}
        valueAtStakeUsd={metrics.valueAtStakeUsd}
        projectedValueEnabledUsd={metrics.projectedValueEnabledUsd}
        realisedValueUsd={metrics.realisedValueUsd}
        realisedAvailable={metrics.realisedAvailable}
        showNarrative
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Acceptance rate" value={fmtPercent(metrics.acceptanceRate ?? 0, 0)} footnote={`${metrics.acceptedCount}/${metrics.decidedCount} decided`} />
        <MetricCard label="Accepted outcome" value="Pending" footnote={`${metrics.pendingOutcomeCount} awaiting validation`} />
        <MetricCard label="Projected / 1k tok" value={metrics.projectedValuePer1kTokens === null ? "—" : `$${fmtNumber(metrics.projectedValuePer1kTokens)}`} footnote="projected" />
        <MetricCard label="Realised / 1k tok" value={metrics.realisedValuePer1kTokens === null ? "Not yet available" : `$${fmtNumber(metrics.realisedValuePer1kTokens)}`} footnote="after validation" />
      </div>

      <QueueSection title="Estimated provider scenarios" description="Comparison only — priced on actual tokens; never added to actual totals.">
        <Table caption="Estimated scenarios">
          <THead><TRow><Th>Scenario</Th><Th>Accounting</Th><Th numeric>Est. cost</Th></TRow></THead>
          <TBody>
            {metrics.estimatedScenarios.map((s) => (
              <TRow key={s.provider + s.model}>
                <Td>{s.label}</Td>
                <Td><span className="rounded border border-attention-border bg-attention-subtle px-1.5 py-0.5 text-[11px] font-medium text-attention-text">Estimated scenario</span></Td>
                <Td numeric>{fmtCost(s.costUsd)}</Td>
              </TRow>
            ))}
          </TBody>
        </Table>
      </QueueSection>

      <QueueSection title="Interaction ledger" count={interactions.length}>
        <Table caption="Interaction ledger">
          <THead><TRow><Th>When</Th><Th>Provider</Th><Th>Accounting</Th><Th numeric>Cost</Th><Th>Outcome</Th></TRow></THead>
          <TBody>
            {interactions.map((i) => {
              const outcome = i.recommendationId ? outcomeByRec.get(i.recommendationId) : undefined;
              const decision = i.recommendationId ? decisionByRec.get(i.recommendationId) : undefined;
              return (
                <TRow key={i.id}>
                  <Td className="whitespace-nowrap text-text-secondary">{fmtDateTime(i.createdAt)}</Td>
                  <Td><ModelBadge provider={i.provider} model={i.model} /></Td>
                  <Td><span className="rounded border border-healthy-border bg-healthy-subtle px-1.5 py-0.5 text-[11px] font-medium text-healthy-text">Actual</span></Td>
                  <Td numeric>{fmtCost(i.estimatedCostUsd)}</Td>
                  <Td className="text-xs text-text-muted">{outcome ? "Pending validation" : decision ? decision.decision : "Awaiting decision"}</Td>
                </TRow>
              );
            })}
          </TBody>
        </Table>
        <p className="px-4 pb-3 pt-1 text-xs text-text-muted">Actual usage by provider: {byProvider.map((p) => `${p.provider} (${p.interactions})`).join(", ")}.</p>
      </QueueSection>
    </div>
  );
}

function ModelRuntime({ canConfigure }: { canConfigure: boolean }) {
  const providers = [
    { id: "mock", label: "Mock (offline)", status: "Active", model: "mock/deterministic-explainer", note: "Default — deterministic, $0, no key" },
    { id: "nvidia", label: "NVIDIA (OpenAI-compatible)", status: "Configured, inactive", model: "meta/llama-3.1-70b-instruct", note: "Optional integration — requires API key" },
    { id: "dgxspark", label: "DGX Spark (self-hosted)", status: "Not configured", model: "—", note: "Future self-hosted runtime" },
  ];
  return (
    <div className="space-y-6">
      {!canConfigure ? (
        <ReadOnlyNotice reason="Read-only: configuring the model runtime requires the Configure model runtime capability (AI Control Tower Administrator)." />
      ) : null}
      <QueueSection
        title="Model runtime"
        description="Provider-neutral runtime. The active provider is selected by the AI_PROVIDER environment variable; the app defaults to the offline mock."
        actions={
          <RestrictedAction capability="configure_model_runtime">
            <button className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-elevated">Configure</button>
          </RestrictedAction>
        }
      >
        <Table caption="Model runtime providers">
          <THead><TRow><Th>Provider</Th><Th>Model</Th><Th>Status</Th><Th>Notes</Th></TRow></THead>
          <TBody>
            {providers.map((p) => (
              <TRow key={p.id}>
                <Td className="font-medium">{p.label}</Td>
                <Td className="font-mono text-xs">{p.model}</Td>
                <Td className="text-text-secondary">{p.status}</Td>
                <Td className="text-text-muted">{p.note}</Td>
              </TRow>
            ))}
          </TBody>
        </Table>
      </QueueSection>
    </div>
  );
}
