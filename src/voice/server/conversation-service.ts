import "server-only";
import { z } from "zod";
import { MockBriefConversationProvider } from "../mock-conversation";
import { getAuthorizationProvider } from "@/personas/authorization";
import { isPersonaId } from "@/personas/registry";
import { getRepository } from "@/data/repository";
import { getVoiceSuggestions } from "../suggestions";
import type { VoiceEvidenceReference, VoiceScope, VoiceTurn } from "../types";
import type { Provenance } from "@/domain/enums";
import type { SourceState } from "@/domain/integration";
import type { ProposedVoiceAction } from "../types";

/**
 * Server-only voice conversation service — the truth boundary.
 *
 * The browser NEVER runs `buildPersonaBrief` or touches the seeded dataset. The
 * server resolves the authorised persona, validates the operational context and
 * asset, constructs the governed Chief of Staff brief, runs the deterministic
 * conversation provider, and returns only the concise answer + its evidence.
 * Client-supplied authority/capability claims are ignored — capabilities are
 * derived server-side. This endpoint never executes an action.
 */

const timeRange = z.enum(["7d", "30d", "90d", "shift"]);

// Unknown keys are stripped (default), so any client "authority"/"capabilities"
// fields are ignored rather than trusted.
export const conversationRequestSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  suggestionId: z.number().int().min(0).max(50).optional(),
  via: z.enum(["text", "voice"]).default("text"),
  personaId: z.string().min(1).max(64),
  plantId: z.string().min(1).max(64),
  unitId: z.string().max(64).nullable().optional(),
  assetTag: z.string().max(32).nullable().optional(),
  timeRange,
  shift: z.string().max(64).nullable().optional(),
  route: z.string().max(200),
  sourceMode: z.enum(["local", "snowflake"]),
  dataFreshness: z.string().max(32),
});

export type VoiceConversationRequest = z.infer<typeof conversationRequestSchema>;

export interface VoiceConversationResponse {
  turnId: string;
  text: string;
  evidence: VoiceEvidenceReference[];
  provenanceKinds: Provenance[];
  sources: SourceState[];
  unavailableNote: string | null;
  proposedAction: ProposedVoiceAction | null;
}

export class VoiceConversationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VoiceConversationError";
  }
}

const provider = new MockBriefConversationProvider();

/** Resolve + validate + ground. Fails closed on any invalid input. */
export function runBriefConversation(raw: unknown): VoiceConversationResponse {
  const parsed = conversationRequestSchema.safeParse(raw);
  if (!parsed.success) throw new VoiceConversationError(400, "Invalid request");
  const req = parsed.data;

  // Persona is a VIEW selection — validate it exists and is permitted (fail closed).
  if (!isPersonaId(req.personaId)) throw new VoiceConversationError(400, "Invalid persona");
  if (!getAuthorizationProvider().isPersonaPermitted(req.personaId)) {
    throw new VoiceConversationError(403, "Persona not permitted");
  }

  // Resolve the question server-side from a suggestion ID or free text.
  let text: string;
  if (typeof req.suggestionId === "number") {
    const s = getVoiceSuggestions(req.personaId)[req.suggestionId];
    if (!s) throw new VoiceConversationError(400, "Unknown suggestion");
    text = s;
  } else if (req.text) {
    text = req.text;
  } else {
    throw new VoiceConversationError(400, "Missing question");
  }

  // Fail closed on an unknown asset.
  const repo = getRepository();
  if (req.assetTag && !repo.getAssetByTag(req.assetTag)) {
    throw new VoiceConversationError(400, "Unknown asset");
  }

  // Server-trusted scope. Capabilities/authority are derived, never from the client.
  const scope: VoiceScope = {
    personaId: req.personaId,
    plantId: req.plantId,
    unitId: req.unitId ?? null,
    assetTag: req.assetTag ?? null,
    timeRange: req.timeRange,
    shift: req.shift ?? null,
    route: req.route,
    sourceMode: req.sourceMode,
    dataFreshness: req.dataFreshness,
  };

  const turn: VoiceTurn = provider.answer({ text, via: req.via }, scope);
  return {
    turnId: turn.id,
    text: turn.text,
    evidence: turn.evidence,
    provenanceKinds: turn.provenanceKinds,
    sources: turn.sources,
    unavailableNote: turn.unavailableNote,
    proposedAction: turn.proposedAction,
  };
}
