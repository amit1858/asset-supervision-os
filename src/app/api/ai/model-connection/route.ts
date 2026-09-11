import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-server";
import {
  createNvidiaSessionProvider,
  getNvidiaSessionConfiguration,
  resolveNvidiaSessionModel,
  validateSessionApiKey,
} from "@/ai/providers/nvidia-session";
import {
  ProviderRequestError,
  type SafeProviderDiagnostics,
} from "@/ai/providers/openai-compatible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY_HEADER = "x-aso-nvidia-api-key";
const MAX_DECLARED_BYTES = 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: object, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getAuthSession());
}

export async function GET(): Promise<Response> {
  if (!(await isAuthenticated())) {
    return json({ error: "authentication_required" }, 401);
  }
  try {
    return json(getNvidiaSessionConfiguration());
  } catch {
    return json({ error: "provider_configuration_unavailable" }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_DECLARED_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }
  if (!(await isAuthenticated())) {
    return json({ error: "authentication_required" }, 401);
  }

  const apiKey = validateSessionApiKey(request.headers.get(API_KEY_HEADER));
  if (!apiKey) {
    return json({ error: "invalid_credential" }, 400);
  }

  try {
    const model = await resolveNvidiaSessionModel(apiKey, 12_000);
    const provider = createNvidiaSessionProvider(apiKey, model, 20_000);
    const result = await provider.generate({
      useCase: "provider-connection-test",
      promptKey: "provider-connection-test",
      promptVersion: "2026-09-10.v1",
      system:
        "Return one compact JSON object confirming that this provider connection is responsive.",
      user: 'Return exactly {"connected":true}.',
      evidence: [],
      maxOutputTokens: 32,
    });
    if (!result.text.trim()) {
      return json({ error: "provider_connection_failed" }, 502);
    }
    return json({
      status: "connection_test_succeeded",
      provider: "nvidia",
      endpoint: getNvidiaSessionConfiguration().endpoint,
      model: result.model,
    });
  } catch (error) {
    const diagnostics: SafeProviderDiagnostics =
      error instanceof ProviderRequestError
        ? error.diagnostics
        : {
            origin: "https://integrate.api.nvidia.com",
            pathname: "/v1/chat/completions",
            status: null,
            requestId: null,
            category: "network_tls_or_dns_failure",
            model: getNvidiaSessionConfiguration().model,
            contentType: null,
            stage: "request",
          };
    return json({ error: "provider_connection_failed", diagnostics }, 502);
  }
}
