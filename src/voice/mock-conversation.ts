import "server-only";
import type {
  BriefConversationProvider,
  ProposedVoiceAction,
  VoiceEvidenceReference,
  VoiceQuery,
  VoiceScope,
  VoiceTurn,
} from "./types";
import type { BriefEvidence, PersonaBrief } from "@/brief/types";
import type { Provenance } from "@/domain/enums";
import { buildPersonaBrief } from "@/brief/service";
import { fmtCurrency, fmtDate } from "@/lib/format";

/**
 * Deterministic, offline conversation provider. It answers ONLY from the
 * governed Chief of Staff brief (the single truth path) — it summarises facts
 * and never invents them. Operational requests are converted into proposed
 * actions that require explicit confirmation; voice never executes anything.
 */
export class MockBriefConversationProvider implements BriefConversationProvider {
  readonly id = "mock-brief-conversation";

  answer(query: VoiceQuery, scope: VoiceScope): VoiceTurn {
    const brief = buildPersonaBrief(scope.personaId, { assetTag: scope.assetTag });
    const q = query.text.toLowerCase();
    const pool = evidencePool(brief);
    const sources = brief.sources;
    const asset = scope.assetTag ?? "K-201";

    // 1) Operational action requests → PROPOSED action (never executed).
    const action = detectAction(q);
    if (action) {
      const ev = pickEv(pool, actionEvidenceKeys(action));
      return assistant(
        query.text,
        "That is an operational action, so I can't perform it. I've prepared it for your explicit confirmation and it requires the right authority.",
        ev.length ? ev : pool.slice(0, 1),
        sources,
        { proposedAction: action },
      );
    }

    const dec = brief.decisions[0] ?? null;
    const topAction = [...brief.actions].sort((a, b) => a.priority - b.priority)[0] ?? null;
    const blocker = brief.blockers[0] ?? null;
    const mk = (text: string, ev: BriefEvidence[]) => assistant(query.text, text, ev, sources);

    // 2) Topic intents (grounded in the brief).
    if (/hand[- ]?over|handover/.test(q)) {
      const s = brief.unavailableSections.find((x) => /shift|handover/i.test(x)) ?? brief.unavailableSections[0] ?? "Shift log not connected";
      return assistant(query.text, "Handover items are not available from current sources.", [], sources, { unavailable: s });
    }
    if (/decision|approv|authorit/.test(q)) {
      if (dec) {
        const parts = [
          `${dec.title} — owner ${dec.owner.name}`,
          dec.dueBy ? `due ${fmtDate(dec.dueBy)}` : null,
          dec.valueAtStakeUsd != null ? `${fmtCurrency(dec.valueAtStakeUsd, "USD", true)} at stake` : null,
        ].filter(Boolean).join(", ");
        return mk(`${parts}. This requires your approval.`, dec.evidence);
      }
      return assistant(query.text, "No decision currently requires your approval in this brief.", [], sources, { unavailable: "No pending decision for this persona" });
    }
    if (/greatest value|value at stake|exposure|financial|\bstake\b/.test(q)) {
      const rv = brief.riskValue.find((r) => /value at stake|exposure/i.test(r.label)) ?? brief.riskValue[0];
      const ev = pickEv(pool, ["financial exposure", "risk score"]);
      if (rv) return mk(`The greatest value at stake is ${rv.value} on ${asset}, a deterministic exposure.`, ev.length ? ev : pool.slice(0, 1));
    }
    if (/morning|daily|update|briefing|\bbrief\b|what.*chang|summary/.test(q)) {
      const lead = dec ? ` The decision awaiting you: ${dec.title}.` : topAction ? ` Priority action: ${topAction.title}.` : "";
      const ev = dec?.evidence ?? topAction?.evidence ?? pickEv(pool, ["risk score", "projected"]);
      return mk(`${brief.summary.headline}${lead}`, ev.length ? ev : pool.slice(0, 1));
    }
    if (/operating response|this shift|respond/.test(q)) {
      if (topAction) return mk(`${topAction.title}. ${topAction.why}`, topAction.evidence);
    }
    if (/block|prevent|48 hour|dependen/.test(q)) {
      if (blocker) return mk(`Blocker: ${blocker.summary}. Depends on ${blocker.dependency}${blocker.detail ? ` — ${blocker.detail}` : ""}.`, blocker.evidence);
      return assistant(query.text, "No blocker is recorded in this brief.", [], sources, { unavailable: "No blocker recorded" });
    }
    if (/evidence|support|ground/.test(q)) {
      const ev = dec?.evidence ?? topAction?.evidence ?? pool.slice(0, 3);
      return mk(`The recommendation is grounded in: ${ev.map((e) => e.label).join("; ")}.`, ev.length ? ev : pool.slice(0, 1));
    }
    if (/trend|threshold|approach|vibration|temperature/.test(q)) {
      const ev = pickEv(pool, ["vibration", "projected"]);
      return mk("Overall vibration is above the warning band and trending toward the critical threshold.", ev.length ? ev : pool.slice(0, 2));
    }
    if (/work order|prepare|job plan|planning/.test(q)) {
      const a = brief.actions.find((x) => x.capability === "prepare_work_order") ?? topAction;
      if (a) return mk(`${a.title}. ${a.why}`, a.evidence);
    }
    if (/spare|material|expedit|inventory/.test(q)) {
      const a = brief.actions.find((x) => x.capability === "expedite_material");
      if (a) return mk(`${a.title}. ${a.why}`, a.evidence);
      if (blocker) return mk(`Work is blocked on materials: ${blocker.summary}. ${blocker.detail ?? ""}`, blocker.evidence);
    }
    if (/turnaround|scope|readiness/.test(q)) {
      const a = brief.actions.find((x) => x.capability === "modify_turnaround_scope") ?? topAction;
      if (a) return mk(`${a.title}. ${a.why}`, a.evidence);
    }
    if (/ai activity|inference|\bcost\b|model|token|actual.*estimated/.test(q)) {
      const cost = brief.riskValue.find((r) => /actual ai cost/i.test(r.label));
      const est = brief.riskValue.find((r) => /estimated/i.test(r.label));
      const parts = [
        cost ? `actual inference cost ${cost.value}` : null,
        est ? `estimated provider scenario ${est.value}` : null,
      ].filter(Boolean);
      if (parts.length) return mk(`AI activity is offline mock only: ${parts.join(", ")}.`, pickEv(pool, ["risk score"]).slice(0, 1).length ? pickEv(pool, ["risk score"]) : pool.slice(0, 1));
    }
    if (/urgent|why/.test(q)) {
      const ev = pickEv(pool, ["risk score", "projected", "vibration"]);
      return mk(`${brief.summary.headline}`, ev.length ? ev : pool.slice(0, 2));
    }

    // 3) Fallback — never fabricate.
    return assistant(
      query.text,
      `I can summarise your ${brief.title.toLowerCase()}: decisions, risks, blockers, evidence, and value. That specific information isn't available from current sources.`,
      [],
      sources,
      { unavailable: "Not available from current sources" },
    );
  }
}

// ---------------------------------------------------------------------------

function assistant(
  userText: string,
  text: string,
  ev: BriefEvidence[],
  sources: PersonaBrief["sources"],
  opts: { unavailable?: string; proposedAction?: ProposedVoiceAction } = {},
): VoiceTurn {
  const evidence = ev.map(toRef);
  const kinds: Provenance[] = Array.from(
    new Set([...evidence.map((e) => e.provenance), ...(opts.proposedAction ? (["human"] as Provenance[]) : [])]),
  );
  return {
    id: "a-" + hash(userText),
    role: "assistant",
    text,
    provenanceKinds: kinds,
    evidence,
    sources,
    unavailableNote: opts.unavailable ?? null,
    proposedAction: opts.proposedAction ?? null,
  };
}

function toRef(e: BriefEvidence): VoiceEvidenceReference {
  return { label: e.label, value: e.value, provenance: e.provenance, sourceType: e.sourceType, href: e.href ?? null };
}

function evidencePool(brief: PersonaBrief): BriefEvidence[] {
  const all: BriefEvidence[] = [
    ...brief.decisions.flatMap((d) => d.evidence),
    ...brief.actions.flatMap((a) => a.evidence),
    ...brief.blockers.flatMap((b) => b.evidence),
    ...brief.changes.flatMap((c) => c.evidence),
  ];
  const seen = new Set<string>();
  return all.filter((e) => (seen.has(e.label) ? false : (seen.add(e.label), true)));
}

function pickEv(pool: BriefEvidence[], keys: string[]): BriefEvidence[] {
  return pool.filter((e) => keys.some((k) => e.label.toLowerCase().includes(k)));
}

function detectAction(q: string): ProposedVoiceAction | null {
  if (/\bapprove\b|\breject\b|\bsign[ -]?off\b|\bauthoris?e the decision\b/.test(q)) {
    return { title: "Approve the K-201 intervention decision", targetType: "recommendation", targetId: "rec-k201", consequence: "Records a governed human decision on K-201. It does not itself change plant operation.", requiredCapability: "approve_reliability_decision", href: "/assets/K-201" };
  }
  if (/\bexpedite\b/.test(q)) {
    return { title: "Expedite the dry gas seal", targetType: "spare part", targetId: "DGS-38M9", consequence: "Raises an expedite request with Procurement for the 35-day-lead seal.", requiredCapability: "expedite_material", href: "/materials?asset=K-201" };
  }
  if (/\breduce (the )?(operating )?speed\b|\bissue (an )?(operating )?instruction\b/.test(q)) {
    return { title: "Issue an operating instruction to reduce K-201 speed", targetType: "asset", targetId: "K-201", consequence: "Proposes reducing operating speed to lower vibration; requires shift authority.", requiredCapability: "issue_operating_instruction", href: "/assets/K-201" };
  }
  if (/\b(prepare|create|raise) (a )?(work order|wo)\b/.test(q)) {
    return { title: "Prepare work order WO-48231", targetType: "work order", targetId: "WO-48231", consequence: "Prepares the inspection work order for scheduling.", requiredCapability: "prepare_work_order", href: "/planning?asset=K-201" };
  }
  if (/\b(add|modify|change) (the )?(turnaround )?scope\b|\badd .* to (the )?turnaround\b/.test(q)) {
    return { title: "Modify turnaround scope for K-201", targetType: "turnaround package", targetId: "WP-201-ROT", consequence: "Proposes a change to turnaround scope; requires turnaround authority.", requiredCapability: "modify_turnaround_scope", href: "/turnaround" };
  }
  return null;
}

function actionEvidenceKeys(a: ProposedVoiceAction): string[] {
  switch (a.requiredCapability) {
    case "approve_reliability_decision": return ["risk score", "financial exposure", "projected"];
    case "expedite_material": return ["spare"];
    case "issue_operating_instruction": return ["vibration", "projected"];
    case "prepare_work_order": return ["open work orders", "spare"];
    case "modify_turnaround_scope": return ["turnaround", "projected"];
    default: return ["risk score"];
  }
}

/** Deterministic djb2 hash → stable turn ids for the same query text. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}