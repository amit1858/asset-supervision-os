import "server-only";
import type {
  BriefAction,
  BriefBlocker,
  BriefChange,
  BriefDecision,
  BriefEvidence,
  BriefPeriod,
  BriefPeriodKind,
  BriefRiskValue,
  PersonaBrief,
} from "./types";
import { getRepository } from "@/data/repository";
import { personaCan } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import type { RecommendationEvidence } from "@/domain/types";
import { defaultSourceStates, type SourceKey } from "@/domain/integration";
import { fmtCost, fmtCurrency } from "@/lib/format";

const HERO = "K-201";

export interface BriefContext {
  assetTag?: string | null;
}

interface PersonaBriefConfig {
  title: string;
  period: BriefPeriod;
  headline: string;
  points: string[];
  actionIds: string[];
  decisionIds: string[];
  blockerIds: string[];
  changeIds: string[];
  riskValueIds: string[];
  sourceKeys: SourceKey[];
  unavailableSections: string[];
}

/**
 * Build a deterministic, persona-prioritised Chief-of-Staff brief from governed
 * seeded facts. Different personas receive a different PRIORITISATION of the
 * same K-201 facts. Every item carries evidence; approval decisions are included
 * only for personas authorised to make them; actions are filtered to the
 * persona's capabilities. Nothing is fabricated.
 */
export function buildPersonaBrief(personaId: PersonaId, ctx: BriefContext = {}): PersonaBrief {
  const repo = getRepository();
  const hero = repo.getAsset360(HERO);
  const rots = repo.getRots().metrics;
  const generatedAt = repo.getCommandCenter().generatedAt;

  // Map governed recommendation evidence → brief evidence (traceable).
  const pick = (needle: string): BriefEvidence => {
    const e =
      hero?.evidence.find((x) => x.label.toLowerCase().includes(needle)) ??
      ({ label: needle, value: "—", provenance: "deterministic", sourceType: "risk_engine", observedAt: null } as RecommendationEvidence);
    return {
      label: e.label,
      value: e.value,
      provenance: e.provenance,
      sourceType: e.sourceType,
      href: `/assets/${HERO}`,
      observedAt: e.observedAt,
    };
  };

  const eRisk = pick("risk score");
  const eProj = pick("projected");
  const eExposure = pick("financial exposure");
  const eVib = pick("vibration");
  const eSpare = pick("spare");
  const eOee = pick("recent oee");
  const eTurn = pick("turnaround option");
  const eWo = pick("open work orders");
  const eDowntime = pick("downtime");

  const rec = hero?.recommendation ?? null;
  const risk = hero?.risk ?? null;
  const projDays = risk?.projectedDaysToCritical != null ? Math.round(risk.projectedDaysToCritical) : null;
  const owner = { name: rec?.decisionOwner ?? "Reliability Lead — Unit 200", role: "Reliability Lead" };

  // ---- Fact catalogue (each item is evidence-backed) --------------------
  const decisions: Record<string, BriefDecision> = {
    approve_k201: {
      id: "dec-k201-approve",
      title: rec?.title ?? "K-201 intervention decision",
      owner,
      dueBy: rec?.dueBy ?? null,
      valueAtStakeUsd: rec?.valueAtStakeUsd ?? null,
      disposition: rec?.disposition ?? null,
      requiresCapability: "approve_reliability_decision",
      href: `/assets/${HERO}`,
      evidence: [eRisk, eProj, eExposure],
    },
  };

  const actions: Record<string, BriefAction> = {
    reduce_speed: {
      id: "act-reduce-speed", title: "Reduce K-201 operating speed now", why: "Vibration is above the warning band; reducing speed lowers vibration while inspection is arranged.",
      dueBy: generatedAt, owner, consequenceOfInaction: "Continued deterioration toward the critical threshold.",
      capability: "issue_operating_instruction", href: `/assets/${HERO}`, priority: 1, evidence: [eVib, eProj],
    },
    inspect: {
      id: "act-inspect", title: "Complete bearing inspection within 48 hours", why: "Confirm bearing condition and attach technical evidence before the trend reaches critical.",
      dueBy: rec?.dueBy ?? null, owner, consequenceOfInaction: "Unplanned failure risk with ~4-day outage exposure.",
      capability: "create_work_request", href: `/assets/${HERO}`, priority: 2, evidence: [eVib, eWo],
    },
    prepare_wo: {
      id: "act-prepare-wo", title: "Prepare WO-48231 (inspection) and WO-48102 (seal)", why: "Turn the approved intervention into a ready-to-execute job plan.",
      dueBy: rec?.dueBy ?? null, owner: { name: "Maintenance Planner", role: "Planner" }, consequenceOfInaction: "Execution slips past the 48-hour window.",
      capability: "prepare_work_order", href: "/planning?asset=K-201", priority: 2, evidence: [eWo, eSpare],
    },
    expedite_seal: {
      id: "act-expedite-seal", title: "Expedite the dry gas seal (35-day lead)", why: "The seal is not in stock and its lead time threatens the 48-hour intervention.",
      dueBy: rec?.dueBy ?? null, owner: { name: "Materials Coordinator", role: "Materials" }, consequenceOfInaction: "Repair blocked on materials.",
      capability: "expedite_material", href: "/materials?asset=K-201", priority: 1, evidence: [eSpare],
    },
    retain_scope: {
      id: "act-retain-scope", title: "Retain K-201 overhaul in turnaround scope", why: "Projected time-to-critical is earlier than the turnaround window; interim action now, full overhaul in the turnaround.",
      dueBy: null, owner: { name: "Turnaround Manager", role: "Turnaround" }, consequenceOfInaction: "Scope gap for the compressor overhaul.",
      capability: "modify_turnaround_scope", href: "/turnaround", priority: 2, evidence: [eTurn, eProj],
    },
    review_grounding: {
      id: "act-review-grounding", title: "Review AI grounding for the K-201 explanation", why: "Confirm the explanation is grounded only in supplied evidence.",
      dueBy: null, owner: { name: "AI Administrator", role: "AI governance" }, consequenceOfInaction: "Ungoverned AI output.",
      capability: "review_ai_evidence", href: `/assets/${HERO}`, priority: 2, evidence: [eRisk],
    },
    validate_outcome: {
      id: "act-validate-outcome", title: "Track outstanding outcome validation", why: "No K-201 outcome is validated yet; realised value remains unavailable until validation.",
      dueBy: null, owner, consequenceOfInaction: "Realised value cannot be recognised.",
      capability: "validate_operational_outcome", href: "/value-realisation", priority: 3, evidence: [eExposure],
    },
  };

  const blockers: Record<string, BriefBlocker> = {
    seal: {
      id: "blk-seal", summary: "Dry gas seal not in stock", dependency: "Procurement / Inventory",
      detail: "0 on hand with a 35-day lead time — constrains the 48-hour inspection/replacement.", evidence: [eSpare],
    },
  };

  const changes: Record<string, BriefChange> = {
    vibration: { id: "chg-vib", summary: "K-201 vibration remains above the warning band", detail: "Overall vibration is tracking upward toward the critical threshold.", evidence: [eVib, eProj] },
    risk_rose: { id: "chg-risk", summary: "K-201 deterministic risk is elevated", detail: `Risk ${risk?.riskScore ?? "—"}/100 with ~${projDays ?? "?"} days projected to critical.`, evidence: [eRisk, eProj] },
    trip: { id: "chg-trip", summary: "K-201 high-vibration trip 12 days ago", detail: "A high-vibration trip caused a controlled restart on the unit.", evidence: [eDowntime] },
    inference: { id: "chg-inf", summary: "AI activity is offline mock only", detail: "All actual inference used the mock provider at $0; NVIDIA/DGX are estimated scenarios.", evidence: [eRisk] },
  };

  const riskValues: Record<string, BriefRiskValue> = {
    exposure: { label: "Value at stake (K-201)", value: rec ? fmtCurrency(rec.valueAtStakeUsd, rec.currency) : "—", provenance: "deterministic" },
    projected: { label: "Projected time-to-critical", value: projDays != null ? `~${projDays} days` : "—", provenance: "statistical" },
    risk: { label: "Deterministic risk", value: risk ? `${risk.riskScore}/100` : "—", provenance: "deterministic" },
    ai_cost: { label: "Actual AI cost", value: fmtCost(rots.actualCostUsd), provenance: "measured" },
    ai_est: { label: "Estimated provider scenario", value: fmtCost(rots.estimatedInferenceCostUsd), provenance: "statistical" },
    oee: { label: "Recent unit OEE (30-day benchmark)", value: eOee.value, provenance: "deterministic" },
  };

  const period = (kind: BriefPeriodKind, sinceLabel: string): BriefPeriod => ({ kind, sinceLabel });

  const config: PersonaBriefConfig = PERSONA_BRIEF_CONFIG(personaId, period);

  // ---- Assemble, enforcing trust boundaries -----------------------------
  const assembledActions = config.actionIds
    .map((id) => actions[id])
    .filter((a): a is BriefAction => !!a && (a.capability === null || personaCan(personaId, a.capability)));

  const assembledDecisions = config.decisionIds
    .map((id) => decisions[id])
    .filter((d): d is BriefDecision => !!d && personaCan(personaId, d.requiresCapability));

  const brief: PersonaBrief = {
    personaId,
    title: config.title,
    assetTag: ctx.assetTag ?? HERO,
    period: config.period,
    summary: { headline: config.headline, points: config.points },
    changes: config.changeIds.map((id) => changes[id]).filter((c): c is BriefChange => !!c),
    actions: assembledActions,
    decisions: assembledDecisions,
    blockers: config.blockerIds.map((id) => blockers[id]).filter((b): b is BriefBlocker => !!b),
    riskValue: config.riskValueIds.map((id) => riskValues[id]).filter((r): r is BriefRiskValue => !!r),
    sources: defaultSourceStates(config.sourceKeys),
    unavailableSections: config.unavailableSections,
    generatedAt,
  };

  return brief;
}

/** Per-persona prioritisation of the shared K-201 facts. */
function PERSONA_BRIEF_CONFIG(
  personaId: PersonaId,
  period: (k: BriefPeriodKind, s: string) => BriefPeriod,
): PersonaBriefConfig {
  const base = { blockerIds: ["seal"], sourceKeys: ["local_seed", "historian", "cmms"] as SourceKey[], unavailableSections: [] as string[] };
  switch (personaId) {
    case "plant_manager":
      return { ...base, title: "Executive Morning Brief", period: period("day", "Since the previous leadership review"),
        headline: "One decision awaits your authority on K-201; the value at stake is significant.",
        points: ["A reliability decision on K-201 is escalated for approval.", "Turnaround readiness is at 50% of checks.", "Realised value is not yet available (no validated outcome)."],
        actionIds: ["validate_outcome"], decisionIds: ["approve_k201"], changeIds: ["risk_rose"], riskValueIds: ["exposure", "projected", "risk"], sourceKeys: ["local_seed", "historian", "cmms", "inventory", "turnaround_scheduling"], unavailableSections: ["Realised value — awaiting a validated operational outcome"] };
    case "shift_supervisor":
      return { ...base, title: "Shift Opening Brief", period: period("shift", "Since the previous handover"),
        headline: "K-201 needs an operating response this shift.",
        points: ["K-201 vibration is above the warning band.", "Reduce operating speed as interim mitigation.", "Shift-grain OEE is not available from current sources."],
        actionIds: ["reduce_speed"], decisionIds: [], changeIds: ["vibration", "trip"], blockerIds: [], riskValueIds: ["projected", "risk"], sourceKeys: ["local_seed", "historian", "shift_log"], unavailableSections: ["Shift OEE / availability — shift-grain production data not connected"] };
    case "reliability_manager":
      return { ...base, title: "Reliability Daily Brief", period: period("daily_review", "Since the previous daily review"),
        headline: "A K-201 decision requires your approval; projected time-to-critical is inside the repair lead time.",
        points: ["Approve, modify, or reject the K-201 intervention.", "Dry gas seal is not in stock (35-day lead).", "Full overhaul remains a turnaround candidate."],
        actionIds: [], decisionIds: ["approve_k201"], changeIds: ["risk_rose", "vibration"], riskValueIds: ["risk", "projected", "exposure"], sourceKeys: ["local_seed", "historian", "cmms", "turnaround_scheduling"], unavailableSections: [] };
    case "reliability_engineer":
      return { ...base, title: "Asset Watch Brief", period: period("daily_review", "Since the previous daily review"),
        headline: "K-201 is the priority watch item; complete the inspection and attach evidence.",
        points: ["Vibration and bearing temperature are trending up.", "Projected time-to-critical is short.", "Draft supports the reliability decision."],
        actionIds: ["inspect"], decisionIds: [], changeIds: ["vibration", "risk_rose"], riskValueIds: ["projected", "risk", "oee"], sourceKeys: ["local_seed", "historian", "cmms"], unavailableSections: [] };
    case "maintenance_planner":
      return { ...base, title: "Planning Brief", period: period("planning_cycle", "Since the previous planning cycle"),
        headline: "K-201 work needs job plans; one item is parts-constrained.",
        points: ["Prepare the inspection and seal work orders.", "Seal is not in stock (35-day lead).", "Target execution within 48 hours."],
        actionIds: ["prepare_wo"], decisionIds: [], changeIds: ["vibration"], riskValueIds: ["projected"], sourceKeys: ["local_seed", "cmms", "inventory"], unavailableSections: ["Job-plan readiness — CMMS not connected"] };
    case "materials_coordinator":
      return { ...base, title: "Material Readiness Brief", period: period("material_review", "Since the previous material review"),
        headline: "K-201 repair is blocked on a dry gas seal with a 35-day lead time.",
        points: ["Expedite the dry gas seal.", "Bearing set is in stock.", "Lead time threatens the 48-hour intervention."],
        actionIds: ["expedite_seal"], decisionIds: [], changeIds: [], riskValueIds: ["projected"], sourceKeys: ["local_seed", "inventory", "procurement"], unavailableSections: ["Open expedites — procurement not connected"] };
    case "turnaround_manager":
      return { ...base, title: "Turnaround Readiness Brief", period: period("readiness_review", "Since the previous readiness review"),
        headline: "K-201 overhaul is a critical-path candidate; scope readiness is at risk on materials.",
        points: ["Retain the K-201 overhaul in scope.", "Projected failure precedes the turnaround window.", "Materials readiness is at risk."],
        actionIds: ["retain_scope"], decisionIds: [], changeIds: ["risk_rose"], riskValueIds: ["projected", "exposure"], sourceKeys: ["local_seed", "turnaround_scheduling", "cmms", "inventory"], unavailableSections: [] };
    case "ai_admin":
      return { ...base, title: "AI Operations Brief", period: period("operational_review", "Since the previous operational review"),
        headline: "AI activity is healthy and offline; actual cost is $0 with estimated scenarios for comparison.",
        points: ["All actual inference used the mock provider.", "Realised value is not yet available.", "Prompt versions are governed and grounded."],
        actionIds: ["review_grounding"], decisionIds: [], blockerIds: [], changeIds: ["inference"], riskValueIds: ["ai_cost", "ai_est"], sourceKeys: ["local_seed", "ai_runtime"], unavailableSections: ["Realised AI value — awaiting a validated outcome"] };
  }
}