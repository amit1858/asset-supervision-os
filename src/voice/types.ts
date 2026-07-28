import type { Provenance } from "@/domain/enums";
import type { Capability, PersonaId, TimeRangeKey } from "@/personas/types";
import type { SourceState } from "@/domain/integration";

/**
 * Voice briefing — provider-neutral interfaces and domain types.
 *
 * Voice is a governed conversational interface OVER the existing Chief of Staff
 * brief and operational evidence. There is exactly one truth path: the brief
 * service. Voice never invents facts and never executes operational actions.
 */

export type VoiceState =
  | "closed"
  | "ready"
  | "listening"
  | "transcribing"
  | "thinking"
  | "responding"
  | "permission_denied"
  | "unavailable"
  | "offline"
  | "error";

export type MicPermission = "granted" | "denied" | "prompt" | "unavailable";

/** Read-only snapshot of the operational scope a voice session inherits. */
export interface VoiceScope {
  personaId: PersonaId;
  plantId: string;
  unitId: string | null;
  assetTag: string | null;
  timeRange: TimeRangeKey;
  shift: string | null;
  route: string;
  sourceMode: "local" | "snowflake";
  dataFreshness: string;
}

export interface VoiceEvidenceReference {
  label: string;
  value: string;
  provenance: Provenance;
  sourceType: string;
  href: string | null;
}

/** A proposed operational action — surfaced for confirmation, NEVER executed. */
export interface ProposedVoiceAction {
  title: string;
  targetType: string;
  targetId: string | null;
  consequence: string;
  requiredCapability: Capability;
  href: string | null;
}

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Provenance kinds present in this turn (measured/calculated/…). */
  provenanceKinds: Provenance[];
  evidence: VoiceEvidenceReference[];
  sources: SourceState[];
  /** Set when the answer depends on an unavailable source. */
  unavailableNote: string | null;
  /** Set when the user asked to DO something — requires explicit confirmation. */
  proposedAction: ProposedVoiceAction | null;
}

export interface VoiceQuery {
  text: string;
  /** How the query was entered — text and (simulated) voice are equivalent. */
  via: "text" | "voice";
}

/**
 * Grounded conversation over the brief — the single source of truth. An
 * implementation may summarise governed facts but must not create new ones.
 */
export interface BriefConversationProvider {
  readonly id: string;
  answer(query: VoiceQuery, scope: VoiceScope): VoiceTurn;
}

/** Speech capture behind an adapter. The mock never captures real audio. */
export interface SpeechInputProvider {
  readonly id: string;
  isAvailable(): boolean;
  /** Called ONLY after an explicit user action — never on page load. */
  requestPermission(): Promise<MicPermission>;
}

/** Speech synthesis behind an adapter. The mock does not auto-speak. */
export interface SpeechOutputProvider {
  readonly id: string;
  isAvailable(): boolean;
  speak(text: string): void;
  stop(): void;
}
