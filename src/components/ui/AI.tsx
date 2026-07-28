import type { ReactNode } from "react";
import type { AiInteraction } from "@/domain/types";
import type { AiProviderId } from "@/domain/enums";
import { cn } from "@/lib/cn";
import { fmtCost, fmtCurrency, fmtDateTime, fmtNumber, fmtTokens } from "@/lib/format";

const PROVIDER_LABEL: Record<AiProviderId, string> = {
  mock: "Mock (offline)",
  nvidia: "NVIDIA",
  dgxspark: "DGX Spark",
};

export function ModelBadge({
  provider,
  model,
}: {
  provider: AiProviderId;
  model: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-ai-border bg-ai-subtle px-2 py-0.5 text-xs font-medium text-ai-text">
      <span aria-hidden>✦</span>
      <span>{PROVIDER_LABEL[provider]}</span>
      <span className="text-ai/70">·</span>
      <span className="font-mono text-[11px]">{model}</span>
    </span>
  );
}

export function TokenUsage({
  input,
  output,
}: {
  input: number;
  output: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-text-secondary">
      <span title="Input tokens">
        <span className="text-text-muted">in</span> {fmtTokens(input)}
      </span>
      <span title="Output tokens">
        <span className="text-text-muted">out</span> {fmtTokens(output)}
      </span>
      <span className="text-text-muted">({fmtNumber(input + output)} tok)</span>
    </span>
  );
}

export function CostBreakdown({
  interaction,
}: {
  interaction: Pick<AiInteraction, "inputTokens" | "outputTokens" | "estimatedCostUsd" | "latencyMs">;
}) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs">
      <Stat label="Tokens" value={fmtNumber(interaction.inputTokens + interaction.outputTokens)} />
      <Stat label="Est. cost" value={fmtCost(interaction.estimatedCostUsd)} />
      <Stat label="Latency" value={`${fmtNumber(interaction.latencyMs)} ms`} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-border bg-elevated px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="tabular-nums font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

/** Legend that makes the deterministic-vs-AI distinction explicit. */
export function DeterministicVsAIIndicator() {
  const items = [
    { symbol: "∑", label: "Deterministic calculation", cls: "text-brand-text" },
    { symbol: "⚖", label: "Business rule", cls: "text-info-text" },
    { symbol: "≈", label: "Statistical prediction", cls: "text-attention-text" },
    { symbol: "✦", label: "AI explanation", cls: "text-ai-text" },
    { symbol: "☑", label: "Human decision", cls: "text-healthy-text" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {items.map((it) => (
        <span key={it.label} className={cn("inline-flex items-center gap-1.5", it.cls)}>
          <span aria-hidden className="font-semibold">
            {it.symbol}
          </span>
          <span className="text-text-secondary">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * AI insight card — renders an AI-generated explanation with the full trust
 * pattern: clearly labelled as AI, grounded-in-evidence note, model/provider,
 * tokens, cost, latency, timestamp, and an explicit "requires human approval"
 * reminder. It never presents the text as an autonomous action.
 */
export function AIInsightCard({
  text,
  interaction,
  footer,
}: {
  text: string;
  interaction: AiInteraction;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-ai-border bg-ai-subtle/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ai-border bg-ai-subtle px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ai-text">
          <span aria-hidden>✦</span> AI-generated explanation
        </span>
        <ModelBadge provider={interaction.provider} model={interaction.model} />
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-sm leading-relaxed text-text-primary">{text}</p>
        <p className="text-[11px] italic text-text-muted">
          Grounded only in the evidence below. This explanation restates deterministic findings;
          it does not assert its own confidence. It is advisory and requires human approval — not
          an autonomous control action.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] text-text-muted">{fmtDateTime(interaction.createdAt)}</span>
        </div>
        <CostBreakdown interaction={interaction} />
        {footer}
      </div>
    </div>
  );
}

/**
 * Return on Token Spend summary.
 *
 * Enforces the honest framing: ACTUAL inference cost (offline mock, $0.00) is
 * shown separately from an ESTIMATED provider scenario; VALUE AT STAKE is
 * labelled as exposure under decision (not value created by AI); and REALISED
 * value reads "Not yet available" until a validated outcome exists.
 */
export function ReturnOnTokenSpend({
  actualCostUsd,
  actualProvider,
  estimatedInferenceCostUsd,
  valueAtStakeUsd,
  projectedValueEnabledUsd,
  realisedValueUsd,
  realisedAvailable,
  showNarrative = false,
}: {
  actualCostUsd: number;
  actualProvider: AiProviderId;
  estimatedInferenceCostUsd: number;
  valueAtStakeUsd: number;
  projectedValueEnabledUsd: number;
  realisedValueUsd: number;
  realisedAvailable: boolean;
  showNarrative?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showNarrative ? (
        <p className="text-sm text-text-primary">
          <span className="font-semibold tabular-nums">{fmtCost(estimatedInferenceCostUsd)}</span>{" "}
          estimated inference cost supporting a decision with{" "}
          <span className="font-semibold tabular-nums">{fmtCurrency(valueAtStakeUsd)}</span> at stake.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Actual inference cost"
          value={fmtCost(actualCostUsd)}
          tone="neutral"
          note={`${PROVIDER_LABEL[actualProvider]} · actual`}
        />
        <Tile
          label="Estimated provider cost"
          value={fmtCost(estimatedInferenceCostUsd)}
          tone="brand"
          note="estimated scenario"
        />
        <Tile
          label="Value at stake"
          value={fmtCurrency(valueAtStakeUsd, "USD", true)}
          tone="attention"
          note="exposure under decision"
        />
        <Tile
          label="Realised value"
          value={realisedAvailable ? fmtCurrency(realisedValueUsd, "USD", true) : "Not yet available"}
          tone={realisedAvailable ? "healthy" : "muted"}
          note={realisedAvailable ? "validated outcomes" : "pending validated outcome"}
        />
      </div>
      {showNarrative ? (
        <p className="text-xs text-text-muted">
          Value at stake is not value created by AI. Realised value is recorded only after an
          approved action and a validated operational outcome. Projected value enabled:{" "}
          <span className="tabular-nums">{fmtCurrency(projectedValueEnabledUsd, "USD", true)}</span>.
        </p>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone: "neutral" | "attention" | "healthy" | "brand" | "muted";
}) {
  const toneCls: Record<string, string> = {
    neutral: "text-text-primary",
    attention: "text-attention-text",
    healthy: "text-healthy-text",
    brand: "text-brand-text",
    muted: "text-text-muted",
  };
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", toneCls[tone])}>{value}</div>
      {note ? <div className="text-[10px] text-text-muted">{note}</div> : null}
    </div>
  );
}
