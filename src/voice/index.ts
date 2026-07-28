import { MockSpeechInputProvider, MockSpeechOutputProvider } from "./providers/mock-speech";
import type { SpeechInputProvider, SpeechOutputProvider } from "./types";

/**
 * Client-safe voice exports. The conversation/truth provider is NOT exported
 * here — grounding runs on the server (see `voice/server/conversation-service`
 * and the `/api/voice/brief-conversation` route), so the browser never bundles
 * `buildPersonaBrief` or the seeded dataset. Only speech adapters (which will
 * later wrap real browser/live providers) and the pure session/suggestion
 * helpers are client-safe.
 */
export function getSpeechInput(): SpeechInputProvider {
  return new MockSpeechInputProvider();
}

export function getSpeechOutput(): SpeechOutputProvider {
  return new MockSpeechOutputProvider();
}

export * from "./types";
export * from "./suggestions";
export * from "./session";
