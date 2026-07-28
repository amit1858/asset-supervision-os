import type { AiProviderId } from "@/domain/enums";

/**
 * Provider-neutral AI interface.
 *
 * UI components MUST NOT import providers directly. All model calls go through
 * a server-side service (`src/ai/service.ts`) which selects a provider via
 * `getAiProvider()`. This keeps the app model-portable: mock today, an
 * NVIDIA API-compatible endpoint next, a DGX Spark-hosted model later — with
 * no change to callers.
 */

export interface EvidenceLine {
  label: string;
  value: string;
  provenance: string;
}

export interface AiGenerationRequest {
  useCase: string;
  promptKey: string;
  promptVersion: string;
  /** Fully rendered system prompt. */
  system: string;
  /** Fully rendered user prompt (already contains the evidence block). */
  user: string;
  /** Structured evidence the model is permitted to ground on. */
  evidence: EvidenceLine[];
  maxOutputTokens?: number;
}

export interface AiGenerationResult {
  text: string;
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Milliseconds; may be synthetic/deterministic for the mock provider. */
  latencyMs: number;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  /** Whether the provider is usable in the current environment (keys present). */
  isAvailable(): boolean;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

/** Rough token estimate (≈ 4 chars/token). Deterministic, no tokenizer dep. */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
