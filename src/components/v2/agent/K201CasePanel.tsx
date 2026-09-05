"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { SectionCard } from "@/components/v2/reliability/primitives";
import { formatUtcInstant } from "@/v2/reliability/view-types";
import {
  AGENT_QUESTIONS,
  type AgentQuestionId,
  type Citation,
  type GovernedAgentResponse,
} from "@/agent/types";

/**
 * K-201 governed case investigator — client panel.
 *
 * This is the ONLY agent surface the browser loads. It imports ONLY the
 * client-safe contract (`@/agent/types`) and pure presentation helpers; it never
 * imports a server module, a read model, a provider, or the authority-mutation
 * seam. It calls the governed API, which resolves persona, evidence and provider
 * on the server. The panel is strictly read-only: it renders citations,
 * authority requirements and a restated existing recommendation, and exposes no
 * approve/endorse/schedule/reserve control whatsoever.
 */

type PanelState =
  | { kind: "idle" }
  | { kind: "loading"; questionId: AgentQuestionId }
  | { kind: "error"; message: string }
  | { kind: "ready"; response: GovernedAgentResponse };

export function K201CasePanel() {
  const [state, setState] = useState<PanelState>({ kind: "idle" });

  async function ask(questionId: AgentQuestionId) {
    setState({ kind: "loading", questionId });
    try {
      const res = await fetch("/api/agent/k201-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      if (!res.ok) {
        setState({ kind: "error", message: "The governed investigator could not respond." });
        return;
      }
      const response = (await res.json()) as GovernedAgentResponse;
      setState({ kind: "ready", response });
    } catch {
      setState({ kind: "error", message: "The governed investigator is unavailable." });
    }
  }

  const activeQuestion = state.kind === "loading" ? state.questionId : undefined;
  const readyQuestion = state.kind === "ready" ? state.response.questionId : undefined;

  return (
    <SectionCard
      eyebrow="Governed case investigator · read-only"
      title="Ask about K-201"
      aside="Investigates evidence · cites sources · routes to human authority"
    >
      <p className="text-xs text-text-secondary">
        This assistant investigates governed evidence and explains it. It never approves,
        endorses, schedules, reserves or changes anything — every decision stays with the
        accountable human.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {AGENT_QUESTIONS.map((q) => {
          const selected = q.id === activeQuestion || q.id === readyQuestion;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => ask(q.id)}
              disabled={state.kind === "loading"}
              aria-pressed={selected}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                selected
                  ? "border-brand bg-brand-subtle text-brand-text"
                  : "border-border bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
                state.kind === "loading" && !selected && "opacity-60",
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {state.kind === "idle" ? (
          <p className="text-sm text-text-muted">
            Choose a question to open the governed K-201 case.
          </p>
        ) : null}
        {state.kind === "loading" ? (
          <p className="text-sm text-text-secondary" role="status">
            Investigating governed evidence…
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className="text-sm text-critical-text" role="alert">
            {state.message}
          </p>
        ) : null}
        {state.kind === "ready" ? <CaseAnswer response={state.response} /> : null}
      </div>
    </SectionCard>
  );
}

function CaseAnswer({ response }: { response: GovernedAgentResponse }) {
  const citationNumber = new Map<string, number>();
  response.citations.forEach((c, i) => citationNumber.set(c.id, i + 1));

  const grounded = response.generationStatus === "provider_grounded";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProviderBadge label={response.providerDisplay} grounded={grounded} />
        {!grounded ? (
          <span className="text-[11px] text-text-muted">
            {response.generationStatus === "provider_rejected_fallback"
              ? "The model answer failed governance checks — showing the deterministic governed answer."
              : "Deterministic governed answer."}
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-text-primary">{response.situationSummary}</p>

      <ol className="space-y-2">
        {response.claims.map((claim) => (
          <li key={claim.id} className="text-sm leading-relaxed text-text-secondary">
            <span>{claim.text}</span>
            {claim.citationIds.length > 0 ? (
              <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
                {claim.citationIds.map((id) => {
                  const n = citationNumber.get(id);
                  if (!n) return null;
                  return (
                    <a
                      key={id}
                      href={`#k201-cite-${n}`}
                      className="rounded-sm bg-elevated px-1 text-[10px] font-medium text-brand-text ring-1 ring-border"
                    >
                      {n}
                    </a>
                  );
                })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {response.proposedIntervention ? (
        <div className="rounded-md border border-border bg-elevated p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Existing governed recommendation · restated, unmodified
          </div>
          <div className="mt-1 text-sm font-semibold text-text-primary">
            {response.proposedIntervention.title}
          </div>
          {response.proposedIntervention.summary ? (
            <p className="mt-1 text-xs text-text-secondary">
              {response.proposedIntervention.summary}
            </p>
          ) : null}
          <div className="mt-1.5 text-[11px] text-text-muted">
            {response.proposedIntervention.statusLabel} · the agent restates this record and
            never creates or changes it.
          </div>
        </div>
      ) : null}

      {response.authorityHandoff ? (
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Who must decide
          </div>
          <div className="mt-1 text-sm text-text-primary">
            {response.authorityHandoff.decisionStatusLabel}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            Next governed act:{" "}
            <span className="font-medium text-text-primary">
              {response.authorityHandoff.nextActLabel}
            </span>{" "}
            — {response.authorityHandoff.nextActPersonaName}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            {response.authorityHandoff.endorsementNote}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-sm border border-border bg-elevated px-2 py-1 text-[11px] font-medium text-text-secondary">
              {response.authorityHandoff.routeLabel}
            </span>
            <span className="text-[11px] text-text-muted">
              {response.authorityHandoff.readOnlyNotice}
            </span>
          </div>
        </div>
      ) : null}

      <Citations citations={response.citations} numberOf={citationNumber} />

      {response.missingEvidence.length > 0 ? (
        <DisclosureList title="Missing or withheld evidence" items={response.missingEvidence} />
      ) : null}
      {response.uncertainties.length > 0 ? (
        <DisclosureList title="Stated uncertainties" items={response.uncertainties} />
      ) : null}

      <Timestamps response={response} />

      {response.calculationReferences.length > 0 ? (
        <details className="rounded-md border border-border bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-secondary">
            Calculation provenance ({response.calculationReferences.length})
          </summary>
          <ul className="border-t border-border px-3 py-2 text-[11px] text-text-muted">
            {response.calculationReferences.map((r) => (
              <li key={`${r.name}-${r.formulaVersion}`} className="flex justify-between gap-4 py-0.5">
                <span>{r.name}</span>
                <span className="tabular-nums">{r.formulaVersion}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] text-text-muted">
            Formula identities are calculation provenance, not business metrics.
          </p>
        </details>
      ) : null}

      <details className="rounded-md border border-border bg-surface">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-secondary">
          What this agent will never do
        </summary>
        <ul className="border-t border-border px-3 py-2 text-[11px] text-text-muted">
          {response.prohibitedActions.map((p) => (
            <li key={p} className="py-0.5">
              · {p}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ProviderBadge({ label, grounded }: { label: string; grounded: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium ring-1",
        grounded
          ? "bg-brand-subtle text-brand-text ring-border"
          : "bg-elevated text-text-secondary ring-border",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

function Citations({
  citations,
  numberOf,
}: {
  citations: readonly Citation[];
  numberOf: Map<string, number>;
}) {
  if (citations.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Evidence
      </div>
      <ol className="mt-1.5 space-y-1.5">
        {citations.map((c) => {
          const n = numberOf.get(c.id) ?? 0;
          return (
            <li
              key={c.id}
              id={`k201-cite-${n}`}
              className="flex gap-2 rounded-sm border border-border bg-elevated px-2.5 py-1.5 text-xs"
            >
              <span className="mt-0.5 shrink-0 font-medium text-brand-text">{n}</span>
              <div className="min-w-0">
                <div className="text-text-primary">
                  <span className="font-medium">{c.label}:</span>{" "}
                  <span className="tabular-nums">{c.value}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  {c.provenance} · {c.sourceType}
                  {c.observedAt ? ` · ${formatUtcInstant(c.observedAt)}` : ""}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Timestamps({ response }: { response: GovernedAgentResponse }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Assessment as-of", value: response.timestamps.assessmentAsOf },
    { label: "Materials as-of", value: response.timestamps.materialsAsOf },
    { label: "Turnaround as-of", value: response.timestamps.turnaroundAsOf },
  ].filter((r) => r.value !== null);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-text-muted">
      {rows.map((r) => (
        <span key={r.label}>
          {r.label}: <span className="tabular-nums text-text-secondary">{formatUtcInstant(r.value)}</span>
        </span>
      ))}
    </div>
  );
}

function DisclosureList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {title}
      </div>
      <ul className="mt-1 space-y-1 text-xs text-text-secondary">
        {items.map((item) => (
          <li key={item}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}
