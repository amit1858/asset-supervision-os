import "server-only";
import type { AiProvider, AiGenerationRequest, AiGenerationResult } from "../types";
import { approxTokens } from "../types";

/**
 * Azure AI Foundry provider adapter (server-only).
 *
 * Talks to an Azure AI Foundry / Azure OpenAI chat-completions deployment over
 * the documented OpenAI-compatible surface, authenticated with the `api-key`
 * header (NOT a bearer token). It is optional: it is only selected when
 * `AI_PROVIDER=azure` AND the endpoint, key and deployment are all present. No
 * request is ever made without an explicit key, so this is inert in CI and
 * offline development.
 *
 * Reliability contract:
 *  - a hard timeout via `AbortController`;
 *  - at most ONE retry, and only for transient failures (network error, 429,
 *    5xx). Auth/client (4xx except 429) and malformed responses never retry;
 *  - structured output is requested in JSON mode (`response_format:
 *    { type: "json_object" }`) for broad deployment compatibility. JSON mode
 *    guarantees syntactically valid JSON but does NOT enforce our response
 *    schema — it is not strict `json_schema` structured output. Schema and
 *    citation correctness are therefore enforced SERVER-SIDE by the orchestrator
 *    (zod `providerDraftSchema` + `validateProviderDraft`), which discards the
 *    provider response WHOLE on any failure and uses the deterministic answer.
 *    This adapter never repairs or partially accepts provider output;
 *  - any failure throws, and the orchestrator falls back to the deterministic
 *    response — the model can never degrade governance.
 */

export interface AzureFoundryOptions {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly deployment: string;
  readonly apiVersion: string;
  readonly timeoutMs?: number;
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class AzureFoundryProvider implements AiProvider {
  readonly id = "azure" as const;
  readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  constructor(opts: AzureFoundryOptions) {
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.deployment = opts.deployment;
    this.apiVersion = opts.apiVersion;
    this.model = opts.deployment;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  isAvailable(): boolean {
    return Boolean(this.endpoint && this.apiKey && this.deployment && this.apiVersion);
  }

  private url(): string {
    return `${this.endpoint}/openai/deployments/${encodeURIComponent(
      this.deployment,
    )}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`;
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.isAvailable()) {
      throw new Error(
        "azure provider is not configured (missing endpoint, API key, deployment, or api-version).",
      );
    }

    const body = JSON.stringify({
      model: this.deployment,
      temperature: 0.2,
      max_tokens: request.maxOutputTokens ?? 700,
      // JSON mode (not strict json_schema): guarantees valid JSON only. The
      // server-side zod + citation validators are the authoritative schema gate.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    });

    const start = Date.now();
    // One initial attempt plus at most one retry, transient failures only.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.attempt(body, start);
      } catch (err) {
        lastError = err;
        if (err instanceof AzureTransientError && attempt === 0) continue;
        throw err instanceof AzureTransientError ? err.cause ?? err : err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("azure request failed");
  }

  private async attempt(body: string, start: number): Promise<AiGenerationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.url(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error / abort — transient.
      throw new AzureTransientError("azure request network error", err);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const message = `azure request failed: ${res.status} ${res.statusText} ${detail}`.trim();
      if (TRANSIENT_STATUS.has(res.status)) {
        throw new AzureTransientError(message);
      }
      throw new Error(message);
    }

    const json = (await res.json().catch(() => {
      throw new Error("azure response was not valid JSON");
    })) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new Error("azure response contained no content");
    }

    return {
      text,
      provider: this.id,
      model: this.model,
      inputTokens: json.usage?.prompt_tokens ?? approxTokens(text),
      outputTokens: json.usage?.completion_tokens ?? approxTokens(text),
      latencyMs: Date.now() - start,
    };
  }
}

/** Marks a failure as safe to retry once. Non-transient failures are plain Errors. */
class AzureTransientError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AzureTransientError";
    this.cause = cause;
  }
}
