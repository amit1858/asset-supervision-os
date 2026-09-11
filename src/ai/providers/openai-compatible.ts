import type { AiProvider, AiGenerationRequest, AiGenerationResult } from "../types";
import { approxTokens } from "../types";
import type { AiProviderId } from "@/domain/enums";

export type ProviderFailureCategory =
  | "authentication_or_entitlement_rejected"
  | "endpoint_or_model_unavailable"
  | "rate_limited_or_quota_unavailable"
  | "nvidia_service_failure"
  | "request_schema_rejected"
  | "response_schema_mismatch"
  | "network_tls_or_dns_failure"
  | "provider_timeout";

export type ProviderFailureStage =
  | "request"
  | "body_parsing"
  | "schema_validation";

export interface SafeProviderDiagnostics {
  origin: string;
  pathname: string;
  status: number | null;
  requestId: string | null;
  category: ProviderFailureCategory;
  model: string;
  contentType: string | null;
  stage: ProviderFailureStage;
}

export class ProviderRequestError extends Error {
  readonly diagnostics: SafeProviderDiagnostics;

  constructor(diagnostics: SafeProviderDiagnostics) {
    super(`Provider request failed: ${diagnostics.category}.`);
    this.name = "ProviderRequestError";
    this.diagnostics = diagnostics;
  }
}

function categoryForStatus(status: number): ProviderFailureCategory {
  if (status === 401 || status === 403) {
    return "authentication_or_entitlement_rejected";
  }
  if (status === 404) return "endpoint_or_model_unavailable";
  if (status === 429) return "rate_limited_or_quota_unavailable";
  if (status >= 500) return "nvidia_service_failure";
  return "request_schema_rejected";
}

function safeUrl(url: string): Pick<SafeProviderDiagnostics, "origin" | "pathname"> {
  const parsed = new URL(url);
  return { origin: parsed.origin, pathname: parsed.pathname };
}

function requestId(headers: Headers): string | null {
  return (
    headers.get("nvcf-reqid") ??
    headers.get("x-request-id") ??
    headers.get("request-id")
  );
}

/**
 * NVIDIA API-compatible provider adapter (OpenAI-compatible /chat/completions).
 *
 * Optional integration — only used when AI_PROVIDER=nvidia and credentials are
 * present. The same class shape works for a DGX Spark-hosted, OpenAI-compatible
 * endpoint (see `DgxSparkAiProvider` factory usage in index.ts): only the base
 * URL, key, and model change. No API call is ever made without an explicit key.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: {
    id: AiProviderId;
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs?: number;
  }) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.isAvailable()) {
      throw new Error(
        `${this.id} provider is not configured (missing base URL, API key, or model).`,
      );
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: request.maxOutputTokens ?? 400,
      stream: false,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    };

    // NVIDIA-only structured-narration contract. Nemotron models enable
    // chain-of-thought reasoning by default; that reasoning consumes the fixed
    // narration token budget and truncates the JSON (finish_reason=length), so
    // the orchestrator discards the draft and uses the deterministic fallback.
    // Disable reasoning (`chat_template_kwargs.enable_thinking=false`) to keep
    // the bounded output concise. This field is part of the current Nemotron API
    // Catalog contract. The orchestrator remains the authoritative
    // JSON/schema/grounding gate and discards the response whole on any failure.
    if (this.id === "nvidia") {
      payload.chat_template_kwargs = { enable_thinking: false };
    }

    const targetUrl = `${this.baseUrl}/chat/completions`;
    const target = safeUrl(targetUrl);
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError({
          ...target,
          status: null,
          requestId: null,
          category: "provider_timeout",
          model: this.model,
          contentType: null,
          stage: "request",
        });
      }
      throw new ProviderRequestError({
        ...target,
        status: null,
        requestId: null,
        category: "network_tls_or_dns_failure",
        model: this.model,
        contentType: null,
        stage: "request",
      });
    }

    const responseUrl = res.url ? safeUrl(res.url) : target;
    const contentType = res.headers.get("content-type");
    const correlationId = requestId(res.headers);
    if (!res.ok) {
      clearTimeout(timeout);
      throw new ProviderRequestError({
        ...responseUrl,
        status: res.status,
        requestId: correlationId,
        category: categoryForStatus(res.status),
        model: this.model,
        contentType,
        stage: "request",
      });
    }

    let json: {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError({
          ...responseUrl,
          status: res.status,
          requestId: correlationId,
          category: "provider_timeout",
          model: this.model,
          contentType,
          stage: "body_parsing",
        });
      }
      throw new ProviderRequestError({
        ...responseUrl,
        status: res.status,
        requestId: correlationId,
        category: "response_schema_mismatch",
        model: this.model,
        contentType,
        stage: "body_parsing",
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new ProviderRequestError({
        ...responseUrl,
        status: res.status,
        requestId: correlationId,
        category: "response_schema_mismatch",
        model: this.model,
        contentType,
        stage: "schema_validation",
      });
    }
    const inputTokens =
      json.usage?.prompt_tokens ??
      approxTokens(request.system + "\n" + request.user);
    const outputTokens = json.usage?.completion_tokens ?? approxTokens(text);

    return {
      text,
      provider: this.id,
      model: this.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - start,
    };
  }
}
