import type { MicPermission, SpeechInputProvider, VoiceState } from "./types";

/**
 * Pure, testable state helpers for the voice session state machine. Kept
 * separate from the React hook so the transitions can be unit-tested without a
 * DOM. The microphone is NEVER engaged here on load — these run only in response
 * to explicit user actions.
 */

export function resolveInitialMicState(
  input: SpeechInputProvider,
  online: boolean,
): Extract<VoiceState, "ready" | "unavailable" | "offline"> {
  if (!online) return "offline";
  if (!input.isAvailable()) return "unavailable";
  return "ready";
}

export function micStateFromPermission(
  p: MicPermission,
): Extract<VoiceState, "listening" | "permission_denied" | "unavailable"> {
  if (p === "denied") return "permission_denied";
  if (p === "unavailable") return "unavailable";
  return "listening";
}

/** Human-readable label for each session state (for the status line + a11y). */
export const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  closed: "Closed",
  ready: "Ready",
  listening: "Microphone active — listening",
  transcribing: "Transcribing",
  thinking: "Thinking",
  responding: "Responding",
  permission_denied: "Microphone permission denied",
  unavailable: "Microphone unavailable",
  offline: "Offline",
  error: "Something went wrong",
};
