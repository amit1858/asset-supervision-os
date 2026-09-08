import type { PersonaId } from "@/personas/types";

export type JourneyPlacement = "top" | "right" | "bottom" | "left" | "auto";

export interface GuidedJourneyStep {
  id: string;
  route: string;
  targetId: string;
  title: string;
  what: string;
  why: string;
  outcome?: string;
  placement?: JourneyPlacement;
}

export interface GuidedJourney {
  id: string;
  personaId: PersonaId;
  title: string;
  durationLabel: string;
  purpose: string;
  steps: GuidedJourneyStep[];
}

export const GUIDED_JOURNEYS: GuidedJourney[] = [
  {
    id: "plant-manager-operating-thread",
    personaId: "plant_manager",
    title: "Plant Manager journey",
    durationLabel: "About 90 seconds",
    purpose: "Follow the plant decision from executive context to accountable human authority.",
    steps: [
      { id: "plant-overview", route: "/v2/plant", targetId: "v2-page-header", title: "Start with plant priorities", what: "Plant OEE, decisions, attention assets and turnaround readiness establish the site-level operating picture.", why: "Plant leadership begins with the priorities that require authority.", placement: "bottom" },
      { id: "plant-decisions", route: "/v2/plant", targetId: "v2-brief", title: "Decisions awaiting authority", what: "The Chief of Staff brief keeps K-201's highest-exposure decision visible without approving it.", why: "Attention is directed toward a governed decision, not an autonomous action.", placement: "bottom" },
      { id: "reliability-center", route: "/v2/reliability", targetId: "v2-page-header", title: "Trace the reliability risk", what: "The Reliability Command Center connects health, risk, time to critical and execution readiness.", why: "The approximately 17.93-day horizon makes timing material.", placement: "bottom" },
      { id: "asset-360", route: "/v2/assets/K-201", targetId: "v2-page-header", title: "Inspect K-201 evidence", what: "Asset 360 keeps the condition record, operational context and governed assessment together.", why: "The recommendation is backed by traceable condition evidence.", placement: "bottom" },
      { id: "case-investigator", route: "/v2/assets/K-201", targetId: "k201-investigator-launcher", title: "Open the Case Investigator", what: "The read-only investigator follows Signal → Evidence → Risk → Recommendation → Human authority.", why: "The agent explains the case but cannot make the decision.", outcome: "Select Why act now? to continue.", placement: "right" },
      { id: "turnaround-materials", route: "/v2/turnaround", targetId: "v2-page-header", title: "Resolve the timing conflict", what: "Turnaround scope, 35-day spare lead time and the 88-day window are shown together.", why: "A turnaround fit is not a licence to wait.", placement: "bottom" },
      { id: "value-authority", route: "/v2/value-realisation", targetId: "v2-page-header", title: "Finish with human authority", what: "Decision exposure is separated from projected and realised value; accountable humans retain approval and endorsement.", why: "AI informs the decision while Reliability and Plant leadership own it.", placement: "bottom" },
    ],
  },
  {
    id: "reliability-manager-prioritisation",
    personaId: "reliability_manager",
    title: "Reliability Manager journey",
    durationLabel: "About 75 seconds",
    purpose: "Prioritise time-critical risk and hand the governed recommendation to its owner.",
    steps: [
      { id: "reliability-home", route: "/v2/reliability", targetId: "v2-page-header", title: "Open the command center", what: "The reliability workspace ranks decisions, risks and readiness from one governed view.", why: "Prioritisation starts with the accountable queue.", placement: "bottom" },
      { id: "reliability-portfolio", route: "/v2/portfolio", targetId: "asset-risk-portfolio", title: "Review the asset portfolio", what: "Eight canonical assets are shown with their source status and available governed assessment.", why: "The portfolio distinguishes assessed risk from assets that need deeper review.", placement: "bottom" },
      { id: "reliability-asset", route: "/v2/assets/K-201", targetId: "v2-page-header", title: "Follow K-201's horizon", what: "K-201 carries health 52, risk 68 and a deterministic projected time to critical.", why: "The queue is anchored in condition evidence and time.", placement: "bottom" },
      { id: "reliability-investigator", route: "/v2/assets/K-201", targetId: "k201-investigator-launcher", title: "Use governed investigation", what: "The Case Investigator exposes cited reasoning while preserving read-only boundaries.", why: "Citation traceability supports a human reliability decision.", placement: "right" },
      { id: "reliability-authority", route: "/v2/reliability", targetId: "v2-page-header", title: "Retain approval ownership", what: "The recommendation remains a governed handoff to Reliability Manager authority.", why: "The agent cannot approve, schedule or mutate work.", placement: "bottom" },
    ],
  },
  {
    id: "materials-readiness",
    personaId: "materials_coordinator",
    title: "Materials journey",
    durationLabel: "About 60 seconds",
    purpose: "Trace the dry-gas-seal constraint from material exception to accountable handoff.",
    steps: [
      { id: "materials-home", route: "/v2/materials", targetId: "v2-page-header", title: "Start with material exceptions", what: "The workspace separates material readiness from inventory health.", why: "A stocked storeroom does not automatically make work executable.", placement: "bottom" },
      { id: "materials-portfolio", route: "/v2/portfolio", targetId: "asset-risk-portfolio", title: "Locate the affected asset", what: "The canonical portfolio links the K-201 record to its material and work context.", why: "Material coordination stays tied to a real asset identity.", placement: "bottom" },
      { id: "materials-detail", route: "/v2/assets/K-201", targetId: "v2-page-header", title: "Inspect the work constraint", what: "K-201's dry-gas-seal requirement and 35-day lead time remain source facts.", why: "The coordinator can explain readiness without approving reliability action.", placement: "bottom" },
      { id: "materials-turnaround", route: "/v2/turnaround", targetId: "v2-page-header", title: "Connect turnaround dependency", what: "The planned overhaul is held in turnaround scope while the immediate work remains time-critical.", why: "Materials readiness and turnaround scope are related, not interchangeable.", placement: "bottom" },
      { id: "materials-handoff", route: "/v2/materials", targetId: "v2-page-header", title: "Hand off the dependency", what: "The accountable owner and blocked work remain visible for the next human decision.", why: "Materials coordination does not widen approval authority.", placement: "bottom" },
    ],
  },
  {
    id: "turnaround-horizon",
    personaId: "turnaround_manager",
    title: "Turnaround journey",
    durationLabel: "About 60 seconds",
    purpose: "Compare scope, lead time and failure horizon without turning fit into permission to wait.",
    steps: [
      { id: "turnaround-home", route: "/v2/turnaround", targetId: "v2-page-header", title: "Open turnaround control", what: "The control tower shows the governed subject, scope and readiness picture.", why: "Turnaround ownership begins with a truthful scope view.", placement: "bottom" },
      { id: "turnaround-portfolio", route: "/v2/portfolio", targetId: "asset-risk-portfolio", title: "Review candidate assets", what: "The portfolio provides the canonical asset population behind scope decisions.", why: "Scope decisions must refer to real equipment records.", placement: "bottom" },
      { id: "turnaround-horizons", route: "/v2/assets/K-201", targetId: "v2-page-header", title: "Compare the horizons", what: "K-201 shows approximately 17.93 days to critical, 35 days of spare lead time and an 88-day turnaround window.", why: "The timing conflict is the reason immediate work remains outside the turnaround.", placement: "bottom" },
      { id: "turnaround-scope", route: "/v2/turnaround", targetId: "v2-page-header", title: "Separate scope from approval", what: "The overhaul can remain in turnaround scope while Reliability owns the immediate reliability decision.", why: "Turnaround Manager owns scope, not reliability approval.", placement: "bottom" },
      { id: "turnaround-close", route: "/v2/turnaround", targetId: "v2-page-header", title: "Close with the dependency", what: "The 53-day slack is visible as governed context, not a licence to defer action.", why: "Readiness informs coordination while humans retain authority.", placement: "bottom" },
    ],
  },
];

export function getGuidedJourneyForPersona(personaId: PersonaId): GuidedJourney | null {
  return GUIDED_JOURNEYS.find((journey) => journey.personaId === personaId) ?? null;
}
