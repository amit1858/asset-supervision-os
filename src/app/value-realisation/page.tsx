import { AppShell } from "@/components/layout/AppShell";
import { EnterprisePageHeader, SummaryStrip, EmptyWorkspace } from "@/components/ui/enterprise";
import { QueueSection, RecordList } from "@/components/ui/queues";
import { EquipmentId } from "@/components/ui/Badge";
import { getRepository } from "@/data/repository";
import { getDataset } from "@/data/seed";
import { readOperationalContext } from "@/context/server";
import { personaCan } from "@/personas/registry";
import { fmtCurrency, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Leadership "Value Realisation" — restricted to validated outcomes, realised
 * value, decisions supported, and outstanding validation. It intentionally does
 * NOT expose token ledgers, prompt versions, provider pricing, or model-runtime
 * configuration (those live in the Agent Control Tower for the AI Administrator).
 */
export default function ValueRealisationPage() {
  const { personaId } = readOperationalContext();
  const canView = personaCan(personaId, "view_value_realisation");

  const { metrics } = getRepository().getRots();
  const db = getDataset();
  const assetById = new Map(db.assets.map((a) => [a.id, a]));

  const validated = db.operationalOutcomes.filter((o) => o.valueStatus === "realised");
  const outstanding = db.operationalOutcomes.filter((o) => o.valueStatus !== "realised");
  const decisionsSupported = db.humanDecisions.length;

  const outstandingRows = outstanding.map((o) => {
    const asset = assetById.get(o.assetId);
    return {
      id: o.id,
      ref: asset ? <EquipmentId tag={asset.tag} size="sm" /> : undefined,
      primary: o.description,
      secondary: `Projected ${fmtCurrency(o.estimatedValue, o.currency, true)} · recorded ${fmtDate(o.recordedAt)}`,
      trailing: <span className="text-xs font-medium text-attention-text">Awaiting validation</span>,
    };
  });

  return (
    <AppShell crumbs={[{ label: "Leadership" }, { label: "Value Realisation" }]}>
      <EnterprisePageHeader
        eyebrow="Plant Manager · leadership"
        title="Value Realisation"
        description="Validated operational outcomes and realised value. Realised value is recognised only after an approved action and a validated operational outcome."
      />
      <div className="mx-auto w-full max-w-content px-6 py-6">
        {!canView ? (
          <EmptyWorkspace title="Not available for this persona" description="Value Realisation requires the View value realisation capability." />
        ) : (
          <div className="space-y-6">
            <SummaryStrip
              items={[
                { label: "Realised value", value: metrics.realisedAvailable ? fmtCurrency(metrics.realisedValueUsd, "USD", true) : "Not yet available", emphasis: metrics.realisedAvailable ? "healthy" : "default" },
                { label: "Validated outcomes", value: validated.length, emphasis: validated.length > 0 ? "healthy" : "default" },
                { label: "Decisions supported", value: decisionsSupported },
                { label: "Outstanding validation", value: outstanding.length, emphasis: "attention" },
                { label: "Projected value enabled", value: fmtCurrency(metrics.projectedValueEnabledUsd, "USD", true), hint: "if executed" },
                { label: "Value at stake", value: fmtCurrency(metrics.valueAtStakeUsd, "USD", true), emphasis: "critical" },
              ]}
            />

            <QueueSection title="Validated outcomes" count={validated.length}>
              {validated.length === 0 ? (
                <div className="p-2">
                  <EmptyWorkspace title="No validated outcomes yet" description="No operational outcome has been validated in the current state, so realised value is not yet available." />
                </div>
              ) : (
                <RecordList rows={validated.map((o) => ({ id: o.id, primary: o.description, secondary: fmtCurrency(o.realisedValue ?? 0, o.currency) }))} />
              )}
            </QueueSection>

            <QueueSection title="Outstanding validation" count={outstanding.length} description="Approved actions whose operational outcome has not yet been validated.">
              <RecordList rows={outstandingRows} empty="Nothing outstanding." />
            </QueueSection>

            <p className="text-xs text-text-muted">
              Token ledgers, prompt versions, provider pricing, and model-runtime configuration are
              governed in the Agent Control Tower by the AI Control Tower Administrator — not shown here.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
