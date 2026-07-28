import type {
  AiAccounting,
  AiProviderId,
  AssetOperationalStatus,
  Criticality,
  DataFreshness,
  DecisionActionKind,
  DecisionType,
  DowntimeCategory,
  EventSeverity,
  OeeLossCategory,
  Provenance,
  QualityDefectCategory,
  ReadinessDimension,
  ReadinessStatus,
  RecommendedDisposition,
  SensorChannel,
  TurnaroundStatus,
  ValueStatus,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from "./enums";

/** ISO-8601 timestamp string (UTC), e.g. "2026-07-27T14:30:00.000Z". */
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// Site & hierarchy
// ---------------------------------------------------------------------------

export interface Plant {
  id: string;
  code: string; // e.g. "GC-REFINERY"
  name: string;
  region: string;
  timezone: string;
  synthetic: true; // all demo data is explicitly synthetic
}

export interface ProductionLine {
  id: string;
  plantId: string;
  code: string; // e.g. "HDS-2"
  name: string;
  product: string; // e.g. "Ultra-low-sulfur diesel"
  designRateUnitsPerHour: number;
  unit: string; // e.g. "bbl/h"
}

/**
 * A node in the ISA-95-style functional location tree
 * (Enterprise > Site > Area > Unit > Equipment).
 */
export interface AssetHierarchyNode {
  id: string;
  plantId: string;
  parentId: string | null;
  level: "site" | "area" | "unit" | "equipment_group";
  code: string;
  name: string;
}

export interface Asset {
  id: string;
  tag: string; // equipment identifier, e.g. "K-201"
  name: string;
  plantId: string;
  productionLineId: string | null;
  hierarchyNodeId: string;
  assetType: string; // e.g. "Centrifugal compressor"
  manufacturer: string;
  model: string;
  criticality: Criticality;
  operationalStatus: AssetOperationalStatus;
  commissionedOn: IsoTimestamp;
  synthetic: true;
}

// ---------------------------------------------------------------------------
// Sensor & condition
// ---------------------------------------------------------------------------

export interface SensorDefinition {
  id: string;
  assetId: string;
  channel: SensorChannel;
  label: string;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  /** Direction in which higher/lower is worse. */
  alarmDirection: "above" | "below";
}

export interface SensorReading {
  sensorId: string;
  assetId: string;
  channel: SensorChannel;
  timestamp: IsoTimestamp;
  value: number;
  unit: string;
  /** Observed vs synthetically forecast/interpolated. */
  provenance: Extract<Provenance, "measured" | "statistical">;
}

export interface ConditionEvent {
  id: string;
  assetId: string;
  detectedAt: IsoTimestamp;
  channel: SensorChannel | "multi";
  severity: EventSeverity;
  /** Human-readable rule that fired (deterministic). */
  rule: string;
  detail: string;
  value: number | null;
  threshold: number | null;
  provenance: Extract<Provenance, "business_rule" | "statistical">;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Production / OEE inputs
// ---------------------------------------------------------------------------

export interface ProductionRun {
  id: string;
  productionLineId: string;
  assetId: string | null; // constraining asset, if any
  periodStart: IsoTimestamp;
  periodEnd: IsoTimestamp;
  plannedProductionMinutes: number;
  downtimeMinutes: number;
  idealRateUnitsPerHour: number;
  totalUnitsProduced: number;
  goodUnits: number;
  unit: string;
  synthetic: true;
}

export interface DowntimeEvent {
  id: string;
  productionRunId: string;
  productionLineId: string;
  assetId: string | null;
  category: DowntimeCategory;
  startedAt: IsoTimestamp;
  endedAt: IsoTimestamp;
  minutes: number;
  description: string;
  planned: boolean;
}

export interface QualityEvent {
  id: string;
  productionRunId: string;
  productionLineId: string;
  category: QualityDefectCategory;
  occurredAt: IsoTimestamp;
  defectiveUnits: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Maintenance & materials
// ---------------------------------------------------------------------------

export interface WorkOrder {
  id: string;
  number: string; // e.g. "WO-48231"
  assetId: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  title: string;
  description: string;
  createdAt: IsoTimestamp;
  scheduledStart: IsoTimestamp | null;
  requiredSpareIds: string[];
  estimatedCost: number;
  currency: string;
}

export interface MaintenanceHistoryRecord {
  id: string;
  assetId: string;
  performedAt: IsoTimestamp;
  workOrderNumber: string | null;
  activity: string;
  findings: string;
  technician: string;
  laborHours: number;
}

export interface SparePart {
  id: string;
  partNumber: string;
  description: string;
  category: string;
  unitCost: number;
  currency: string;
  leadTimeDays: number;
  criticalSpare: boolean;
}

export interface InventoryBalance {
  id: string;
  sparePartId: string;
  storeroom: string;
  onHandQty: number;
  reservedQty: number;
  reorderPoint: number;
  updatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Turnaround
// ---------------------------------------------------------------------------

export interface TurnaroundProject {
  id: string;
  code: string; // e.g. "TA-2026-U200"
  name: string;
  plantId: string;
  status: TurnaroundStatus;
  windowStart: IsoTimestamp;
  windowEnd: IsoTimestamp;
  scopeFreezeDate: IsoTimestamp;
  budget: number;
  currency: string;
  synthetic: true;
}

export interface TurnaroundWorkPackage {
  id: string;
  turnaroundProjectId: string;
  code: string;
  title: string;
  assetId: string | null;
  discipline: string;
  status: "scoped" | "engineering" | "materials" | "ready" | "executed";
  readiness: Record<ReadinessDimension, ReadinessStatus>;
  plannedStart: IsoTimestamp;
  plannedFinish: IsoTimestamp;
  estimatedCost: number;
  /** True when created from an emerging asset risk (links Asset ↔ Turnaround). */
  originatingConditionEventId: string | null;
  onCriticalPath: boolean;
}

export interface WorkPackageDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: "finish_to_start" | "start_to_start" | "finish_to_finish";
  lagDays: number;
}

// ---------------------------------------------------------------------------
// Recommendations, evidence, decisions, outcomes
// ---------------------------------------------------------------------------

/** A single piece of evidence backing a recommendation. */
export interface RecommendationEvidence {
  id: string;
  recommendationId: string;
  label: string;
  value: string;
  provenance: Provenance;
  /** Pointer back to the source record (sensor, run, work order, …). */
  sourceType: string;
  sourceId: string | null;
  observedAt: IsoTimestamp | null;
}

/** One step in a time-bound operational decision plan. */
export interface DecisionAction {
  kind: DecisionActionKind;
  label: string;
  /** Human-readable timing, e.g. "Now", "Within 48 hours", "Turnaround (+88 days)". */
  timing: string;
}

export interface Recommendation {
  id: string;
  assetId: string;
  createdAt: IsoTimestamp;
  /** Time-bound operational decision heading (not an ambiguous label). */
  title: string;
  /** Deterministic summary of the recommended action. */
  summary: string;
  disposition: RecommendedDisposition;
  severity: EventSeverity;
  /**
   * Deterministic trend-projection / assessment confidence (0–1) from the risk
   * engine — NOT a model/LLM confidence, and NOT a documented predictive model.
   */
  trendProjectionConfidence: number;
  /** Structured decision plan: mitigation → inspection → turnaround overhaul. */
  actionPlan: DecisionAction[];
  decisionOwner: string;
  /** When the time-bound decision is due. */
  dueBy: IsoTimestamp | null;
  /** Natural-language rationale — AI-generated, grounded in evidence only. */
  aiRationale: string | null;
  /** The AI interaction that produced aiRationale, if any. */
  aiInteractionId: string | null;
  evidenceIds: string[];
  /** Total exposure the decision addresses (value AT STAKE, not AI-created). */
  valueAtStakeUsd: number;
  /** Value the recommended action is projected to protect/enable if executed. */
  projectedValueEnabledUsd: number;
  currency: string;
  status: "open" | "decided" | "actioned" | "closed";
}

export interface HumanDecision {
  id: string;
  recommendationId: string;
  decidedBy: string;
  role: string;
  decision: DecisionType;
  decidedAt: IsoTimestamp;
  note: string;
  /** If modified, what the human changed the disposition to. */
  modifiedDisposition: RecommendedDisposition | null;
}

export interface OperationalOutcome {
  id: string;
  recommendationId: string;
  decisionId: string;
  assetId: string;
  recordedAt: IsoTimestamp;
  resolved: boolean;
  description: string;
  estimatedValue: number;
  realisedValue: number | null;
  valueStatus: ValueStatus;
  currency: string;
}

// ---------------------------------------------------------------------------
// AI accounting (Return on Token Spend)
// ---------------------------------------------------------------------------

export interface PromptVersion {
  id: string;
  key: string; // e.g. "asset_risk_explanation"
  version: string; // e.g. "1.0.0"
  useCase: string;
  template: string;
  createdAt: IsoTimestamp;
  active: boolean;
}

export interface AiInteraction {
  id: string;
  createdAt: IsoTimestamp;
  /**
   * "actual" = a call that really happened (offline demo: always mock/$0).
   * "estimated" = a priced comparison scenario; never summed into actual totals.
   */
  accounting: AiAccounting;
  provider: AiProviderId;
  model: string;
  useCase: string;
  promptVersionId: string;
  inputTokens: number;
  outputTokens: number;
  /** Recorded model cost in USD. Zero for the offline mock provider. */
  estimatedCostUsd: number;
  latencyMs: number;
  recommendationId: string | null;
  /** IDs of the evidence supplied to the model (grounding set). */
  evidenceIds: string[];
  outputSummary: string;
}

// ---------------------------------------------------------------------------
// Convenience: the full seeded dataset shape
// ---------------------------------------------------------------------------

export interface Dataset {
  plants: Plant[];
  productionLines: ProductionLine[];
  hierarchy: AssetHierarchyNode[];
  assets: Asset[];
  sensorDefinitions: SensorDefinition[];
  sensorReadings: SensorReading[];
  conditionEvents: ConditionEvent[];
  productionRuns: ProductionRun[];
  downtimeEvents: DowntimeEvent[];
  qualityEvents: QualityEvent[];
  workOrders: WorkOrder[];
  maintenanceHistory: MaintenanceHistoryRecord[];
  spareParts: SparePart[];
  inventoryBalances: InventoryBalance[];
  turnaroundProjects: TurnaroundProject[];
  turnaroundWorkPackages: TurnaroundWorkPackage[];
  workPackageDependencies: WorkPackageDependency[];
  recommendations: Recommendation[];
  recommendationEvidence: RecommendationEvidence[];
  humanDecisions: HumanDecision[];
  operationalOutcomes: OperationalOutcome[];
  aiInteractions: AiInteraction[];
  promptVersions: PromptVersion[];
  meta: {
    generatedAt: IsoTimestamp;
    seed: number;
    synthetic: true;
    heroAssetTag: string;
  };
}
