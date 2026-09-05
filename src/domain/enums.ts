/**
 * Shared enumerations for Asset Supervision OS.
 *
 * The status model deliberately keeps four SEPARATE concepts distinct
 * (see docs/design-system.md §Status hierarchy):
 *   - AssetOperationalStatus  → what state the equipment is in
 *   - EventSeverity           → how serious a condition/event is
 *   - DataFreshness           → how trustworthy/recent the data is
 *   - WorkOrderStatus         → where a work order sits in its lifecycle
 * One badge or color must never be overloaded to represent all of them.
 */

/** Operational state of a physical asset. */
export type AssetOperationalStatus =
  | "normal"
  | "monitor"
  | "attention"
  | "critical"
  | "offline"
  | "maintenance"
  | "planned_outage";

/** Severity of a condition event, anomaly, or alert. */
export type EventSeverity = "info" | "low" | "medium" | "high" | "critical";

/** How fresh/trustworthy a data point or feed is. */
export type DataFreshness = "live" | "recent" | "stale" | "offline";

/** Equipment criticality class (A = highest consequence of failure). */
export type Criticality = "A" | "B" | "C" | "D" | "E";

/** Lifecycle status of a work order. */
export type WorkOrderStatus =
  | "draft"
  | "planned"
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export type WorkOrderType =
  | "preventive"
  | "predictive"
  | "corrective"
  | "inspection"
  | "turnaround";

export type WorkOrderPriority = "P1" | "P2" | "P3" | "P4";

/**
 * Provenance of a fact or insight — the core trust primitive. Every value
 * shown to a user must be attributable to one of these so the UI can
 * distinguish measured facts, calculations, predictions, AI text, and human
 * judgement (design principle: "Distinguish deterministic facts, model
 * inference and human decisions").
 */
export type Provenance =
  | "measured" // raw observed sensor/operational data
  | "deterministic" // exact calculation from measured data
  | "business_rule" // rule/threshold evaluation
  | "statistical" // statistical prediction / trend extrapolation
  | "ai_generated" // LLM-produced natural-language explanation
  | "human"; // human decision or annotation

/** Disposition of a recommendation once a human has acted. */
export type DecisionType = "approved" | "rejected" | "modified" | "deferred";

/** Recommended disposition path for an asset risk. */
export type RecommendedDisposition =
  | "immediate"
  | "planned_maintenance"
  | "next_turnaround"
  | "monitor";

/** Value realisation status — projected savings are NEVER shown as realised. */
export type ValueStatus = "projected" | "validated" | "realised";

/** Categories of OEE loss for the loss tree. */
export type OeeLossCategory =
  | "availability"
  | "performance"
  | "quality";

export type DowntimeCategory =
  | "equipment_failure"
  | "planned_maintenance"
  | "unplanned_maintenance"
  | "changeover"
  | "process_upset"
  | "feedstock"
  | "utilities"
  | "no_demand";

export type QualityDefectCategory =
  | "off_spec_purity"
  | "moisture"
  | "contamination"
  | "rework"
  | "startup_loss";

export type SensorChannel =
  | "vibration_overall"
  | "bearing_temp_de"
  | "bearing_temp_nde"
  | "discharge_pressure"
  | "suction_pressure"
  | "speed_rpm"
  | "lube_oil_pressure"
  | "seal_gas_flow";

/** Turnaround readiness dimensions. */
export type ReadinessDimension =
  | "engineering"
  | "materials"
  | "labour"
  | "permits";

export type ReadinessStatus = "not_started" | "at_risk" | "on_track" | "ready";

export type TurnaroundStatus =
  | "planning"
  | "scope_freeze"
  | "ready"
  | "in_execution"
  | "complete";

/** AI provider identifiers for the provider-neutral interface. */
export type AiProviderId = "mock" | "nvidia" | "dgxspark" | "azure";

/**
 * Accounting class for an AI interaction.
 *  - "actual"    → a call that really happened (in the offline demo, always mock/$0)
 *  - "estimated" → a priced scenario for comparison only; never summed into actuals
 */
export type AiAccounting = "actual" | "estimated";

/** Category of a step in a time-bound operational decision plan. */
export type DecisionActionKind =
  | "immediate_mitigation"
  | "inspection"
  | "replacement"
  | "turnaround_overhaul";
