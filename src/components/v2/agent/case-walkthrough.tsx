"use client";

import { cn } from "@/lib/cn";
import { formatUtcInstant } from "@/v2/reliability/view-types";
import type {
  AgentGenerationStatus,
  Citation,
  ClaimKind,
  GovernedAgentResponse,
} from "@/agent/types";

/**
 * K-201 governed Case Investigator — pure five-stage presentation.
 *
 * This module is browser-safe and hook-free: it renders an already-validated
 * `GovernedAgentResponse` into the continuous operational thread
 *   Signal → Evidence → Risk → Recommendation → Human authority
 * using only client-safe types and pure formatting helpers. It performs no
 * fetch, holds no state, and exposes no approve / endorse / schedule / reserve
 * control. Every governed claim is placed in exactly one stage, so nothing is
 * duplicated and nothing is dropped.
 */

export type StageId =
  | "signal"
  | "evidence"
  | "risk"
  | "recommendation"
  | "authority";

export const CASE_STAGES: readonly {
  id: StageId;
  index: number;
  label: string;
  blurb: string;
}[] = [
  { id: "signal", index: 1, label: "Signal", blurb: "What changed on K-201" },
  { id: "evidence", index: 2, label: "Evidence", blurb: "The governed facts and their sources" },
  { id: "risk", index: 3, label: "Risk", blurb: "What it means for reliability" },
  { id: "recommendation", index: 4, label: "Recommendation", blurb: "The governed next step — restated, never created" },
  { id: "authority", index: 5, label: "Human authority", blurb: "Who must decide" },
];

const CLAIM_KIND_STAGE: Record<ClaimKind, StageId> = {
  condition: "signal",
  summary: "signal",
  value: "evidence",
  reliability: "risk",
  oee: "risk",
  materials: "recommendation",
  turnaround: "recommendation",
  lifecycle: "recommendation",
  recommendation: "recommendation",
  authority: "authority",
};

export function stageForClaimKind(kind: ClaimKind): StageId {
  return CLAIM_KIND_STAGE[kind];
}

/**
 * The single source of truth for the provider/fallback status line. The label is
 * keyed off the governed generation status — never the raw provider name — so a
 * governed fallback never reads as a failure.
 */
export function providerStatusLabel(status: AgentGenerationStatus): string {
  switch (status) {
    case "provider_grounded":
      return "Live provider narrative · governed and citation-validated";
    case "provider_rejected_fallback":
      return "Governed fallback · live provider response was not used";
    case "deterministic":
    default:
      return "Governed deterministic narrative";
  }
}

function statusTone(status: AgentGenerationStatus): string {
  return status === "provider_grounded"
    ? "bg-brand-subtle text-brand-text ring-border"
    : "bg-elevated text-text-secondary ring-border";
}

export function CaseWalkthrough({
  response,
}: {
  response: GovernedAgentResponse;
}) {
  const citationNumber = new Map<string, number>();
  response.citations.forEach((c, i) => citationNumber.set(c.id, i + 1));

  const claimsByStage = new Map<StageId, GovernedAgentResponse["claims"][number][]>();
  for (const claim of response.claims) {
    const stage = stageForClaimKind(claim.kind);
    const list = claimsByStage.get(stage) ?? [];
    list.push(claim);
    claimsByStage.set(stage, list);
  }

  const stageHasContent = (id: StageId): boolean => {
    if ((claimsByStage.get(id) ?? []).length > 0) return true;
    if (id === "evidence") return response.citations.length > 0;
    if (id === "recommendation") return response.proposedIntervention !== null;
    if (id === "authority") return response.authorityHandoff !== null;
    return false;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-medium ring-1",
            statusTone(response.generationStatus),
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {providerStatusLabel(response.generationStatus)}
        </span>
        <span className="text-[11px] text-text-muted">
          Read-only · investigates governed evidence, never acts
        </span>
      </div>

      <ExecutiveDecisionStrip response={response} />

      <p className="text-sm leading-relaxed text-text-primary">
        {response.situationSummary}
      </p>

      <ol className="relative space-y-0">
        {CASE_STAGES.filter((stage) => stageHasContent(stage.id)).map((stage) => (
          <li
            key={stage.id}
            className={cn(
              "relative pl-10 pb-5 last:pb-0",
              stage.id !== "authority" &&
                "before:absolute before:bottom-0 before:left-[10px] before:top-6 before:w-px before:bg-border",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-0 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                stage.id === "authority"
                  ? "border-brand bg-brand text-text-inverted"
                  : "border-brand bg-brand-subtle text-brand-text",
              )}
            >
                {stage.index}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-primary">
                {stage.label}
              </div>
              <div className="mt-0.5 text-[11px] text-text-muted">{stage.blurb}</div>
              <div
                className={cn(
                  "mt-2 space-y-3",
                  stage.id === "authority" &&
                    "rounded-md border border-brand bg-brand-subtle p-3.5",
                )}
              >
                <ol className="space-y-2">
                {(claimsByStage.get(stage.id) ?? []).map((claim) => (
                  <li
                    key={claim.id}
                    className="text-sm leading-relaxed text-text-secondary"
                  >
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

                <StageEvidence
                  stage={stage.id}
                  claims={claimsByStage.get(stage.id) ?? []}
                  citations={response.citations}
                  numberOf={citationNumber}
                />

                {stage.id === "recommendation" && response.proposedIntervention ? (
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
                    {response.proposedIntervention.statusLabel} · the agent
                    restates this record and never creates or changes it.
                  </div>
                  </div>
                ) : null}

                {stage.id === "authority" && response.authorityHandoff ? (
                  <div className="space-y-2">
                  <div className="text-sm text-text-primary">
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-sm border border-border bg-elevated px-2 py-1 text-[11px] font-medium text-text-secondary">
                      {response.authorityHandoff.routeLabel}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {response.authorityHandoff.readOnlyNotice}
                    </span>
                  </div>
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {response.missingEvidence.length > 0 ? (
        <DisclosureList
          title="Missing or withheld evidence"
          items={response.missingEvidence}
        />
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
              <li
                key={`${r.name}-${r.formulaVersion}`}
                className="flex justify-between gap-4 py-0.5"
              >
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

function ExecutiveDecisionStrip({
  response,
}: {
  response: GovernedAgentResponse;
}) {
  const findValue = ({
    labelPatterns = [],
    idPatterns = [],
  }: {
    labelPatterns?: readonly string[];
    idPatterns?: readonly string[];
  }) => {
    const byId = response.citations.find((item) =>
      idPatterns.some((pattern) => item.id.toLowerCase().includes(pattern)),
    );
    const citation =
      byId ??
      response.citations.find((item) =>
        labelPatterns.some((pattern) =>
          item.label.toLowerCase().includes(pattern),
        ),
      );
    return citation?.value ?? null;
  };

  const timeToCritical = findValue({
    labelPatterns: ["time to critical", "projected days to critical"],
    idPatterns: [":horizon:failure"],
  });
  const spareLead = findValue({
    labelPatterns: ["spare lead", "lead time", "seal lead"],
    idPatterns: [":horizon:lead"],
  });
  const turnaroundWindow = findValue({
    labelPatterns: ["days until turnaround"],
    idPatterns: [":horizon:turnaround"],
  });
  const exposure = findValue({
    labelPatterns: ["decision exposure"],
    idPatterns: [":exposure"],
  });
  const hasTimeline = timeToCritical && spareLead && turnaroundWindow;

  if (!hasTimeline && !exposure) return null;

  return (
    <section className="rounded-md border border-border bg-elevated px-3.5 py-3" aria-label="Executive decision view">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        Executive decision view
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {hasTimeline ? (
          <div className="rounded-sm border border-critical-border bg-critical-subtle px-3 py-2.5 sm:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-critical-text">
              Governed time conflict
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-text-primary">
              <span className="tabular-nums text-critical-text">{timeToCritical} to critical</span>
              <span aria-hidden className="text-text-muted">&lt;</span>
              <span className="tabular-nums text-attention-text">{spareLead} spare lead time</span>
              <span aria-hidden className="text-text-muted">&lt;</span>
              <span className="tabular-nums text-brand-text">{turnaroundWindow} turnaround window</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              The governed records show why a lead-time fit is not a licence to wait.
            </p>
          </div>
        ) : null}
        {exposure ? (
          <div className="rounded-sm border border-border bg-surface px-3 py-2.5 sm:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Decision exposure
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">{exposure}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">Governed value at risk this decision governs.</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StageEvidence({
  stage,
  claims,
  citations,
  numberOf,
}: {
  stage: StageId;
  claims: readonly GovernedAgentResponse["claims"][number][];
  citations: readonly Citation[];
  numberOf: Map<string, number>;
}) {
  const ids = new Set(claims.flatMap((claim) => claim.citationIds));
  const relevant = citations.filter((citation) => ids.has(citation.id));
  if (relevant.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {relevant.map((citation) => (
          <a
            key={citation.id}
            href={`#k201-cite-${numberOf.get(citation.id) ?? 0}`}
            className="rounded-sm border border-border bg-elevated px-2 py-1 text-[10px] font-medium text-brand-text hover:border-border-strong"
          >
            {numberOf.get(citation.id)} · {citation.label}: {citation.value}
          </a>
        ))}
      </div>
      {stage === "evidence" ? (
        <details className="rounded-md border border-border bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-text-secondary">
            View all evidence used ({citations.length})
          </summary>
          <div className="border-t border-border px-3 py-2">
            <Citations citations={citations} numberOf={numberOf} />
          </div>
        </details>
      ) : null}
    </div>
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
        Cited sources
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
              <span className="mt-0.5 shrink-0 font-medium text-brand-text">
                {n}
              </span>
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
          {r.label}:{" "}
          <span className="tabular-nums text-text-secondary">
            {formatUtcInstant(r.value)}
          </span>
        </span>
      ))}
    </div>
  );
}

function DisclosureList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
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
