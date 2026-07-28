import type { AiProvider } from "./types";
import { MockAiProvider } from "./providers/mock";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";

/**
 * Provider selection. Reads environment; defaults to the offline mock so the
 * app runs with no API key. Never import providers directly from UI — always
 * go through the server-side service which calls this.
 */
export function getAiProvider(): AiProvider {
  const choice = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  if (choice === "nvidia") {
    const provider = new OpenAiCompatibleProvider({
      id: "nvidia",
      baseUrl: process.env.NVIDIA_API_BASE_URL ?? "",
      apiKey: process.env.NVIDIA_API_KEY ?? "",
      model: process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct",
    });
    // Fail safe to mock if the operator selected nvidia but left keys blank.
    return provider.isAvailable() ? provider : new MockAiProvider();
  }

  if (choice === "dgxspark") {
    const provider = new OpenAiCompatibleProvider({
      id: "dgxspark",
      baseUrl: process.env.DGXSPARK_API_BASE_URL ?? "",
      apiKey: process.env.DGXSPARK_API_KEY ?? "",
      model: process.env.DGXSPARK_MODEL ?? "",
    });
    return provider.isAvailable() ? provider : new MockAiProvider();
  }

  return new MockAiProvider();
}

export type { AiProvider } from "./types";
