import type { MicPermission, SpeechInputProvider, SpeechOutputProvider } from "../types";

/**
 * Mock speech capture. Never captures real audio and never requests permission
 * in its constructor — `requestPermission()` runs only when called by an
 * explicit user action. Configurable to exercise permission/availability states.
 */
export class MockSpeechInputProvider implements SpeechInputProvider {
  readonly id = "mock-speech-input";
  private readonly available: boolean;
  private readonly permission: MicPermission;

  constructor(opts: { available?: boolean; permission?: MicPermission } = {}) {
    this.available = opts.available ?? true;
    this.permission = opts.permission ?? "granted";
  }

  isAvailable(): boolean {
    return this.available;
  }

  async requestPermission(): Promise<MicPermission> {
    return this.permission;
  }
}

/**
 * Mock speech output. Phase 2A does NOT auto-speak; this is a no-op adapter that
 * retains no audio. A live provider (e.g. Web Speech, NVIDIA Riva) would sit
 * behind this same interface later.
 */
export class MockSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = "mock-speech-output";
  isAvailable(): boolean {
    return true;
  }
  speak(text: string): void {
    void text; /* no-op: deterministic mock does not auto-speak; no audio retained */
  }
  stop(): void {}
}
