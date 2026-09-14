import "server-only";

import type { AiGenerationRequest, AiGenerationResult, AiProvider } from "../types";
import type { AiProviderId } from "@/domain/enums";
import { approxTokens } from "../types";
import { ProviderRequestError, type ProviderFailureCategory, type SafeProviderDiagnostics } from "./openai-compatible";

export type SessionProviderId = "nvidia" | "openrouter" | "openai" | "anthropic";
export type SessionProviderProtocol = "chat-completions" | "responses" | "messages";

export interface SessionProviderModel {
  readonly id: string;
  readonly label: string;
}

export interface SessionProviderConfig {
  readonly id: SessionProviderId;
  readonly label: string;
  readonly endpoint: string;
  readonly protocol: SessionProviderProtocol;
  readonly models: readonly SessionProviderModel[];
  readonly keyLabel: string;
  readonly disclosure: string;
}

export const SESSION_PROVIDER_REGISTRY: readonly SessionProviderConfig[] = [
  {
    id: "nvidia",
    label: "NVIDIA",
    endpoint: "https://integrate.api.nvidia.com/v1",
    protocol: "chat-completions",
    models: [{ id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B A3B" }],
    keyLabel: "NVIDIA API key",
    disclosure: "Requests are sent to NVIDIA using your own account and may incur NVIDIA usage charges.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    protocol: "chat-completions",
    models: [{ id: "openai/gpt-oss-20b:free", label: "OpenAI GPT-OSS 20B (free route)" }],
    keyLabel: "OpenRouter API key",
    disclosure: "Requests are sent through OpenRouter using your own account; provider routing and charges follow your OpenRouter account.",
  },
  {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    protocol: "responses",
    models: [{ id: "gpt-4.1-mini", label: "GPT-4.1 mini" }],
    keyLabel: "OpenAI API key",
    disclosure: "Requests are sent to OpenAI using your own account and may incur OpenAI usage charges.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    endpoint: "https://api.anthropic.com/v1",
    protocol: "messages",
    models: [{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }],
    keyLabel: "Anthropic API key",
    disclosure: "Requests are sent to Anthropic using your own account and may incur Anthropic usage charges.",
  },
] as const;

export interface PublicSessionProviderConfiguration {
  provider: SessionProviderId;
  label: string;
  endpoint: string;
  protocol: SessionProviderProtocol;
  keyLabel: string;
  disclosure: string;
  models: readonly SessionProviderModel[];
}

const MAX_API_KEY_LENGTH = 512;
const MIN_API_KEY_LENGTH = 8;

export function getSessionProviderConfig(provider: string, model: string): SessionProviderConfig | null {
  const config = SESSION_PROVIDER_REGISTRY.find((item) => item.id === provider);
  return config?.models.some((item) => item.id === model) ? config : null;
}

export function getPublicSessionProviderConfigurations(): PublicSessionProviderConfiguration[] {
  return SESSION_PROVIDER_REGISTRY.map(({ id, label, endpoint, protocol, keyLabel, disclosure, models }) => ({
    provider: id,
    label,
    endpoint,
    protocol,
    keyLabel,
    disclosure,
    models,
  }));
}

export function validateSessionCredential(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < MIN_API_KEY_LENGTH || trimmed.length > MAX_API_KEY_LENGTH || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function failureCategory(status: number): ProviderFailureCategory {
  if (status === 401) return "authentication_or_entitlement_rejected";
  if (status === 403) return "permission_denied";
  if (status === 402) return "insufficient_credit_or_entitlement";
  if (status === 404) return "endpoint_or_model_unavailable";
  if (status === 429) return "rate_limited_or_quota_unavailable";
  if (status >= 500) return "provider_unavailable";
  return "request_schema_rejected";
}

function requestId(headers: Headers): string | null {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("nvcf-reqid");
}

function safeUrl(url: string): Pick<SafeProviderDiagnostics, "origin" | "pathname"> {
  const parsed = new URL(url);
  return { origin: parsed.origin, pathname: parsed.pathname };
}

function errorFor(config: SessionProviderConfig, model: string, url: string, status: number | null, response: Response | null, category: ProviderFailureCategory, stage: SafeProviderDiagnostics["stage"]): ProviderRequestError {
  return new ProviderRequestError({
    ...safeUrl(url),
    status,
    requestId: response ? requestId(response.headers) : null,
    category,
    model,
    contentType: response?.headers.get("content-type") ?? null,
    stage,
  });
}

function bodyFor(config: SessionProviderConfig, request: AiGenerationRequest, model: string) {
  const messages = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];
  if (config.protocol === "responses") {
    return { model, instructions: request.system, input: request.user, max_output_tokens: request.maxOutputTokens ?? 800, temperature: 0.2 };
  }
  if (config.protocol === "messages") {
    return { model, system: request.system, messages: [{ role: "user", content: request.user }], max_tokens: request.maxOutputTokens ?? 800, temperature: 0.2 };
  }
  return { model, temperature: 0.2, top_p: 0.95, max_tokens: request.maxOutputTokens ?? 800, stream: false, messages };
}

function parseText(config: SessionProviderConfig, body: unknown): string {
  if (config.protocol === "responses") {
    const outputText = (body as { output_text?: unknown }).output_text;
    if (typeof outputText === "string") return outputText.trim();
    const output = (body as { output?: Array<{ content?: Array<{ text?: unknown }> }> }).output;
    return output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter((item): item is string => typeof item === "string").join("").trim() ?? "";
  }
  if (config.protocol === "messages") {
    const content = (body as { content?: Array<{ text?: unknown }> }).content;
    return content?.map((item) => item.text).filter((item): item is string => typeof item === "string").join("").trim() ?? "";
  }
  return ((body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content as string | undefined)?.trim() ?? "";
}

export class SessionProviderAdapter implements AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  private readonly config: SessionProviderConfig;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: SessionProviderConfig, apiKey: string, model: string, timeoutMs = 45_000) {
    this.config = config;
    this.id = config.id;
    this.model = model;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.model);
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const targetUrl = `${this.config.endpoint}/${
      this.config.protocol === "responses" ? "responses" : this.config.protocol === "messages" ? "messages" : "chat/completions"
    }`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: "POST",
        headers: this.config.protocol === "messages"
          ? { "Content-Type": "application/json", Accept: "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }
          : { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(bodyFor(this.config, request, this.model)),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      throw errorFor(this.config, this.model, targetUrl, null, null, error instanceof Error && error.name === "AbortError" ? "provider_timeout" : "network_tls_or_dns_failure", "request");
    }
    if (!response.ok) {
      clearTimeout(timeout);
      throw errorFor(this.config, this.model, targetUrl, response.status, response, failureCategory(response.status), "request");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw errorFor(this.config, this.model, targetUrl, response.status, response, error instanceof Error && error.name === "AbortError" ? "provider_timeout" : "response_schema_mismatch", "body_parsing");
    } finally {
      clearTimeout(timeout);
    }
    const text = parseText(this.config, body);
    if (!text) throw errorFor(this.config, this.model, targetUrl, response.status, response, "invalid_or_incomplete_output", "schema_validation");
    const usage = body as { usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number } };
    const suppliedModel = (body as { model?: unknown }).model;
    return {
      text,
      provider: this.id,
      model: typeof suppliedModel === "string" && suppliedModel.length <= 160 ? suppliedModel : this.model,
      inputTokens: usage.usage?.prompt_tokens ?? usage.usage?.input_tokens ?? approxTokens(request.system + request.user),
      outputTokens: usage.usage?.completion_tokens ?? usage.usage?.output_tokens ?? approxTokens(text),
      latencyMs: Date.now() - started,
    };
  }
}

export function createSessionProvider(provider: string, model: string, apiKey: string): SessionProviderAdapter | null {
  const config = getSessionProviderConfig(provider, model);
  return config ? new SessionProviderAdapter(config, apiKey, model) : null;
}
