/**
 * Typed source/integration states. Used to present source AVAILABILITY as an
 * explicit state — never as a metric value (e.g. never "awaiting CMMS" in a
 * number slot). In Phase 2A the only live source is the local seeded dataset
 * (state "synthetic"); external systems are "not_connected".
 */

export type IntegrationState =
  | "connected"
  | "partial"
  | "not_connected"
  | "stale"
  | "error"
  | "synthetic";

export type SourceKey =
  | "historian"
  | "cmms"
  | "shift_log"
  | "procurement"
  | "inventory"
  | "turnaround_scheduling"
  | "ai_runtime"
  | "local_seed";

export interface SourceState {
  key: SourceKey;
  label: string;
  state: IntegrationState;
  note?: string;
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
  historian: "Historian / PI",
  cmms: "CMMS / EAM",
  shift_log: "Shift log",
  procurement: "Procurement",
  inventory: "ERP / Inventory",
  turnaround_scheduling: "Turnaround scheduling",
  ai_runtime: "AI runtime",
  local_seed: "Local seeded data",
};

export const INTEGRATION_STATE_META: Record<
  IntegrationState,
  { label: string; tone: "healthy" | "attention" | "neutral" | "critical" | "info" }
> = {
  connected: { label: "Connected", tone: "healthy" },
  partial: { label: "Partial", tone: "attention" },
  not_connected: { label: "Not connected", tone: "neutral" },
  stale: { label: "Stale", tone: "attention" },
  error: { label: "Error", tone: "critical" },
  synthetic: { label: "Synthetic", tone: "info" },
};

/**
 * Phase 2A source availability: the seeded dataset is the active (synthetic)
 * source; every external system is not yet connected. A given source can be
 * overridden per view (e.g. inventory is synthetic because the demo seeds it).
 */
export function defaultSourceStates(keys: SourceKey[]): SourceState[] {
  return keys.map((key) => ({
    key,
    label: SOURCE_LABELS[key],
    state: key === "local_seed" ? "synthetic" : ("not_connected" as IntegrationState),
  }));
}

/** Whether a source can currently supply factual operational records. */
export function sourceHasData(state: IntegrationState): boolean {
  return state === "connected" || state === "partial" || state === "synthetic";
}
