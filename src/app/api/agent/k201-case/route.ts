import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readOperationalContext } from "@/context/server";
import { investigateK201Case } from "@/agent/orchestrator";
import { AGENT_QUESTIONS, isAgentQuestionId } from "@/agent/types";
import { getAuthSession } from "@/lib/auth-server";
import {
  createSessionProvider,
  getSessionProviderConfig,
  validateSessionCredential,
} from "@/ai/providers/session-provider";
import { createNvidiaSessionProvider, resolveNvidiaSessionModel } from "@/ai/providers/nvidia-session";

/**
 * POST /api/agent/k201-case
 *
 * The governed K-201 case investigator boundary. It resolves the authorised
 * persona on the SERVER (never from the request body), dispatches a read-only
 * tool plan, grounds the answer in governed evidence, and returns a structured,
 * citation-validated response. It executes no action, mutates nothing, and never
 * echoes or logs the request body. The provider is selected server-side from the
 * environment; a client cannot choose or influence the model.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4096;
const PROVIDER_HEADER = "x-aso-ai-provider";
const MODEL_HEADER = "x-aso-ai-model";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
} as const;

function json(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) {
      return json({ error: "Request too large" }, 413);
    }
    body = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return json({ error: "Malformed request" }, 400);
  }

  const questionId = (body as { questionId?: unknown } | null)?.questionId;
  if (!isAgentQuestionId(questionId)) {
    return json({ error: "Unknown question" }, 400);
  }

  const question = AGENT_QUESTIONS.find((q) => q.id === questionId)!.prompt;
  const ctx = readOperationalContext();
  const requestedProvider = request.headers.get(PROVIDER_HEADER);
  let provider;
  if (requestedProvider !== null && requestedProvider !== "mock") {
    if (!(await getAuthSession())) {
      return json({ error: "authentication_required" }, 401);
    }
    const model = request.headers.get(MODEL_HEADER) ?? (
      requestedProvider === "nvidia"
        ? "nvidia/nemotron-3.5-lightning-30b-a3b"
        : ""
    );
    const config = getSessionProviderConfig(requestedProvider, model);
    if (!config) return json({ error: "unsupported_provider_or_model" }, 400);
    const apiKey = validateSessionCredential(
      request.headers.get(`x-aso-${requestedProvider}-api-key`) ??
      (requestedProvider === "nvidia" ? request.headers.get("x-aso-nvidia-api-key") : null),
    );
    if (!apiKey) {
      return json({ error: "invalid_credential" }, 400);
    }
    provider = requestedProvider === "nvidia"
      ? createNvidiaSessionProvider(apiKey, model)
      : createSessionProvider(requestedProvider, model, apiKey);
    if (!provider) return json({ error: "unsupported_provider_or_model" }, 400);
  }

  try {
    const response = await investigateK201Case({
      viewerId: ctx.personaId,
      questionId,
      question,
      requestId: randomUUID(),
      provider,
    });
    return json(response);
  } catch {
    // Fail closed — never echo the request body or internal detail.
    return json({ error: "Investigation failed" }, 500);
  }
}
