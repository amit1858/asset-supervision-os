import "server-only";
import type {
  Asset,
  AiInteraction,
  ConditionEvent,
  Dataset,
  HumanDecision,
  InventoryBalance,
  MaintenanceHistoryRecord,
  Recommendation,
  RecommendationEvidence,
  SensorDefinition,
  SensorReading,
  SparePart,
  TurnaroundProject,
  TurnaroundWorkPackage,
  WorkOrder,
} from "@/domain/types";
import type { AssetOperationalStatus, ReadinessDimension } from "@/domain/enums";
import type { OeeResult } from "@/engines/oee";
import type { RiskResult } from "@/engines/risk";
import { computeRots, usageByProvider, type RotsMetrics, type ProviderUsage } from "@/engines/rots";
import { getDataset } from "./seed";
import { analyzeK201, type K201Analysis } from "./k201-analysis";
import { LINE } from "./constants";

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export interface AssetSummary {
  asset: Asset;
  openRecommendation: Recommendation | null;
  latestConditionSeverity: ConditionEvent["severity"] | null;
  riskScore: number | null;
  healthScore: number | null;
}

/**
 * Command-center counts. Every total reconciles with its breakdown:
 *   requiringAttention = critical + attention
 *   underSupervision   = critical + attention + monitored + inMaintenance + normal
 * These are distinct concepts and are calculated separately.
 */
export interface CommandCenterCounts {
  underSupervision: number;
  requiringAttention: number;
  critical: number;
  attention: number;
  monitored: number;
  inMaintenance: number;
  normal: number;
  openRecommendations: number;
  pendingDecisions: number;
}

export interface CommandCenterModel {
  plantName: string;
  generatedAt: string;
  counts: CommandCenterCounts;
  statusCounts: Record<AssetOperationalStatus, number>;
  /** Assets whose STATUS requires attention (critical + attention). */
  attentionAssets: AssetSummary[];
  /** Assets under active monitoring (status = monitor). */
  monitoredAssets: AssetSummary[];
  /** Recommendations awaiting a human decision (status = open). */
  pendingApprovals: Recommendation[];
  oee: OeeResult;
  topLoss: { category: string; units: number };
  activeExposureUsd: number;
  turnaround: TurnaroundSummary;
  rots: RotsMetrics;
  heroAssetTag: string;
}

export interface Asset360Model {
  asset: Asset;
  sensors: Array<{ definition: SensorDefinition; readings: SensorReading[] }>;
  risk: RiskResult | null;
  analysis: K201Analysis | null;
  conditionEvents: ConditionEvent[];
  workOrders: WorkOrder[];
  maintenanceHistory: MaintenanceHistoryRecord[];
  spares: Array<{ part: SparePart; balance: InventoryBalance | null }>;
  recommendation: Recommendation | null;
  evidence: RecommendationEvidence[];
  aiInteraction: AiInteraction | null;
  decision: HumanDecision | null;
  linkedWorkPackage: TurnaroundWorkPackage | null;
  /** Days from now until the next turnaround window opens (null if none). */
  turnaroundWindowInDays: number | null;
}

export interface TurnaroundSummary {
  project: TurnaroundProject | null;
  readiness: Record<ReadinessDimension, { ready: number; total: number }>;
  criticalPathAtRisk: number;
  workPackageCount: number;
}

export interface RotsModel {
  metrics: RotsMetrics;
  byProvider: ProviderUsage[];
  interactions: AiInteraction[];
  recommendations: Recommendation[];
  decisions: HumanDecision[];
}

// ---------------------------------------------------------------------------
// Repository interface (local now; Snowflake-backed implementation later)
// ---------------------------------------------------------------------------

export interface Repository {
  listAssets(): Asset[];
  getAssetByTag(tag: string): Asset | null;
  getCommandCenter(): CommandCenterModel;
  getAsset360(tag: string): Asset360Model | null;
  getRots(): RotsModel;
  getTurnaround(): TurnaroundSummary;
}

const EMPTY_STATUS_COUNTS: Record<AssetOperationalStatus, number> = {
  normal: 0,
  monitor: 0,
  attention: 0,
  critical: 0,
  offline: 0,
  maintenance: 0,
  planned_outage: 0,
};

class LocalRepository implements Repository {
  private readonly db: Dataset;

  constructor(db: Dataset) {
    this.db = db;
  }

  listAssets(): Asset[] {
    return this.db.assets;
  }

  getAssetByTag(tag: string): Asset | null {
    return this.db.assets.find((a) => a.tag === tag) ?? null;
  }

  private heroAnalysis(): K201Analysis {
    return analyzeK201({
      sensorReadings: this.db.sensorReadings,
      productionRuns: this.db.productionRuns,
      downtimeEvents: this.db.downtimeEvents,
    });
  }

  getCommandCenter(): CommandCenterModel {
    const db = this.db;
    const analysis = this.heroAnalysis();

    const statusCounts = { ...EMPTY_STATUS_COUNTS };
    for (const a of db.assets) statusCounts[a.operationalStatus] += 1;

    const openRecs = db.recommendations.filter(
      (r) => r.status === "open" || r.status === "actioned",
    );
    const pendingApprovals = db.recommendations.filter((r) => r.status === "open");

    // Assets requiring attention = critical + attention STATUS only (so the
    // headline count reconciles with its breakdown).
    const attentionAssets: AssetSummary[] = db.assets
      .filter((a) => a.operationalStatus === "critical" || a.operationalStatus === "attention")
      .map((asset) => this.summarize(asset, analysis))
      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0) || rankCrit(a.asset) - rankCrit(b.asset));

    const monitoredAssets: AssetSummary[] = db.assets
      .filter((a) => a.operationalStatus === "monitor")
      .map((asset) => this.summarize(asset, analysis));

    const counts: CommandCenterCounts = {
      underSupervision: db.assets.length,
      requiringAttention: statusCounts.critical + statusCounts.attention,
      critical: statusCounts.critical,
      attention: statusCounts.attention,
      monitored: statusCounts.monitor,
      inMaintenance: statusCounts.maintenance,
      normal: statusCounts.normal,
      openRecommendations: openRecs.length,
      pendingDecisions: pendingApprovals.length,
    };

    const losses = analysis.recentOee.losses;
    const lossEntries: Array<{ category: string; units: number }> = [
      { category: "Availability", units: losses.availabilityLossUnits },
      { category: "Performance (speed)", units: losses.performanceLossUnits },
      { category: "Quality", units: losses.qualityLossUnits },
    ].sort((a, b) => b.units - a.units);

    const activeExposureUsd = openRecs.reduce((s, r) => s + r.valueAtStakeUsd, 0);

    return {
      plantName: db.plants[0]?.name ?? "Plant",
      generatedAt: db.meta.generatedAt,
      counts,
      statusCounts,
      attentionAssets,
      monitoredAssets,
      pendingApprovals,
      oee: analysis.recentOee,
      topLoss: lossEntries[0] ?? { category: "—", units: 0 },
      activeExposureUsd,
      turnaround: this.getTurnaround(),
      rots: this.getRots().metrics,
      heroAssetTag: db.meta.heroAssetTag,
    };
  }

  private summarize(asset: Asset, analysis: K201Analysis): AssetSummary {
    const openRecommendation =
      this.db.recommendations.find(
        (r) => r.assetId === asset.id && (r.status === "open" || r.status === "actioned"),
      ) ?? null;

    const conditionForAsset = this.db.conditionEvents
      .filter((c) => c.assetId === asset.id)
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

    const isHero = asset.tag === this.db.meta.heroAssetTag;
    return {
      asset,
      openRecommendation,
      latestConditionSeverity: conditionForAsset[0]?.severity ?? null,
      riskScore: isHero ? analysis.risk.riskScore : null,
      healthScore: isHero ? analysis.risk.healthScore : null,
    };
  }

  getAsset360(tag: string): Asset360Model | null {
    const db = this.db;
    const asset = this.getAssetByTag(tag);
    if (!asset) return null;

    const sensorDefs = db.sensorDefinitions.filter((s) => s.assetId === asset.id);
    const sensors = sensorDefs.map((definition) => ({
      definition,
      readings: db.sensorReadings
        .filter((r) => r.sensorId === definition.id)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    }));

    const isHero = asset.tag === db.meta.heroAssetTag;
    const analysis = isHero ? this.heroAnalysis() : null;

    const recommendation =
      db.recommendations.find((r) => r.assetId === asset.id) ?? null;
    const evidence = recommendation
      ? db.recommendationEvidence.filter((e) => e.recommendationId === recommendation.id)
      : [];
    const aiInteraction = recommendation?.aiInteractionId
      ? db.aiInteractions.find((i) => i.id === recommendation.aiInteractionId) ?? null
      : null;
    const decision = recommendation
      ? db.humanDecisions.find((h) => h.recommendationId === recommendation.id) ?? null
      : null;

    const spares = this.sparesFor(asset);

    const linkedWorkPackage =
      db.turnaroundWorkPackages.find((w) => w.assetId === asset.id) ?? null;

    return {
      asset,
      sensors,
      risk: analysis?.risk ?? null,
      analysis,
      conditionEvents: db.conditionEvents
        .filter((c) => c.assetId === asset.id)
        .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
      workOrders: db.workOrders
        .filter((w) => w.assetId === asset.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      maintenanceHistory: db.maintenanceHistory
        .filter((m) => m.assetId === asset.id)
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt)),
      spares,
      recommendation,
      evidence,
      aiInteraction,
      decision,
      linkedWorkPackage,
      turnaroundWindowInDays: (() => {
        const start = db.turnaroundProjects[0]?.windowStart;
        if (!start) return null;
        const anchor = new Date(db.meta.generatedAt).getTime();
        return Math.round((new Date(start).getTime() - anchor) / 86_400_000);
      })(),
    };
  }

  /** Spare parts relevant to an asset (via its open work orders' requirements). */
  private sparesFor(asset: Asset): Array<{ part: SparePart; balance: InventoryBalance | null }> {
    const db = this.db;
    const requiredIds = new Set<string>();
    for (const wo of db.workOrders) {
      if (wo.assetId === asset.id) wo.requiredSpareIds.forEach((id) => requiredIds.add(id));
    }
    // Fallback: for the hero asset, show its dedicated spares if no WO links.
    const parts = db.spareParts.filter((p) =>
      requiredIds.has(p.id) || (asset.tag === db.meta.heroAssetTag && p.partNumber.includes("38M9")),
    );
    return parts.map((part) => ({
      part,
      balance: db.inventoryBalances.find((b) => b.sparePartId === part.id) ?? null,
    }));
  }

  getRots(): RotsModel {
    const db = this.db;
    const metrics = computeRots({
      interactions: db.aiInteractions,
      recommendations: db.recommendations,
      decisions: db.humanDecisions,
      outcomes: db.operationalOutcomes,
    });
    return {
      metrics,
      byProvider: usageByProvider(db.aiInteractions),
      interactions: [...db.aiInteractions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      recommendations: db.recommendations,
      decisions: db.humanDecisions,
    };
  }

  getTurnaround(): TurnaroundSummary {
    const db = this.db;
    const project = db.turnaroundProjects[0] ?? null;
    const packages = db.turnaroundWorkPackages;

    const dims: ReadinessDimension[] = ["engineering", "materials", "labour", "permits"];
    const readiness = dims.reduce(
      (acc, dim) => {
        acc[dim] = {
          ready: packages.filter((p) => p.readiness[dim] === "ready" || p.readiness[dim] === "on_track").length,
          total: packages.length,
        };
        return acc;
      },
      {} as Record<ReadinessDimension, { ready: number; total: number }>,
    );

    return {
      project,
      readiness,
      criticalPathAtRisk: packages.filter(
        (p) => p.onCriticalPath && Object.values(p.readiness).some((r) => r === "at_risk" || r === "not_started"),
      ).length,
      workPackageCount: packages.length,
    };
  }
}

function rankCrit(a: Asset): number {
  return { A: 0, B: 1, C: 2, D: 3, E: 4 }[a.criticality];
}

let repo: Repository | null = null;

/** Returns the active repository. Local seeded data for Phase 1. */
export function getRepository(): Repository {
  if (repo === null) repo = new LocalRepository(getDataset());
  return repo;
}

export { LINE };