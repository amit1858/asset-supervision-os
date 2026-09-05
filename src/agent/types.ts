import { z } from "zod";

/**
 * Governed K-201 case investigator — the client-safe response contract.
 *
 * This module is PURE: types and zod schemas only. It imports NO server-only
 * module, NO engine, NO read model and NO authority-mutation seam, so the
 * browser case panel can import it directly. Everything the agent returns is
 * validated against these schemas; the server is the sole authority for every
 * governed number, citation, timestamp and authority fact.
 *
 * The agent is READ-ONLY. It investigates governed evidence, explains why an
 * intervention is warranted, cites its sources, and routes to human authority.
 * It never proposes a NEW action, never mutates, and never invents a number.
 */

/** The single subject the investigator is scoped to. */
export const AGENT_SUBJECT = {
  assetTag: "K-201",
  caseId: "case-k201-hydrogen-recycle",
  assetName: "Hydrogen Recycle Compressor",
} as const;

/** The seven governed questions the investigator answers. */
export const AGENT_QUESTION_IDS = [
  "why_action_now",
  "what_is_the_evidence",
  "can_it_wait_for_turnaround",
  "what_is_blocking_the_work",
  "who_must_decide",
  "what_value_is_protected",
  "what_changed",
] as const;

export type AgentQuestionId = (typeof AGENT_QUESTION_IDS)[number];

export interface AgentQuestionDef {
  readonly id: AgentQuestionId;
  /** Canonical, governed phrasing of the question. */
  readonly prompt: string;
  /** Short chip label for the UI. */
  readonly label: string;
}

/** The suggested-question catalogue the panel offers. Presentation data only. */
export const AGENT_QUESTIONS: readonly AgentQuestionDef[] = [
  { id: "why_action_now", label: "Why act now?", prompt: "Why does K-201 require action now?" },
  { id: "what_is_the_evidence", label: "What is the evidence?", prompt: "What is the governed evidence behind the K-201 assessment?" },
  { id: "can_it_wait_for_turnaround", label: "Can it wait for the turnaround?", prompt: "Can the K-201 intervention safely wait for the next turnaround?" },
  { id: "what_is_blocking_the_work", label: "What is blocking the work?", prompt: "What is blocking the K-201 work from being executed?" },
  { id: "who_must_decide", label: "Who must decide?", prompt: "Who holds the authority to decide on the K-201 intervention?" },
  { id: "what_value_is_protected", label: "What value is protected?", prompt: "What value is protected by acting on K-201?" },
  { id: "what_changed", label: "What changed?", prompt: "What changed in the K-201 case since the last review?" },
] as const;

export function isAgentQuestionId(value: unknown): value is AgentQuestionId {
  return typeof value === "string" && (AGENT_QUESTION_IDS as readonly string[]).includes(value);
}

/** Provider identity the client is permitted to display. Three labels only. */
export const PROVIDER_DISPLAY_LABELS = [
  "Azure AI Foundry",
  "Local model",
  "Deterministic fallback",
] as const;
export type ProviderDisplayLabel = (typeof PROVIDER_DISPLAY_LABELS)[number];

/** Configured provider ids (mirrors the additive `AiProviderId` union). */
export const AGENT_PROVIDER_IDS = ["azure", "dgxspark", "nvidia", "mock"] as const;
export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number];

export function providerDisplayLabel(id: AgentProviderId): ProviderDisplayLabel {
  switch (id) {
    case "azure":
      return "Azure AI Foundry";
    case "dgxspark":
    case "nvidia":
      return "Local model";
    case "mock":
    default:
      return "Deterministic fallback";
  }
}

// ---------------------------------------------------------------------------
// Structured response schema
// ---------------------------------------------------------------------------

/** A single governed evidence citation. Every value is server-authoritative. */
export const citationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  /** Provenance verbatim from the source (governed provenance or "source_record"). */
  provenance: z.string().min(1),
  /** Broad source class: "governed_metric" | "source_fact" | "authority" | "record". */
  sourceType: z.string().min(1),
  /** Underlying evidence/record id, or null when the source exposes none. */
  sourceId: z.string().nullable(),
  /** The instant the value was observed/evaluated (asOf), or null. */
  observedAt: z.string().nullable(),
  /** The read-only tool that produced this citation. */
  toolName: z.string().min(1),
});
export type Citation = z.infer<typeof citationSchema>;

export const CLAIM_KINDS = [
  "condition",
  "reliability",
  "materials",
  "turnaround",
  "oee",
  "value",
  "authority",
  "lifecycle",
  "recommendation",
  "summary",
] as const;
export const claimKindSchema = z.enum(CLAIM_KINDS);
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** A single grounded claim. Every material claim cites ≥1 executed-tool citation. */
export const claimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(800),
  kind: claimKindSchema,
  citationIds: z.array(z.string().min(1)),
});
export type Claim = z.infer<typeof claimSchema>;

/**
 * The narrow subset a language model is permitted to author. Everything else in
 * the response is stamped by the server. The model narrates; the server governs.
 */
export const providerDraftSchema = z.object({
  situationSummary: z.string().min(1).max(1600),
  claims: z.array(claimSchema).min(1).max(24),
});
export type ProviderDraft = z.infer<typeof providerDraftSchema>;

/** The read-only human authority the case must route to. Never actionable here. */
export const authorityHandoffSchema = z.object({
  decisionStatusLabel: z.string(),
  nextActLabel: z.string(),
  nextActPersonaName: z.string(),
  endorsementRequired: z.boolean(),
  endorsementNote: z.string(),
  /** Read-only routing label: "View authority requirements" — never "approve". */
  routeLabel: z.string(),
  readOnlyNotice: z.string(),
});
export type AuthorityHandoff = z.infer<typeof authorityHandoffSchema>;

/**
 * The EXISTING governed recommendation, restated unmodified. The agent never
 * authors a new intervention and never mutates: `isExistingRecommendation` and
 * `mutates:false` are structural guarantees the client can assert on.
 */
export const proposedInterventionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  statusLabel: z.string(),
  isExistingRecommendation: z.literal(true),
  mutates: z.literal(false),
});
export type ProposedIntervention = z.infer<typeof proposedInterventionSchema>;

export const AGENT_GENERATION_STATUSES = [
  "deterministic",
  "provider_grounded",
  "provider_rejected_fallback",
] as const;
export const generationStatusSchema = z.enum(AGENT_GENERATION_STATUSES);
export type AgentGenerationStatus = (typeof AGENT_GENERATION_STATUSES)[number];

export const calculationReferenceSchema = z.object({
  name: z.string(),
  formulaVersion: z.string(),
});

export const governedAgentResponseSchema = z.object({
  requestId: z.string().min(1),
  question: z.string().min(1),
  questionId: z.enum(AGENT_QUESTION_IDS),
  provider: z.enum(AGENT_PROVIDER_IDS),
  providerDisplay: z.enum(PROVIDER_DISPLAY_LABELS),
  model: z.string(),
  generatedAt: z.string(),
  viewer: z.object({
    personaId: z.string(),
    personaName: z.string(),
  }),
  subject: z.object({
    assetTag: z.string(),
    caseId: z.string(),
    assetName: z.string(),
  }),
  situationSummary: z.string().min(1),
  claims: z.array(claimSchema).min(1),
  citations: z.array(citationSchema),
  proposedIntervention: proposedInterventionSchema.nullable(),
  authorityHandoff: authorityHandoffSchema.nullable(),
  calculationReferences: z.array(calculationReferenceSchema),
  timestamps: z.object({
    assessmentAsOf: z.string().nullable(),
    materialsAsOf: z.string().nullable(),
    turnaroundAsOf: z.string().nullable(),
  }),
  freshnessLabels: z.array(z.string()),
  trustLabels: z.array(z.string()),
  uncertainties: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  /** The actions the agent will never take. A permanent read-only declaration. */
  prohibitedActions: z.array(z.string()),
  /** Which tools were permitted for the viewing persona and actually executed. */
  toolsExecuted: z.array(z.string()),
  /** Tools withheld because the viewing persona lacks the capability. */
  toolsWithheld: z.array(
    z.object({ toolName: z.string(), reason: z.string() }),
  ),
  generationStatus: generationStatusSchema,
  deterministicFallback: z.boolean(),
});
export type GovernedAgentResponse = z.infer<typeof governedAgentResponseSchema>;

/** The permanent read-only declaration surfaced on every response. */
export const AGENT_PROHIBITED_ACTIONS: readonly string[] = [
  "Approve, endorse, reject or validate any governed decision",
  "Create, modify, schedule or close a work order",
  "Reserve, expedite or release any spare or material",
  "Change turnaround scope or any governed calculation",
  "Write to any record, or invent a value not backed by governed evidence",
];
