import type { Provenance } from "@/domain/enums";
import type { SourceState } from "@/domain/integration";
import type { Capability, PersonaId } from "@/personas/types";

/**
 * Chief of Staff briefing structures.
 *
 * The Chief of Staff is a role-aware briefing/orchestration LAYER, not a persona,
 * chatbot, or source of truth. Deterministic systems and source records
 * establish facts; the briefing service prioritises and assembles those governed
 * facts per persona. Every brief item MUST link to evidence or a source status —
 * nothing is fabricated.
 */

export type BriefPeriodKind =
  | "day"
  | "shift"
  | "daily_review"
  | "planning_cycle"
  | "material_review"
  | "readiness_review"
  | "operational_review";

export interface BriefPeriod {
  kind: BriefPeriodKind;
  /** e.g. "Since previous handover", "Since previous daily review". */
  sinceLabel: string;
}

export interface BriefOwner {
  name: string;
  role: string;
}

/** A single governed fact backing a brief item — always traceable. */
export interface BriefEvidence {
  label: string;
  value: string;
  provenance: Provenance;
  sourceType: string;
  href?: string;
  observedAt?: string | null;
}

export interface BriefSummary {
  headline: string;
  points: string[];
}

export interface BriefChange {
  id: string;
  summary: string;
  detail?: string;
  evidence: BriefEvidence[];
}

export interface BriefAction {
  id: string;
  title: string;
  why: string;
  dueBy: string | null;
  owner: BriefOwner | null;
  consequenceOfInaction: string | null;
  /** Capability required to perform the action (gates the control). */
  capability: Capability | null;
  href: string | null;
  priority: number;
  evidence: BriefEvidence[];
}

export interface BriefDecision {
  id: string;
  title: string;
  owner: BriefOwner;
  dueBy: string | null;
  valueAtStakeUsd: number | null;
  disposition: string | null;
  /** Only personas holding this capability receive the decision to make. */
  requiresCapability: Capability;
  href: string | null;
  evidence: BriefEvidence[];
}

export interface BriefBlocker {
  id: string;
  summary: string;
  dependency: string;
  detail?: string;
  evidence: BriefEvidence[];
}

export interface BriefRiskValue {
  label: string;
  value: string;
  provenance: Provenance;
}

export interface PersonaBrief {
  personaId: PersonaId;
  /** e.g. "Reliability Daily Brief". */
  title: string;
  assetTag: string | null;
  period: BriefPeriod;
  summary: BriefSummary;
  changes: BriefChange[];
  actions: BriefAction[];
  decisions: BriefDecision[];
  blockers: BriefBlocker[];
  riskValue: BriefRiskValue[];
  sources: SourceState[];
  /** Sections that cannot be produced because a source is unavailable. */
  unavailableSections: string[];
  generatedAt: string;
}
