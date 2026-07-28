import "server-only";
import type {
  AiInteraction,
  Asset,
  AssetHierarchyNode,
  ConditionEvent,
  Dataset,
  DowntimeEvent,
  HumanDecision,
  InventoryBalance,
  MaintenanceHistoryRecord,
  OperationalOutcome,
  Plant,
  ProductionLine,
  ProductionRun,
  PromptVersion,
  QualityEvent,
  Recommendation,
  RecommendationEvidence,
  SensorDefinition,
  SensorReading,
  SparePart,
  TurnaroundProject,
  TurnaroundWorkPackage,
  WorkOrder,
  WorkPackageDependency,
} from "@/domain/types";
import { SeededRandom } from "@/lib/prng";
import type { RiskResult, TrendPoint } from "@/engines/risk";
import { approxTokens } from "@/ai/types";
import { PROMPTS } from "@/ai/prompts";
import { analyzeK201 } from "./k201-analysis";
import {
  ANCHOR_NOW,
  CURRENCY,
  HISTORY_DAYS,
  K201_SENSORS,
  LINE,
  PLANT,
  SEED,
} from "./constants";

const DAY_MS = 86_400_000;
const HOUR = 60;
const ANCHOR_MS = new Date(ANCHOR_NOW).getTime();

/** ISO timestamp for day index d (d = HISTORY_DAYS-1 is the anchor "today"). */
function dayIso(d: number, hour = 6): string {
  const ms = ANCHOR_MS - (HISTORY_DAYS - 1 - d) * DAY_MS + hour * 3_600_000;
  return new Date(ms).toISOString();
}
function fromNow(days: number): string {
  return new Date(ANCHOR_MS + days * DAY_MS).toISOString();
}
function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------

export function buildDataset(seed: number = SEED): Dataset {
  const rand = new SeededRandom(seed);

  const plants: Plant[] = [
    {
      id: PLANT.id,
      code: PLANT.code,
      name: PLANT.name,
      region: PLANT.region,
      timezone: PLANT.timezone,
      synthetic: true,
    },
  ];

  const productionLines: ProductionLine[] = [
    {
      id: LINE.id,
      plantId: PLANT.id,
      code: LINE.code,
      name: LINE.name,
      product: LINE.product,
      designRateUnitsPerHour: LINE.designRateUnitsPerHour,
      unit: LINE.unit,
    },
  ];

  const hierarchy: AssetHierarchyNode[] = [
    { id: "hn-site", plantId: PLANT.id, parentId: null, level: "site", code: "GC", name: "Gulf Coast Refinery" },
    { id: "hn-area", plantId: PLANT.id, parentId: "hn-site", level: "area", code: "U200", name: "Unit 200 — Hydrotreating" },
    { id: "hn-unit", plantId: PLANT.id, parentId: "hn-area", level: "unit", code: "HDS-2", name: "Diesel Hydrotreater 2" },
    { id: "hn-rot", plantId: PLANT.id, parentId: "hn-unit", level: "equipment_group", code: "ROT", name: "Rotating equipment" },
    { id: "hn-sta", plantId: PLANT.id, parentId: "hn-unit", level: "equipment_group", code: "STA", name: "Static equipment" },
  ];

  const commissioned = "2014-05-01T00:00:00.000Z";
  const assets: Asset[] = [
    mkAsset("asset-k201", "K-201", "Hydrogen recycle compressor", "hn-rot", "A", "attention", "Centrifugal compressor", "Elliott", "38M9", commissioned),
    mkAsset("asset-k202", "K-202", "Make-up hydrogen compressor", "hn-rot", "A", "normal", "Reciprocating compressor", "Ariel", "JGT/4", commissioned),
    mkAsset("asset-p210", "P-210A", "Reactor charge pump", "hn-rot", "B", "normal", "Centrifugal pump", "Sulzer", "GSG-4", commissioned),
    mkAsset("asset-p214", "P-214", "Product transfer pump", "hn-rot", "C", "maintenance", "Centrifugal pump", "Flowserve", "HPX", commissioned),
    mkAsset("asset-f201", "F-201", "Charge heater", "hn-sta", "A", "monitor", "Fired heater", "Foster Wheeler", "—", commissioned),
    mkAsset("asset-e205", "E-205", "Feed/effluent exchanger", "hn-sta", "B", "monitor", "Shell & tube exchanger", "—", "—", commissioned),
    mkAsset("asset-c201", "C-201", "Product fractionator", "hn-sta", "A", "normal", "Distillation column", "—", "—", commissioned),
    mkAsset("asset-v208", "V-208", "Cold separator", "hn-sta", "C", "normal", "Pressure vessel", "—", "—", commissioned),
  ];

  // --- K-201 sensor definitions -------------------------------------------
  const sensorDefinitions: SensorDefinition[] = [
    mkSensor("sen-k201-vib", "asset-k201", K201_SENSORS.vibration),
    mkSensor("sen-k201-tde", "asset-k201", K201_SENSORS.bearingTempDe),
    mkSensor("sen-k201-tnde", "asset-k201", K201_SENSORS.bearingTempNde),
  ];

  // --- K-201 sensor readings (90 days, gradual deterioration) --------------
  const sensorReadings: SensorReading[] = [];
  const vibSeries: TrendPoint[] = [];
  const tdeSeries: TrendPoint[] = [];
  const tndeSeries: TrendPoint[] = [];

  for (let d = 0; d < HISTORY_DAYS; d++) {
    const vib = round(
      Math.max(1.6, 2.2 + (d >= 35 ? (d - 35) * 0.125 : 0) + rand.gaussian(0, 0.14)),
    );
    const tde = round(
      Math.max(60, 78 + (d >= 45 ? (d - 45) * 0.32 : 0) + rand.gaussian(0, 0.8)),
      1,
    );
    const tnde = round(
      Math.max(60, 76 + (d >= 50 ? (d - 50) * 0.22 : 0) + rand.gaussian(0, 0.7)),
      1,
    );
    const ts = dayIso(d);
    sensorReadings.push(mkReading("sen-k201-vib", "asset-k201", "vibration_overall", ts, vib, "mm/s"));
    sensorReadings.push(mkReading("sen-k201-tde", "asset-k201", "bearing_temp_de", ts, tde, "°C"));
    sensorReadings.push(mkReading("sen-k201-tnde", "asset-k201", "bearing_temp_nde", ts, tnde, "°C"));
    vibSeries.push({ day: d, value: vib });
    tdeSeries.push({ day: d, value: tde });
    tndeSeries.push({ day: d, value: tnde });
  }

  // --- Deterministic condition detection -> events ------------------------
  const conditionEvents: ConditionEvent[] = [];
  const vibWarnDay = firstCrossing(vibSeries, K201_SENSORS.vibration.warningThreshold, "above");
  if (vibWarnDay !== null) {
    conditionEvents.push({
      id: "ce-k201-vib-warn",
      assetId: "asset-k201",
      detectedAt: dayIso(vibWarnDay),
      channel: "vibration_overall",
      severity: "high",
      rule: "Overall vibration exceeded ISO 10816 warning band",
      detail: `Vibration crossed ${K201_SENSORS.vibration.warningThreshold} mm/s warning threshold and continues to rise.`,
      value: vibSeries[vibWarnDay]?.value ?? null,
      threshold: K201_SENSORS.vibration.warningThreshold,
      provenance: "business_rule",
      acknowledged: true,
    });
  }
  const tdeWarnDay = firstCrossing(tdeSeries, K201_SENSORS.bearingTempDe.warningThreshold, "above");
  if (tdeWarnDay !== null) {
    conditionEvents.push({
      id: "ce-k201-tde-warn",
      assetId: "asset-k201",
      detectedAt: dayIso(tdeWarnDay),
      channel: "bearing_temp_de",
      severity: "medium",
      rule: "Drive-end bearing temperature exceeded warning threshold",
      detail: `Drive-end bearing temperature crossed ${K201_SENSORS.bearingTempDe.warningThreshold} °C.`,
      value: tdeSeries[tdeWarnDay]?.value ?? null,
      threshold: K201_SENSORS.bearingTempDe.warningThreshold,
      provenance: "business_rule",
      acknowledged: true,
    });
  }
  conditionEvents.push({
    id: "ce-k201-trend",
    assetId: "asset-k201",
    detectedAt: dayIso(HISTORY_DAYS - 1),
    channel: "multi",
    severity: "high",
    rule: "Sustained deterioration trend (linear slope over trend window)",
    detail: "Vibration and drive-end bearing temperature show a sustained upward slope over the 30-day trend window.",
    value: null,
    threshold: null,
    provenance: "statistical",
    acknowledged: false,
  });

  // --- Production runs, downtime, quality (90 days) ------------------------
  const productionRuns: ProductionRun[] = [];
  const downtimeEvents: DowntimeEvent[] = [];
  const qualityEvents: QualityEvent[] = [];

  for (let d = 0; d < HISTORY_DAYS; d++) {
    const planned = 1440;
    let downtime = round(rand.range(8, 32), 0);
    let dtCategory: DowntimeEvent["category"] = "process_upset";
    let dtPlanned = false;
    let dtDesc = "Minor process variability";

    if (d === 20) {
      downtime = 320;
      dtCategory = "planned_maintenance";
      dtPlanned = true;
      dtDesc = "Planned minor maintenance window";
    } else if (d === 78) {
      downtime = 190;
      dtCategory = "equipment_failure";
      dtDesc = "K-201 high-vibration trip and controlled restart";
    } else if (d === 61) {
      downtime = 140;
      dtCategory = "feedstock";
      dtDesc = "Feed rate limitation upstream";
    }

    // Recent 25 days: K-201 forces a speed/throughput cutback (performance loss).
    const inCutback = d >= HISTORY_DAYS - 25;
    const perfFactor = inCutback ? 0.93 : 0.985;
    const qualFactor = inCutback && d % 4 === 0 ? 0.972 : 0.996;

    const runMin = planned - downtime;
    const actualRate = LINE.idealRateUnitsPerHour * perfFactor;
    const total = Math.round((actualRate * runMin) / HOUR);
    const good = Math.round(total * qualFactor);

    const runId = `run-${d}`;
    productionRuns.push({
      id: runId,
      productionLineId: LINE.id,
      assetId: d === 78 ? "asset-k201" : null,
      periodStart: dayIso(d, 0),
      periodEnd: dayIso(d, 24),
      plannedProductionMinutes: planned,
      downtimeMinutes: downtime,
      idealRateUnitsPerHour: LINE.idealRateUnitsPerHour,
      totalUnitsProduced: total,
      goodUnits: good,
      unit: LINE.unit,
      synthetic: true,
    });

    downtimeEvents.push({
      id: `dt-${d}`,
      productionRunId: runId,
      productionLineId: LINE.id,
      assetId: d === 78 ? "asset-k201" : null,
      category: dtCategory,
      startedAt: dayIso(d, 2),
      endedAt: dayIso(d, 2 + downtime / 60),
      minutes: downtime,
      description: dtDesc,
      planned: dtPlanned,
    });

    if (good < total) {
      qualityEvents.push({
        id: `qe-${d}`,
        productionRunId: runId,
        productionLineId: LINE.id,
        category: "off_spec_purity",
        occurredAt: dayIso(d, 12),
        defectiveUnits: total - good,
        description: "Off-spec sulfur during reduced-severity operation",
      });
    }
  }

  // --- OEE, financial exposure, and risk (single shared analysis) ---------
  const analysis = analyzeK201({ sensorReadings, productionRuns, downtimeEvents });
  const { risk, recentOee } = analysis;
  const totalExposure = analysis.totalExposureUsd;
  const projectedFailureExposure = analysis.projectedFailureExposureUsd;

  // --- Spare parts & inventory --------------------------------------------
  const spareParts: SparePart[] = [
    { id: "sp-brg", partNumber: "BRG-38M9-DE", description: "K-201 tilting-pad bearing set (DE/NDE)", category: "Bearing", unitCost: 8500, currency: CURRENCY, leadTimeDays: 21, criticalSpare: true },
    { id: "sp-seal", partNumber: "DGS-38M9", description: "K-201 dry gas seal cartridge", category: "Seal", unitCost: 42000, currency: CURRENCY, leadTimeDays: 35, criticalSpare: true },
    { id: "sp-cpl", partNumber: "CPL-38M9", description: "K-201 flexible coupling", category: "Coupling", unitCost: 6200, currency: CURRENCY, leadTimeDays: 14, criticalSpare: false },
  ];
  const inventoryBalances: InventoryBalance[] = [
    { id: "inv-brg", sparePartId: "sp-brg", storeroom: "GC-CENTRAL", onHandQty: 1, reservedQty: 0, reorderPoint: 1, updatedAt: dayIso(HISTORY_DAYS - 1) },
    { id: "inv-seal", sparePartId: "sp-seal", storeroom: "GC-CENTRAL", onHandQty: 0, reservedQty: 0, reorderPoint: 1, updatedAt: dayIso(HISTORY_DAYS - 1) },
    { id: "inv-cpl", sparePartId: "sp-cpl", storeroom: "GC-CENTRAL", onHandQty: 2, reservedQty: 0, reorderPoint: 1, updatedAt: dayIso(HISTORY_DAYS - 1) },
  ];

  // --- Work orders & maintenance history ----------------------------------
  const workOrders: WorkOrder[] = [
    { id: "wo-1", number: "WO-48231", assetId: "asset-k201", type: "predictive", status: "scheduled", priority: "P2", title: "K-201 vibration inspection & bearing check", description: "Borescope and bearing inspection triggered by rising vibration trend.", createdAt: dayIso(80), scheduledStart: fromNow(10), requiredSpareIds: ["sp-brg"], estimatedCost: 42000, currency: CURRENCY },
    { id: "wo-2", number: "WO-48102", assetId: "asset-k201", type: "corrective", status: "planned", priority: "P2", title: "K-201 dry gas seal replacement", description: "Replace dry gas seal cartridge; pending spare procurement.", createdAt: dayIso(74), scheduledStart: null, requiredSpareIds: ["sp-seal"], estimatedCost: 88000, currency: CURRENCY },
    { id: "wo-3", number: "WO-47980", assetId: "asset-p214", type: "corrective", status: "in_progress", priority: "P3", title: "P-214 mechanical seal replacement", description: "Product transfer pump seal weeping.", createdAt: dayIso(70), scheduledStart: dayIso(86), requiredSpareIds: [], estimatedCost: 15000, currency: CURRENCY },
  ];
  const maintenanceHistory: MaintenanceHistoryRecord[] = [
    { id: "mh-1", assetId: "asset-k201", performedAt: "2025-11-12T00:00:00.000Z", workOrderNumber: "WO-44120", activity: "Drive-end bearing replacement", findings: "Bearing replaced during opportunity outage; post-repair baseline 2.1 mm/s.", technician: "Reliability crew A", laborHours: 36 },
    { id: "mh-2", assetId: "asset-k201", performedAt: "2026-03-04T00:00:00.000Z", workOrderNumber: "WO-46310", activity: "Vibration survey", findings: "All bands within normal limits; baseline confirmed.", technician: "Condition-monitoring team", laborHours: 6 },
    { id: "mh-3", assetId: "asset-k201", performedAt: "2026-06-18T00:00:00.000Z", workOrderNumber: null, activity: "Lube-oil analysis", findings: "Slight rise in wear metals noted; recommend re-sample in 30 days.", technician: "Lab", laborHours: 2 },
  ];

  // --- Turnaround ----------------------------------------------------------
  const turnaroundProjects: TurnaroundProject[] = [
    { id: "ta-1", code: "TA-2026-U200", name: "Unit 200 Hydrotreating Turnaround", plantId: PLANT.id, status: "planning", windowStart: fromNow(88), windowEnd: fromNow(109), scopeFreezeDate: fromNow(45), budget: 18_000_000, currency: CURRENCY, synthetic: true },
  ];
  const turnaroundWorkPackages: TurnaroundWorkPackage[] = [
    { id: "wp-k201", turnaroundProjectId: "ta-1", code: "WP-201-ROT", title: "K-201 compressor overhaul", assetId: "asset-k201", discipline: "Rotating equipment", status: "engineering", readiness: { engineering: "on_track", materials: "at_risk", labour: "on_track", permits: "not_started" }, plannedStart: fromNow(90), plannedFinish: fromNow(97), estimatedCost: 640_000, originatingConditionEventId: "ce-k201-trend", onCriticalPath: true },
    { id: "wp-e205", turnaroundProjectId: "ta-1", code: "WP-205-STA", title: "E-205 bundle clean & inspect", assetId: "asset-e205", discipline: "Static equipment", status: "scoped", readiness: { engineering: "on_track", materials: "on_track", labour: "at_risk", permits: "not_started" }, plannedStart: fromNow(91), plannedFinish: fromNow(95), estimatedCost: 210_000, originatingConditionEventId: null, onCriticalPath: false },
    { id: "wp-f201", turnaroundProjectId: "ta-1", code: "WP-201-STA", title: "F-201 tube inspection", assetId: "asset-f201", discipline: "Fired equipment", status: "scoped", readiness: { engineering: "at_risk", materials: "on_track", labour: "on_track", permits: "not_started" }, plannedStart: fromNow(89), plannedFinish: fromNow(93), estimatedCost: 320_000, originatingConditionEventId: null, onCriticalPath: true },
  ];
  const workPackageDependencies: WorkPackageDependency[] = [
    { id: "dep-1", predecessorId: "wp-f201", successorId: "wp-k201", type: "finish_to_start", lagDays: 0 },
  ];

  // --- Prompt versions -----------------------------------------------------
  const promptVersions: PromptVersion[] = Object.values(PROMPTS);

  // --- The K-201 recommendation + evidence --------------------------------
  const bearingAvailable =
    (inventoryBalances.find((i) => i.sparePartId === "sp-brg")?.onHandQty ?? 0) > 0;
  const sealAvailable =
    (inventoryBalances.find((i) => i.sparePartId === "sp-seal")?.onHandQty ?? 0) > 0;

  const evidence: RecommendationEvidence[] = [
    ev("rev-1", "rec-k201", "Asset", "K-201 — Hydrogen recycle compressor (criticality A)", "measured", "asset", "asset-k201", dayIso(HISTORY_DAYS - 1)),
    ev("rev-2", "rec-k201", "Overall vibration", `${risk.channels[0]?.latestValue.toFixed(2)} mm/s (warning ${K201_SENSORS.vibration.warningThreshold}, critical ${K201_SENSORS.vibration.criticalThreshold})`, "measured", "sensor", "sen-k201-vib", dayIso(HISTORY_DAYS - 1)),
    ev("rev-3", "rec-k201", "Bearing temperature (DE)", `${risk.channels[1]?.latestValue.toFixed(1)} °C (warning ${K201_SENSORS.bearingTempDe.warningThreshold}, critical ${K201_SENSORS.bearingTempDe.criticalThreshold})`, "measured", "sensor", "sen-k201-tde", dayIso(HISTORY_DAYS - 1)),
    ev("rev-4", "rec-k201", "Projected time-to-critical", risk.projectedDaysToCritical !== null ? `${Math.round(risk.projectedDaysToCritical)} days at current trend` : "not trending", "statistical", "risk_engine", null, dayIso(HISTORY_DAYS - 1)),
    ev("rev-5", "rec-k201", "Risk score", `${risk.riskScore}/100 (health ${risk.healthScore}/100)`, "deterministic", "risk_engine", null, dayIso(HISTORY_DAYS - 1)),
    ev("rev-6", "rec-k201", "Recent OEE (30-day, HDS-2)", `${(recentOee.oee * 100).toFixed(1)}% (A ${(recentOee.availability * 100).toFixed(1)} / P ${(recentOee.performance * 100).toFixed(1)} / Q ${(recentOee.quality * 100).toFixed(1)})`, "deterministic", "oee_engine", LINE.id, dayIso(HISTORY_DAYS - 1)),
    ev("rev-7", "rec-k201", "Financial exposure", `$${Math.round(totalExposure).toLocaleString("en-US")} (recent attributable + projected 4-day failure)`, "deterministic", "oee_engine", null, dayIso(HISTORY_DAYS - 1)),
    ev("rev-8", "rec-k201", "Spare availability", `Bearing set: ${bearingAvailable ? "in stock" : "not in stock"}; dry gas seal: ${sealAvailable ? "in stock" : "0 on hand, 35-day lead"}`, "measured", "inventory", "inv-seal", dayIso(HISTORY_DAYS - 1)),
    ev("rev-9", "rec-k201", "Open work orders", "WO-48231 (inspection, scheduled) and WO-48102 (seal replacement, planned)", "measured", "work_order", "wo-1", dayIso(80)),
    ev("rev-10", "rec-k201", "Recent K-201 downtime", "High-vibration trip on the unit 12 days ago (190 min)", "measured", "downtime_event", "dt-78", dayIso(78)),
    ev("rev-11", "rec-k201", "Turnaround option", "Unit 200 turnaround opens in 88 days; scope freeze in 45 days (later than projected time-to-critical)", "measured", "turnaround", "ta-1", dayIso(HISTORY_DAYS - 1)),
  ];

  const aiRationale = buildK201Rationale(risk, {
    vib: risk.channels[0]?.latestValue ?? 0,
    tde: risk.channels[1]?.latestValue ?? 0,
    exposure: totalExposure,
    sealAvailable,
  });

  const rationaleInteraction: AiInteraction = {
    id: "ai-k201",
    createdAt: dayIso(HISTORY_DAYS - 1, 8),
    accounting: "actual",
    provider: "mock",
    model: "mock/deterministic-explainer",
    useCase: PROMPTS.asset_risk_explanation!.useCase,
    promptVersionId: PROMPTS.asset_risk_explanation!.id,
    inputTokens: approxTokens(evidence.map((e) => `${e.label}: ${e.value}`).join("\n")) + 180,
    outputTokens: approxTokens(aiRationale),
    estimatedCostUsd: 0,
    latencyMs: 420,
    recommendationId: "rec-k201",
    evidenceIds: evidence.map((e) => e.id),
    outputSummary: aiRationale.slice(0, 160),
  };

  const recommendation: Recommendation = {
    id: "rec-k201",
    assetId: "asset-k201",
    createdAt: dayIso(HISTORY_DAYS - 1, 8),
    title: "Reduce operating speed now and complete bearing inspection within 48 hours",
    summary:
      "Reduce K-201 operating speed immediately to lower vibration, complete the bearing inspection within 48 hours, and expedite the dry gas seal. Retain the full compressor overhaul in the Unit 200 turnaround scope. Projected time-to-critical (~18 days) is earlier than the turnaround execution window (+88 days), so the risk cannot wait for the turnaround.",
    disposition: risk.recommendedDisposition,
    severity: risk.severity,
    trendProjectionConfidence: risk.confidence,
    actionPlan: [
      { kind: "immediate_mitigation", label: "Reduce operating speed to lower vibration", timing: "Now" },
      { kind: "inspection", label: "Complete bearing inspection (WO-48231) and expedite dry gas seal (35-day lead)", timing: "Within 48 hours" },
      { kind: "turnaround_overhaul", label: "Full compressor overhaul (WP-201-ROT)", timing: "Unit 200 turnaround (+88 days)" },
    ],
    decisionOwner: "Reliability Lead — Unit 200",
    dueBy: fromNow(2),
    aiRationale,
    aiInteractionId: "ai-k201",
    evidenceIds: evidence.map((e) => e.id),
    valueAtStakeUsd: totalExposure,
    projectedValueEnabledUsd: projectedFailureExposure,
    currency: CURRENCY,
    status: "open",
  };

  // --- Portfolio of AI-explained recommendations (for ROTS accounting) -----
  // Reset-state truth: every actual AI call is the offline MOCK provider ($0),
  // and NO outcome has been validated yet, so realised value is not available.
  const history = buildRecommendationBook();

  const recommendations: Recommendation[] = [recommendation, ...history.recommendations];
  const recommendationEvidence: RecommendationEvidence[] = [...evidence, ...history.evidence];
  const humanDecisions: HumanDecision[] = [...history.decisions];
  const operationalOutcomes: OperationalOutcome[] = [...history.outcomes];
  const aiInteractions: AiInteraction[] = [rationaleInteraction, ...history.interactions];

  return {
    plants,
    productionLines,
    hierarchy,
    assets,
    sensorDefinitions,
    sensorReadings,
    conditionEvents,
    productionRuns,
    downtimeEvents,
    qualityEvents,
    workOrders,
    maintenanceHistory,
    spareParts,
    inventoryBalances,
    turnaroundProjects,
    turnaroundWorkPackages,
    workPackageDependencies,
    recommendations,
    recommendationEvidence,
    humanDecisions,
    operationalOutcomes,
    aiInteractions,
    promptVersions,
    meta: {
      generatedAt: ANCHOR_NOW,
      seed,
      synthetic: true,
      heroAssetTag: "K-201",
    },
  };
}

// ---------------------------------------------------------------------------
// Local builders / helpers
// ---------------------------------------------------------------------------

function mkAsset(
  id: string,
  tag: string,
  name: string,
  hierarchyNodeId: string,
  criticality: Asset["criticality"],
  operationalStatus: Asset["operationalStatus"],
  assetType: string,
  manufacturer: string,
  model: string,
  commissionedOn: string,
): Asset {
  return {
    id,
    tag,
    name,
    plantId: PLANT.id,
    productionLineId: LINE.id,
    hierarchyNodeId,
    assetType,
    manufacturer,
    model,
    criticality,
    operationalStatus,
    commissionedOn,
    synthetic: true,
  };
}

function mkSensor(
  id: string,
  assetId: string,
  def: {
    channel: SensorDefinition["channel"];
    label: string;
    unit: string;
    warningThreshold: number;
    criticalThreshold: number;
    alarmDirection: "above" | "below";
  },
): SensorDefinition {
  return { id, assetId, ...def };
}

function mkReading(
  sensorId: string,
  assetId: string,
  channel: SensorReading["channel"],
  timestamp: string,
  value: number,
  unit: string,
): SensorReading {
  return { sensorId, assetId, channel, timestamp, value, unit, provenance: "measured" };
}

function ev(
  id: string,
  recommendationId: string,
  label: string,
  value: string,
  provenance: RecommendationEvidence["provenance"],
  sourceType: string,
  sourceId: string | null,
  observedAt: string | null,
): RecommendationEvidence {
  return { id, recommendationId, label, value, provenance, sourceType, sourceId, observedAt };
}

function firstCrossing(
  series: TrendPoint[],
  threshold: number,
  direction: "above" | "below",
): number | null {
  for (const p of series) {
    if (direction === "above" ? p.value >= threshold : p.value <= threshold) {
      return p.day;
    }
  }
  return null;
}

function buildK201Rationale(
  risk: RiskResult,
  facts: { vib: number; tde: number; exposure: number; sealAvailable: boolean },
): string {
  const proj =
    risk.projectedDaysToCritical !== null
      ? `${Math.round(risk.projectedDaysToCritical)} days`
      : "an undetermined horizon";
  return [
    `K-201 carries a deterministic risk score of ${risk.riskScore}/100 (health ${risk.healthScore}/100), driven by measured condition data rather than estimation.`,
    `Overall vibration is ${facts.vib.toFixed(2)} mm/s and drive-end bearing temperature is ${facts.tde.toFixed(1)} °C, both tracked against their warning and critical thresholds.`,
    `At the current deterioration rate the vibration trend projects toward the critical threshold in about ${proj}, which is sooner than the next turnaround window.`,
    `The calculated financial exposure of continued operation is $${Math.round(facts.exposure).toLocaleString("en-US")}.`,
    `Because the dry gas seal is ${facts.sealAvailable ? "in stock" : "not in stock and carries a 35-day lead time"}, the recommended disposition is to intervene now and expedite the seal while retaining the full overhaul in the turnaround. This recommendation is grounded only in the evidence above and requires human approval; it is not an autonomous control action.`,
  ].join(" ");
}

interface HistoryBundle {
  recommendations: Recommendation[];
  evidence: RecommendationEvidence[];
  decisions: HumanDecision[];
  outcomes: OperationalOutcome[];
  interactions: AiInteraction[];
}

/**
 * A portfolio of AI-explained recommendations so ROTS metrics are meaningful
 * WITHOUT overstating reality:
 *  - every actual AI interaction is the offline mock provider (accounting
 *    "actual", $0 cost);
 *  - some recommendations are decided, but NO outcome is validated yet, so
 *    every outcome is projected/pending and realised value is not available.
 */
function buildRecommendationBook(): HistoryBundle {
  const specs = [
    { key: "e205", asset: "asset-e205", title: "Clean E-205 bundle before efficiency loss compounds", decision: "approved" as const, atStake: 260000, projected: 138000, day: 55, owner: "Reliability Lead — Unit 200", disp: "planned_maintenance" as const },
    { key: "p210", asset: "asset-p210", title: "Proactively replace P-210A mechanical seal", decision: "approved" as const, atStake: 120000, projected: 61000, day: 48, owner: "Rotating-equipment Engineer", disp: "planned_maintenance" as const },
    { key: "f201", asset: "asset-f201", title: "Schedule F-201 convection-section cleaning", decision: null, atStake: 180000, projected: 90000, day: 40, owner: "Fired-equipment Engineer", disp: "planned_maintenance" as const },
    { key: "k202", asset: "asset-k202", title: "Defer K-202 valve overhaul to turnaround", decision: "modified" as const, atStake: 80000, projected: 44000, day: 33, owner: "Turnaround Planner", disp: "next_turnaround" as const },
    { key: "v208", asset: "asset-v208", title: "Tune V-208 level control", decision: "rejected" as const, atStake: 30000, projected: 0, day: 26, owner: "Process Engineer", disp: "monitor" as const },
    { key: "p214", asset: "asset-p214", title: "Replace P-214 mechanical seal", decision: "approved" as const, atStake: 44000, projected: 22000, day: 18, owner: "Maintenance Planner", disp: "planned_maintenance" as const },
  ];

  const recommendations: Recommendation[] = [];
  const evidence: RecommendationEvidence[] = [];
  const decisions: HumanDecision[] = [];
  const outcomes: OperationalOutcome[] = [];
  const interactions: AiInteraction[] = [];

  for (const s of specs) {
    const recId = `rec-${s.key}`;
    const aiId = `ai-${s.key}`;
    const accepted = s.decision === "approved" || s.decision === "modified";
    // Open (undecided) or actioned (decided, outcome pending) or closed (rejected).
    const status: Recommendation["status"] =
      s.decision === null ? "open" : s.decision === "rejected" ? "closed" : "actioned";

    recommendations.push({
      id: recId,
      assetId: s.asset,
      createdAt: dayIso(s.day, 8),
      title: s.title,
      summary: s.title,
      disposition: s.disp,
      severity: "medium",
      trendProjectionConfidence: 0.72,
      actionPlan: [
        { kind: "inspection", label: s.title, timing: "Planned window" },
      ],
      decisionOwner: s.owner,
      dueBy: null,
      aiRationale: `Grounded explanation for ${s.title} (synthetic, mock provider).`,
      aiInteractionId: aiId,
      evidenceIds: [`rev-${s.key}-1`],
      valueAtStakeUsd: s.atStake,
      projectedValueEnabledUsd: s.projected,
      currency: CURRENCY,
      status,
    });

    evidence.push(
      ev(`rev-${s.key}-1`, recId, "Condition summary", `${s.title} — supporting condition evidence (synthetic).`, "deterministic", "risk_engine", null, dayIso(s.day)),
    );

    if (s.decision !== null) {
      decisions.push({
        id: `hd-${s.key}`,
        recommendationId: recId,
        decidedBy: "reliability.lead@synthetic",
        role: s.owner,
        decision: s.decision,
        decidedAt: dayIso(s.day, 10),
        note: accepted ? "Accepted based on evidence; outcome pending validation." : "Rejected — insufficient benefit.",
        modifiedDisposition: s.decision === "modified" ? "next_turnaround" : null,
      });
    }

    if (accepted) {
      // Outcome PENDING — projected only, never realised in the reset state.
      outcomes.push({
        id: `oo-${s.key}`,
        recommendationId: recId,
        decisionId: `hd-${s.key}`,
        assetId: s.asset,
        recordedAt: dayIso(Math.min(s.day + 8, HISTORY_DAYS - 1)),
        resolved: false,
        description: "Action in progress — operational outcome not yet validated.",
        estimatedValue: s.projected,
        realisedValue: null,
        valueStatus: "projected",
        currency: CURRENCY,
      });
    }

    // Actual AI call: always the offline mock provider, $0, accounting "actual".
    const inTok = 1400 + s.day * 8;
    const outTok = 260 + s.day * 3;
    interactions.push({
      id: aiId,
      createdAt: dayIso(s.day, 8),
      accounting: "actual",
      provider: "mock",
      model: "mock/deterministic-explainer",
      useCase: PROMPTS.asset_risk_explanation!.useCase,
      promptVersionId: PROMPTS.asset_risk_explanation!.id,
      inputTokens: inTok,
      outputTokens: outTok,
      estimatedCostUsd: 0,
      latencyMs: 300 + outTok,
      recommendationId: recId,
      evidenceIds: [`rev-${s.key}-1`],
      outputSummary: `Explanation for ${s.title}`,
    });
  }

  return { recommendations, evidence, decisions, outcomes, interactions };
}