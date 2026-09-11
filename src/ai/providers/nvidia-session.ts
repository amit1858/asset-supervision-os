import "server-only";
import {
  OpenAiCompatibleProvider,
  ProviderRequestError,
  type SafeProviderDiagnostics,
} from "./openai-compatible";

export const NVIDIA_SESSION_PROVIDER_ID = "nvidia" as const;
export const NVIDIA_SESSION_ENDPOINT = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_SESSION_MODELS_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/models";
export const NVIDIA_SESSION_DEFAULT_MODEL =
  "nvidia/nemotron-3.5-lightning-30b-a3b";
export const NVIDIA_SESSION_MODEL = NVIDIA_SESSION_DEFAULT_MODEL;
export const NVIDIA_SESSION_COMPLETION_TIMEOUT_MS = 45_000;

const MAX_API_KEY_LENGTH = 512;
const MIN_API_KEY_LENGTH = 8;

export interface NvidiaSessionConfiguration {
  provider: typeof NVIDIA_SESSION_PROVIDER_ID;
  endpoint: string;
  model: string;
}

export function getNvidiaSessionConfiguration(): NvidiaSessionConfiguration {
  const endpoint = new URL(NVIDIA_SESSION_ENDPOINT);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "integrate.api.nvidia.com"
  ) {
    throw new Error("NVIDIA provider configuration is unavailable.");
  }
  if (!NVIDIA_SESSION_MODEL) {
    throw new Error("NVIDIA provider configuration is unavailable.");
  }
  return {
    provider: NVIDIA_SESSION_PROVIDER_ID,
    endpoint: endpoint.toString().replace(/\/$/, ""),
    model: NVIDIA_SESSION_MODEL,
  };
}

export function validateSessionApiKey(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    trimmed.length < MIN_API_KEY_LENGTH ||
    trimmed.length > MAX_API_KEY_LENGTH ||
    /[\r\n]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function createNvidiaSessionProvider(
  apiKey: string,
  model = NVIDIA_SESSION_MODEL,
  timeoutMs = NVIDIA_SESSION_COMPLETION_TIMEOUT_MS,
): OpenAiCompatibleProvider {
  const config = getNvidiaSessionConfiguration();
  return new OpenAiCompatibleProvider({
    id: config.provider,
    baseUrl: config.endpoint,
    apiKey,
    model,
    timeoutMs,
  });
}

function modelsFailure(
  category: SafeProviderDiagnostics["category"],
  model: string,
  status: number | null,
  response?: Response,
  stage: SafeProviderDiagnostics["stage"] = "request",
): ProviderRequestError {
  return new ProviderRequestError({
    origin: "https://integrate.api.nvidia.com",
    pathname: "/v1/models",
    status,
    requestId:
      response?.headers.get("nvcf-reqid") ??
      response?.headers.get("x-request-id") ??
      response?.headers.get("request-id") ??
      null,
    category,
    model,
    contentType: response?.headers.get("content-type") ?? null,
    stage,
  });
}

export async function resolveNvidiaSessionModel(
  apiKey: string,
  timeoutMs = 12_000,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(NVIDIA_SESSION_MODELS_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw modelsFailure("provider_timeout", NVIDIA_SESSION_MODEL, null);
    }
    throw modelsFailure(
      "network_tls_or_dns_failure",
      NVIDIA_SESSION_MODEL,
      null,
    );
  }

  if (!response.ok) {
    clearTimeout(timeout);
    const category =
      response.status === 401 || response.status === 403
        ? "authentication_or_entitlement_rejected"
        : response.status === 404
          ? "endpoint_or_model_unavailable"
          : response.status === 429
            ? "rate_limited_or_quota_unavailable"
            : response.status >= 500
              ? "nvidia_service_failure"
              : "request_schema_rejected";
    throw modelsFailure(category, NVIDIA_SESSION_MODEL, response.status, response);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw modelsFailure(
        "provider_timeout",
        NVIDIA_SESSION_MODEL,
        response.status,
        response,
        "body_parsing",
      );
    }
    throw modelsFailure(
      "response_schema_mismatch",
      NVIDIA_SESSION_MODEL,
      response.status,
      response,
      "body_parsing",
    );
  } finally {
    clearTimeout(timeout);
  }

  const models =
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: Array<{ id?: unknown }> }).data
          .map((item) => item.id)
          .filter((id): id is string => typeof id === "string")
      : null;
  if (!models) {
    throw modelsFailure(
      "response_schema_mismatch",
      NVIDIA_SESSION_MODEL,
      response.status,
      response,
      "schema_validation",
    );
  }
  if (models.includes(NVIDIA_SESSION_MODEL)) return NVIDIA_SESSION_MODEL;
  if (models.includes(NVIDIA_SESSION_DEFAULT_MODEL)) {
    return NVIDIA_SESSION_DEFAULT_MODEL;
  }
  throw modelsFailure(
    "endpoint_or_model_unavailable",
    NVIDIA_SESSION_MODEL,
    response.status,
    response,
    "schema_validation",
  );
}
