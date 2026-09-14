import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-server";
import {
  createSessionProvider,
  getPublicSessionProviderConfigurations,
  getSessionProviderConfig,
  validateSessionCredential,
} from "@/ai/providers/session-provider";
import { ProviderRequestError, type SafeProviderDiagnostics } from "@/ai/providers/openai-compatible";
import { createNvidiaSessionProvider, resolveNvidiaSessionModel } from "@/ai/providers/nvidia-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_HEADER = "x-aso-ai-provider";
const MODEL_HEADER = "x-aso-ai-model";
const MAX_DECLARED_BYTES = 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: object, status = 200): Response {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getAuthSession());
}

export async function GET(): Promise<Response> {
  if (!(await isAuthenticated())) return json({ error: "authentication_required" }, 401);
  const providers = getPublicSessionProviderConfigurations();
  const nvidia = providers.find((item) => item.provider === "nvidia")!;
  return json({ providers, provider: nvidia.provider, endpoint: nvidia.endpoint, model: nvidia.models[0]!.id });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_DECLARED_BYTES) return json({ error: "request_too_large" }, 413);
  if (!(await isAuthenticated())) return json({ error: "authentication_required" }, 401);

  const legacyKey = request.headers.get("x-aso-nvidia-api-key");
  const providerId = request.headers.get(PROVIDER_HEADER) ?? (legacyKey ? "nvidia" : "");
  const modelId = request.headers.get(MODEL_HEADER) ?? getPublicSessionProviderConfigurations().find((item) => item.provider === providerId)?.models[0]?.id ?? "";
  const config = getSessionProviderConfig(providerId, modelId);
  if (!config) return json({ error: "unsupported_provider_or_model" }, 400);
  const apiKey = validateSessionCredential(legacyKey ?? request.headers.get(`x-aso-${providerId}-api-key`));
  if (!apiKey) return json({ error: "invalid_credential" }, 400);

  try {
    const resolvedModel = providerId === "nvidia" ? await resolveNvidiaSessionModel(apiKey) : modelId;
    const provider = providerId === "nvidia"
      ? createNvidiaSessionProvider(apiKey, resolvedModel)
      : createSessionProvider(providerId, modelId, apiKey);
    if (!provider) return json({ error: "unsupported_provider_or_model" }, 400);
    const result = await provider.generate({
      useCase: "provider-connection-test",
      promptKey: "provider-connection-test",
      promptVersion: "2026-09-14.v1",
      system: "Return one compact JSON object confirming that this provider connection is responsive.",
      user: 'Return exactly {"connected":true}.',
      evidence: [],
      maxOutputTokens: 32,
    });
    return json({ status: "connection_test_succeeded", provider: providerId, endpoint: config.endpoint, model: result.model });
  } catch (error) {
    const diagnostics: SafeProviderDiagnostics = error instanceof ProviderRequestError
      ? error.diagnostics
      : {
          origin: new URL(config.endpoint).origin,
          pathname: `${new URL(config.endpoint).pathname}/${config.protocol === "responses" ? "responses" : config.protocol === "messages" ? "messages" : "chat/completions"}`,
          status: null,
          requestId: null,
          category: "network_tls_or_dns_failure",
          model: modelId,
          contentType: null,
          stage: "request",
        };
    return json({ error: "provider_connection_failed", diagnostics }, 502);
  }
}
