import "server-only";
import type { PersonaId } from "@/personas/types";
import { getAiProvider } from "@/ai";
import type { EvidenceLine } from "@/ai/types";
import type { AiProvider } from "@/ai/types";
import { ProviderRequestError } from "@/ai/providers/openai-compatible";
import { makeViewBundle, runAgentToolsWith } from "./tools";
import { toolPlanFor } from "./plan";
import { buildDeterministicResponse } from "./deterministic";
import { renderAgentPrompt } from "./prompts";
import { validateProviderDraft } from "./citation-validation";
import type { AgentProviderId, AgentQuestionId, Citation, GovernedAgentResponse } from "./types";
import {
  governedAgentResponseSchema,
  providerDisplayLabel,
  providerDraftSchema,
} from "./types";

type ProviderFallbackCategory =
  | "provider_request_failed"
  | "provider_output_not_json"
  | "provider_output_schema_mismatch"
  | "provider_output_grounding_rejected";

function reportProviderFallback(
  provider: AiProvider,
  category: ProviderFallbackCategory,
  error?: unknown,
): void {
  if (error instanceof ProviderRequestError) {
    console.warn("[agent-provider-fallback]", error.diagnostics);
    return;
  }
  console.warn("[agent-provider-fallback]", {
    category,
    model: provider.model,
    stage:
      category === "provider_request_failed"
        ? "request"
        : category === "provider_output_grounding_rejected"
          ? "grounding_validation"
          : "schema_validation",
  });
}

/**
 * The governed K-201 case orchestrator (server-only).
 *
 * Pipeline: resolve the persona-scoped plan → run the read-only tools →
 * ALWAYS build the complete deterministic response → optionally let a configured
 * provider re-narrate the summary and claims → validate that narration against
 * the exact evidence → return the grounded answer, or fall back to the
 * deterministic one on ANY doubt.
 *
 * The deterministic response is authoritative for every governed field
 * (citations, authority, timestamps, recommendation, calculation identities);
 * a provider may only replace the prose (`situationSummary`, `claims`). If its
 * output fails to parse or validate, it is discarded WHOLE.
 */

export interface InvestigateParams {
  readonly viewerId: PersonaId;
  readonly questionId: AgentQuestionId;
  readonly question: string;
  readonly requestId: string;
  /** Optional request-scoped provider. Never store this outside the request. */
  readonly provider?: AiProvider;
  /** Injected clock for deterministic tests; defaults to now. */
  readonly now?: Date;
}

export async function investigateK201Case(
  params: InvestigateParams,
): Promise<GovernedAgentResponse> {
  const generatedAt = (params.now ?? new Date()).toISOString();
  const views = makeViewBundle(params.viewerId);
  const toolNames = toolPlanFor(params.questionId);
  const toolResults = runAgentToolsWith(views, toolNames, params.viewerId);

  const deterministic = buildDeterministicResponse({
    viewerId: params.viewerId,
    requestId: params.requestId,
    questionId: params.questionId,
    question: params.question,
    toolResults,
    views,
    generatedAt,
  });

  const provider = params.provider ?? getAiProvider();

  // Offline / no-key path: the deterministic response IS the answer.
  if (provider.id === "mock" || !provider.isAvailable()) {
    return governedAgentResponseSchema.parse(deterministic);
  }

  const citations = deterministic.citations;
  if (citations.length === 0) {
    // Nothing the model could ground on — never let it speak unbacked.
    return governedAgentResponseSchema.parse(deterministic);
  }

  const grounded = await tryProviderNarration(provider, citations, deterministic);
  return governedAgentResponseSchema.parse(grounded ?? fallback(deterministic));
}

async function tryProviderNarration(
  provider: ReturnType<typeof getAiProvider>,
  citations: readonly Citation[],
  deterministic: GovernedAgentResponse,
): Promise<GovernedAgentResponse | null> {
  try {
    const prompt = renderAgentPrompt({ question: deterministic.question, citations });
    const evidence: EvidenceLine[] = citations.map((c) => ({
      label: `${c.label} [${c.id}]`,
      value: c.value,
      provenance: c.provenance,
    }));

    const result = await provider.generate({
      useCase: "k201-case-investigator",
      promptKey: prompt.promptKey,
      promptVersion: prompt.promptVersion,
      system: prompt.system,
      user: prompt.user,
      evidence,
      maxOutputTokens: 800,
    });

    const parsedJson = extractJson(result.text);
    if (parsedJson === null) {
      reportProviderFallback(provider, "provider_output_not_json");
      return null;
    }

    const draft = providerDraftSchema.safeParse(parsedJson);
    if (!draft.success) {
      reportProviderFallback(provider, "provider_output_schema_mismatch");
      return null;
    }

    const validation = validateProviderDraft(draft.data, citations);
    if (!validation.valid) {
      reportProviderFallback(provider, "provider_output_grounding_rejected");
      return null;
    }

    const providerId = provider.id as AgentProviderId;
    return {
      ...deterministic,
      provider: providerId,
      providerDisplay: providerDisplayLabel(providerId),
      model: result.model,
      situationSummary: draft.data.situationSummary,
      claims: draft.data.claims,
      generationStatus: "provider_grounded",
      deterministicFallback: false,
    };
  } catch (error) {
    reportProviderFallback(provider, "provider_request_failed", error);
    return null;
  }
}

/** The deterministic answer, tagged as a rejected-provider fallback. */
function fallback(deterministic: GovernedAgentResponse): GovernedAgentResponse {
  return {
    ...deterministic,
    provider: "mock",
    providerDisplay: providerDisplayLabel("mock"),
    generationStatus: "provider_rejected_fallback",
    deterministicFallback: true,
  };
}

/** Parse the first JSON object in the model text, tolerating code fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}
