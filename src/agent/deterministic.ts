import "server-only";
import type { PersonaId } from "@/personas/types";
import { getPersona } from "@/personas/registry";
import type {
  AuthorityHandoff,
  Citation,
  Claim,
  GovernedAgentResponse,
  ProposedIntervention,
} from "./types";
import { AGENT_PROHIBITED_ACTIONS, AGENT_SUBJECT, providerDisplayLabel } from "./types";
import type { AgentToolName, ToolResult, ViewBundle } from "./tools";
import type { AgentQuestionId } from "./types";
import { trustLabel, freshnessLabel } from "@/v2/reliability/view-types";

/**
 * The deterministic governed narrator (server-only).
 *
 * Given the executed tool results and the memoised read models, it composes a
 * COMPLETE `GovernedAgentResponse` — the honest K-201 story — with zero model
 * involvement. Every number is read verbatim from a citation the tools produced;
 * nothing is recomputed. This is both the mandatory offline path and the exact
 * fallback used whenever a provider answer fails validation. Because it is
 * always fully valid, the system can safely discard any provider output.
 *
 * The narration reflects EXACTLY the evidence the viewing persona is entitled
 * to: a withheld tool becomes an honest "missing evidence" note, never a
 * fabricated claim.
 */

interface DeterministicInput {
  readonly viewerId: PersonaId;
  readonly requestId: string;
  readonly questionId: AgentQuestionId;
  readonly question: string;
  readonly toolResults: readonly ToolResult[];
  readonly views: ViewBundle;
  readonly generatedAt: string;
}

/** Indexes the gathered evidence so claims only ever cite what actually exists. */
class Evidence {
  readonly byId = new Map<string, Citation>();
  readonly available = new Set<AgentToolName>();
  readonly withheld = new Map<AgentToolName, string>();
  readonly ordered: Citation[] = [];

  constructor(results: readonly ToolResult[]) {
    for (const r of results) {
      if (r.available) {
        this.available.add(r.toolName);
        for (const c of r.citations) {
          if (!this.byId.has(c.id)) {
            this.byId.set(c.id, c);
            this.ordered.push(c);
          }
        }
      } else {
        this.withheld.set(r.toolName, r.unavailableReason ?? "Not permitted.");
      }
    }
  }

  has(tool: AgentToolName): boolean {
    return this.available.has(tool);
  }

  /** Return the citation ids that exist among the requested ids. */
  ids(...ids: string[]): string[] {
    return ids.filter((id) => this.byId.has(id));
  }

  /** All citation ids produced by a tool. */
  toolIds(tool: AgentToolName): string[] {
    return this.ordered.filter((c) => c.toolName === tool).map((c) => c.id);
  }

  value(id: string): string {
    return this.byId.get(id)?.value ?? "Unavailable";
  }
}

function claim(id: string, kind: Claim["kind"], text: string, citationIds: string[]): Claim {
  return { id, kind, text, citationIds };
}

export function buildDeterministicResponse(
  input: DeterministicInput,
): GovernedAgentResponse {
  const { viewerId, toolResults, views } = input;
  const persona = getPersona(viewerId);
  const evidence = new Evidence(toolResults);

  const reliability = views.reliability();
  const claims: Claim[] = [];
  const uncertainties: string[] = [];
  const missingEvidence: string[] = [];

  // --- Condition ---------------------------------------------------------
  if (evidence.has("get_asset_condition")) {
    const sensorIds = evidence.toolIds("get_asset_condition");
    claims.push(
      claim(
        "c-condition",
        "condition",
        `Condition monitoring on K-201 is deviating from its normal envelope: ${reliability.signal.headline}`,
        sensorIds,
      ),
    );
  } else if (evidence.withheld.has("get_asset_condition")) {
    missingEvidence.push(`Asset condition — ${evidence.withheld.get("get_asset_condition")}`);
  }

  // --- Reliability assessment + decision exposure ------------------------
  if (evidence.has("get_reliability_assessment")) {
    claims.push(
      claim(
        "c-assessment",
        "reliability",
        `The governed reliability assessment scores K-201 health at ${evidence.value(
          "get_reliability_assessment:health",
        )} and risk at ${evidence.value(
          "get_reliability_assessment:risk",
        )}, with an estimated time to critical of ${evidence.value(
          "get_reliability_assessment:ttc",
        )}.`,
        evidence.ids(
          "get_reliability_assessment:health",
          "get_reliability_assessment:risk",
          "get_reliability_assessment:ttc",
        ),
      ),
    );
    claims.push(
      claim(
        "c-exposure",
        "value",
        `Decision exposure for K-201 is ${evidence.value(
          "get_reliability_assessment:exposure",
        )} — the governed value at risk that this decision governs.`,
        evidence.ids("get_reliability_assessment:exposure"),
      ),
    );
    uncertainties.push(reliability.assessmentContext.note);
  } else if (evidence.withheld.has("get_reliability_assessment")) {
    missingEvidence.push(
      `Reliability assessment — ${evidence.withheld.get("get_reliability_assessment")}`,
    );
  }

  // --- Material readiness ------------------------------------------------
  if (evidence.has("get_material_readiness")) {
    claims.push(
      claim(
        "c-materials",
        "materials",
        `Work readiness is split: the bearing inspection (wo-1) is materials-ready, while the dry gas seal replacement (wo-2) is materials-blocked by a seal shortage.`,
        evidence.ids(
          "get_material_readiness:wo-1:readiness",
          "get_material_readiness:wo-2:readiness",
        ),
      ),
    );
  } else if (evidence.withheld.has("get_material_readiness")) {
    missingEvidence.push(`Material readiness — ${evidence.withheld.get("get_material_readiness")}`);
  }

  // --- Turnaround fit (not a licence to wait) ----------------------------
  if (evidence.has("get_turnaround_fit")) {
    const turnaround = views.turnaround();
    claims.push(
      claim(
        "c-turnaround",
        "turnaround",
        `The dry gas seal lead time is ${evidence.value(
          "get_turnaround_fit:horizon:lead",
        )} and the next turnaround is ${evidence.value(
          "get_turnaround_fit:horizon:turnaround",
        )} away, leaving ${evidence.value(
          "get_turnaround_fit:horizon:slack",
        )} of slack. A lead-time fit is NOT a licence to wait: ${turnaround.safeToWaitWarning}`,
        evidence.ids(
          "get_turnaround_fit:horizon:failure",
          "get_turnaround_fit:horizon:lead",
          "get_turnaround_fit:horizon:turnaround",
          "get_turnaround_fit:horizon:slack",
        ),
      ),
    );
  } else if (evidence.withheld.has("get_turnaround_fit")) {
    missingEvidence.push(`Turnaround fit — ${evidence.withheld.get("get_turnaround_fit")}`);
  }

  // --- OEE (line-level, not caused by K-201) -----------------------------
  if (evidence.has("get_oee_and_losses")) {
    const oee = views.oee();
    const oeeIds = evidence.toolIds("get_oee_and_losses");
    claims.push(
      claim(
        "c-oee",
        "oee",
        `OEE of ${oee.oee.display} is a ${oee.summary.lineLabel} line-level measure, not a K-201 asset metric. ${oee.assetContext.note}`,
        oeeIds,
      ),
    );
  } else if (evidence.withheld.has("get_oee_and_losses")) {
    missingEvidence.push(`OEE & losses — ${evidence.withheld.get("get_oee_and_losses")}`);
  }

  // --- Portfolio value context (value-realisation scope) -----------------
  if (evidence.has("get_value_context")) {
    const value = views.value();
    claims.push(
      claim(
        "c-value",
        "value",
        `In portfolio terms, value at stake is ${value.valueAtStake.display}, K-201 projected value enabled is ${value.k201Projected.display}, and realised value is ${value.realised.display}. ${value.realisedNotice}`,
        evidence.toolIds("get_value_context"),
      ),
    );
    uncertainties.push(value.realisedNotice);
  } else if (evidence.withheld.has("get_value_context")) {
    missingEvidence.push(
      `Portfolio value context is governed to the Value Realisation workspace — ${evidence.withheld.get(
        "get_value_context",
      )}`,
    );
  }

  // --- Authority (route to a human) --------------------------------------
  let authorityHandoff: AuthorityHandoff | null = null;
  if (evidence.has("get_decision_authority")) {
    const a = reliability.authority;
    claims.push(
      claim(
        "c-authority",
        "authority",
        `This is a governed decision: ${a.decisionStatusLabel}. The next governed act is ${a.nextActLabel} by the ${a.nextActPersonaName}. ${a.endorsementBanner}`,
        evidence.ids(
          "get_decision_authority:status",
          "get_decision_authority:next_act",
          "get_decision_authority:endorsement",
        ),
      ),
    );
    authorityHandoff = {
      decisionStatusLabel: a.decisionStatusLabel,
      nextActLabel: a.nextActLabel,
      nextActPersonaName: a.nextActPersonaName,
      endorsementRequired: a.endorsementRequired,
      endorsementNote: a.endorsementBanner,
      routeLabel: "View authority requirements",
      readOnlyNotice: a.readOnlyNotice,
    };
  } else if (evidence.withheld.has("get_decision_authority")) {
    missingEvidence.push(`Decision authority — ${evidence.withheld.get("get_decision_authority")}`);
  }

  // --- Lifecycle projection (derived, not history) -----------------------
  if (evidence.has("get_lifecycle_projection")) {
    const ids = evidence.toolIds("get_lifecycle_projection");
    if (ids.length > 0) {
      claims.push(
        claim(
          "c-lifecycle",
          "lifecycle",
          `A derived lifecycle projection shows the governed path if the decision proceeds. It is a forward projection, not a record of decisions that have occurred.`,
          ids,
        ),
      );
      uncertainties.push(
        "The lifecycle projection is a deterministic forward projection, not recorded history.",
      );
    }
  }

  // --- Decision audit (no human decision recorded) -----------------------
  if (evidence.has("get_decision_audit")) {
    const audit = reliability.decisionAudit;
    claims.push(
      claim(
        "c-audit",
        "authority",
        audit.entries.length === 0
          ? `${audit.emptyTitle}. ${audit.nextGovernedAction}`
          : `${audit.entries.length} governed human decision(s) are recorded in the audit trail.`,
        evidence.ids("get_decision_audit:status"),
      ),
    );
    if (audit.entries.length === 0) {
      missingEvidence.push(`${audit.emptyTitle} — ${audit.nextGovernedAction}`);
    }
  }

  // --- Existing recommendation, restated unmodified ----------------------
  let proposedIntervention: ProposedIntervention | null = null;
  const rec = reliability.recommendation;
  if (rec.available && rec.title) {
    proposedIntervention = {
      title: rec.title,
      summary: rec.summary ?? "",
      statusLabel: rec.statusLabel,
      isExistingRecommendation: true,
      mutates: false,
    };
  }

  // --- Withheld tools that were planned but not narrated above -----------
  for (const [tool, reason] of evidence.withheld) {
    const already = missingEvidence.some((m) => m.includes(reason));
    if (!already) missingEvidence.push(`${tool} — ${reason}`);
  }

  // --- Calculation provenance (formula identities only) ------------------
  const calcRefs = collectCalculationReferences(evidence, views);

  // --- Timestamps (persona-scoped) ---------------------------------------
  const assessmentAsOf = evidence.has("get_reliability_assessment")
    ? reliability.evaluatedAt
    : null;
  const materialsAsOf = evidence.has("get_material_readiness")
    ? views.materials().summary.evaluatedAt
    : null;
  const turnaroundAsOf = evidence.has("get_turnaround_fit")
    ? views.turnaround().summary.evaluatedAt
    : null;

  // --- Freshness / trust labels ------------------------------------------
  const trustLabels = new Set<string>();
  const freshnessLabels = new Set<string>();
  if (evidence.has("get_reliability_assessment")) {
    for (const m of reliability.assessmentMetrics) {
      trustLabels.add(m.trustLabel);
      freshnessLabels.add(m.freshnessLabel);
    }
  }
  if (evidence.has("get_oee_and_losses")) {
    const o = views.oee().oee;
    trustLabels.add(o.trustLabel);
    freshnessLabels.add(o.freshnessLabel);
  }
  if (evidence.has("get_value_context")) {
    const dx = views.value().decisionExposure;
    trustLabels.add(dx.trustLabel);
    freshnessLabels.add(dx.freshnessLabel);
  }
  // Guard against an empty set (a persona with no permitted governed metric).
  if (trustLabels.size === 0) trustLabels.add(trustLabel("unknown"));
  if (freshnessLabels.size === 0) freshnessLabels.add(freshnessLabel("unknown"));

  // --- Situation summary (question-scoped, value-derived) ----------------
  const situationSummary = buildSituationSummary(input.questionId, evidence, reliability);

  // A guaranteed non-empty claim set even for a maximally-restricted persona.
  if (claims.length === 0) {
    claims.push(
      claim(
        "c-restricted",
        "summary",
        `Your persona (${persona.displayName}) is not entitled to the governed evidence for this K-201 question. No claim can be grounded, and the agent will not speculate.`,
        [],
      ),
    );
  }

  return {
    requestId: input.requestId,
    question: input.question,
    questionId: input.questionId,
    provider: "mock",
    providerDisplay: providerDisplayLabel("mock"),
    model: "deterministic-governed-narrator.v1",
    generatedAt: input.generatedAt,
    viewer: { personaId: persona.id, personaName: persona.displayName },
    subject: { ...AGENT_SUBJECT },
    situationSummary,
    claims,
    citations: evidence.ordered,
    proposedIntervention,
    authorityHandoff,
    calculationReferences: calcRefs,
    timestamps: { assessmentAsOf, materialsAsOf, turnaroundAsOf },
    freshnessLabels: [...freshnessLabels],
    trustLabels: [...trustLabels],
    uncertainties: dedupe(uncertainties),
    missingEvidence: dedupe(missingEvidence),
    prohibitedActions: [...AGENT_PROHIBITED_ACTIONS],
    toolsExecuted: [...evidence.available],
    toolsWithheld: [...evidence.withheld].map(([toolName, reason]) => ({ toolName, reason })),
    generationStatus: "deterministic",
    deterministicFallback: true,
  };
}

function buildSituationSummary(
  questionId: AgentQuestionId,
  evidence: Evidence,
  reliability: ReturnType<ViewBundle["reliability"]>,
): string {
  const health = evidence.value("get_reliability_assessment:health");
  const risk = evidence.value("get_reliability_assessment:risk");
  const ttc = evidence.value("get_reliability_assessment:ttc");
  const base = `K-201 (${AGENT_SUBJECT.assetName}) is under a governed reliability review — health ${health}, risk ${risk}, time to critical ${ttc}.`;
  const tail: Record<AgentQuestionId, string> = {
    why_action_now:
      " The deviation, the seal lead time and the endorsement threshold together explain why a governed decision is needed now.",
    what_is_the_evidence:
      " The evidence below is drawn only from governed condition readings and the reliability assessment.",
    can_it_wait_for_turnaround:
      " Whether it can wait is decided by comparing the seal lead time and turnaround window against the time to critical.",
    what_is_blocking_the_work:
      " The work is gated by a dry gas seal shortage and the governed decision that has not yet been recorded.",
    who_must_decide:
      " Authority routes to the accountable humans; the agent only presents the requirement.",
    what_value_is_protected:
      " Decision exposure and portfolio value context frame what is protected by acting.",
    what_changed:
      " The condition trend, the derived lifecycle projection and the (empty) decision audit show what has and has not changed.",
  };
  return base + tail[questionId];
}

function collectCalculationReferences(
  evidence: Evidence,
  views: ViewBundle,
): { name: string; formulaVersion: string }[] {
  const seen = new Set<string>();
  const refs: { name: string; formulaVersion: string }[] = [];
  const add = (rows: readonly { label: string; formulaVersion: string }[]) => {
    for (const r of rows) {
      const key = `${r.label}|${r.formulaVersion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ name: r.label, formulaVersion: r.formulaVersion });
    }
  };
  if (evidence.has("get_reliability_assessment")) add(views.reliability().evidenceLineage);
  if (evidence.has("get_value_context")) add(views.value().evidenceLineage);
  if (evidence.has("get_oee_and_losses")) add(views.oee().evidenceLineage);
  if (evidence.has("get_turnaround_fit")) add(views.turnaround().evidenceLineage);
  if (evidence.has("get_material_readiness")) add(views.materials().evidenceLineage);
  return refs;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v && v.trim().length > 0))];
}
