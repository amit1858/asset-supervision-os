import type {
  AssetOperationalStatus,
  Criticality,
  DataFreshness,
  EventSeverity,
  Provenance,
  ReadinessStatus,
  RecommendedDisposition,
  ValueStatus,
  WorkOrderStatus,
} from "@/domain/enums";

/**
 * Central status → presentation mapping.
 *
 * Every entry pairs a color role with BOTH a text label and a shape symbol, so
 * meaning is never conveyed by color alone (WCAG 2.1 AA, §1.4.1). The four
 * status families are kept deliberately separate — an operational status token
 * is not reused for event severity, data freshness, or work-order status.
 */
export interface StatusToken {
  label: string;
  /** Badge background/text/border utility classes. */
  className: string;
  /** Solid indicator-dot color class. */
  dotClass: string;
  /** Non-color shape cue rendered next to the label. */
  symbol: string;
}

const CRITICAL = "bg-critical-subtle text-critical-text border-critical-border";
const ATTENTION = "bg-attention-subtle text-attention-text border-attention-border";
const HEALTHY = "bg-healthy-subtle text-healthy-text border-healthy-border";
const INFO = "bg-info-subtle text-info-text border-info-border";
const NEUTRAL = "bg-neutralstatus-subtle text-neutralstatus-text border-neutralstatus-border";
const PLANNED = "bg-planned-subtle text-planned-text border-planned-border";
const AI = "bg-ai-subtle text-ai-text border-ai-border";

export const OPERATIONAL_STATUS: Record<AssetOperationalStatus, StatusToken> = {
  normal: { label: "Normal", className: HEALTHY, dotClass: "bg-healthy", symbol: "●" },
  monitor: { label: "Monitor", className: INFO, dotClass: "bg-info", symbol: "◑" },
  attention: { label: "Attention", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  critical: { label: "Critical", className: CRITICAL, dotClass: "bg-critical", symbol: "◆" },
  offline: { label: "Offline", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "○" },
  maintenance: { label: "Maintenance", className: PLANNED, dotClass: "bg-planned", symbol: "⚙" },
  planned_outage: { label: "Planned outage", className: PLANNED, dotClass: "bg-planned", symbol: "▣" },
};

export const EVENT_SEVERITY: Record<EventSeverity, StatusToken> = {
  info: { label: "Info", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "ℹ" },
  low: { label: "Low", className: INFO, dotClass: "bg-info", symbol: "•" },
  medium: { label: "Medium", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  high: { label: "High", className: CRITICAL, dotClass: "bg-critical", symbol: "▲" },
  critical: { label: "Critical", className: CRITICAL, dotClass: "bg-critical", symbol: "◆" },
};

export const CRITICALITY: Record<Criticality, StatusToken> = {
  A: { label: "Criticality A", className: CRITICAL, dotClass: "bg-critical", symbol: "A" },
  B: { label: "Criticality B", className: ATTENTION, dotClass: "bg-attention", symbol: "B" },
  C: { label: "Criticality C", className: INFO, dotClass: "bg-info", symbol: "C" },
  D: { label: "Criticality D", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "D" },
  E: { label: "Criticality E", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "E" },
};

export const PROVENANCE: Record<Provenance, StatusToken> = {
  measured: { label: "Measured", className: INFO, dotClass: "bg-info", symbol: "◎" },
  deterministic: { label: "Calculated", className: "bg-brand-subtle text-brand-text border-brand", dotClass: "bg-brand", symbol: "∑" },
  business_rule: { label: "Business rule", className: INFO, dotClass: "bg-info", symbol: "⚖" },
  statistical: { label: "Predicted", className: ATTENTION, dotClass: "bg-attention", symbol: "≈" },
  ai_generated: { label: "AI-generated", className: AI, dotClass: "bg-ai", symbol: "✦" },
  human: { label: "Human", className: HEALTHY, dotClass: "bg-healthy", symbol: "☑" },
};

export const FRESHNESS: Record<DataFreshness, StatusToken> = {
  live: { label: "Live", className: HEALTHY, dotClass: "bg-healthy", symbol: "●" },
  recent: { label: "Recent", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "◐" },
  stale: { label: "Stale", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  offline: { label: "No data", className: CRITICAL, dotClass: "bg-critical", symbol: "○" },
};

export const READINESS: Record<ReadinessStatus, StatusToken> = {
  ready: { label: "Ready", className: HEALTHY, dotClass: "bg-healthy", symbol: "●" },
  on_track: { label: "On track", className: INFO, dotClass: "bg-info", symbol: "◑" },
  at_risk: { label: "At risk", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  not_started: { label: "Not started", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "○" },
};

export const WORK_ORDER_STATUS: Record<WorkOrderStatus, StatusToken> = {
  draft: { label: "Draft", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "○" },
  planned: { label: "Planned", className: INFO, dotClass: "bg-info", symbol: "◑" },
  scheduled: { label: "Scheduled", className: INFO, dotClass: "bg-info", symbol: "◑" },
  in_progress: { label: "In progress", className: ATTENTION, dotClass: "bg-attention", symbol: "◧" },
  on_hold: { label: "On hold", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  completed: { label: "Completed", className: HEALTHY, dotClass: "bg-healthy", symbol: "●" },
  cancelled: { label: "Cancelled", className: NEUTRAL, dotClass: "bg-neutralstatus", symbol: "✕" },
};

export const VALUE_STATUS: Record<ValueStatus, StatusToken> = {
  projected: { label: "Projected", className: ATTENTION, dotClass: "bg-attention", symbol: "≈" },
  validated: { label: "Validated", className: INFO, dotClass: "bg-info", symbol: "◑" },
  realised: { label: "Realised", className: HEALTHY, dotClass: "bg-healthy", symbol: "●" },
};

export const DISPOSITION: Record<RecommendedDisposition, StatusToken> = {
  immediate: { label: "Immediate action", className: CRITICAL, dotClass: "bg-critical", symbol: "◆" },
  planned_maintenance: { label: "Planned maintenance", className: ATTENTION, dotClass: "bg-attention", symbol: "▲" },
  next_turnaround: { label: "Next turnaround", className: PLANNED, dotClass: "bg-planned", symbol: "▣" },
  monitor: { label: "Monitor", className: INFO, dotClass: "bg-info", symbol: "◑" },
};

/** Chart color for a named metric (kept consistent across every screen). */
export const METRIC_CHART_COLOR: Record<string, string> = {
  vibration: "var(--chart-vibration)",
  temperature: "var(--chart-temperature)",
  risk: "var(--chart-risk)",
  oee: "var(--chart-oee)",
  availability: "var(--chart-availability)",
  performance: "var(--chart-performance)",
  quality: "var(--chart-quality)",
};
