import type { AiProvider, AiGenerationRequest, AiGenerationResult } from "../types";
import { approxTokens } from "../types";
import type { AiProviderId } from "@/domain/enums";

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

  constructor(opts: {
    id: AiProviderId;
    baseUrl: string;
    apiKey: string;
    model: string;
  }) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
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

    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: request.maxOutputTokens ?? 400,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `${this.id} request failed: ${res.status} ${res.statusText} ${body}`,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
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
