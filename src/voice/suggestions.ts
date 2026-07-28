import type { PersonaId } from "@/personas/types";

/**
 * Persona-aware suggested prompts. This is DATA keyed by persona (derived from
 * the persona registry), consumed by the UI without persona-name conditionals.
 */
export const PERSONA_VOICE_SUGGESTIONS: Record<PersonaId, string[]> = {
  plant_manager: [
    "Give me my executive morning update.",
    "What decisions need my authority?",
    "Where is the greatest value at stake?",
  ],
  shift_supervisor: [
    "What needs an operating response this shift?",
    "What must I hand over?",
  ],
  reliability_manager: [
    "Why is K-201 urgent?",
    "What is blocking the intervention?",
    "Which decision requires my approval?",
  ],
  reliability_engineer: [
    "What evidence supports the K-201 recommendation?",
    "Which trend is approaching its threshold?",
  ],
  maintenance_planner: [
    "Which work orders need preparation?",
    "What is preventing execution within 48 hours?",
  ],
  materials_coordinator: [
    "Which critical spare must be expedited?",
    "What work is blocked by material availability?",
  ],
  turnaround_manager: [
    "What threatens turnaround readiness?",
    "Should K-201 remain in turnaround scope?",
  ],
  ai_admin: [
    "What AI activity occurred?",
    "Which evidence grounded the explanation?",
    "What was actual versus estimated inference cost?",
  ],
};

export function getVoiceSuggestions(id: PersonaId): string[] {
  return PERSONA_VOICE_SUGGESTIONS[id];
}
