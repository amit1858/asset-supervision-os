import "server-only";

import { getRepository } from "@/data/repository";
import type { PersonaId } from "@/personas/types";
import { getEngineAdapter } from "@/v2/server/calculations";
import {
  ASSESSMENT_AS_OF,
  getK201ReliabilityView,
  K201_TAG,
} from "@/v2/server/reliability/asset-reliability-view";
import {
  UNAVAILABLE_DISPLAY,
  type EvidenceLineageRowView,
  type GovernedMetricView,
  type WorkReadinessView,
} from "@/v2/reliability/view-types";
import type {
  InventoryBridgeView,
  InventoryLegView,
  MaintenanceMaterialsView,
  WorkOrderReadinessRowView,
} from "@/v2/materials/view-types";

/**
 * September 8 Maintenance & Materials experience — the K-201 maintenance &
 * materials READ MODEL (server-only).
 *
 * This model recomputes NOTHING. It composes the SAME governed reliability view
 * (`getK201ReliabilityView`) the Asset 360 screen consumes — reusing its
 * governed work-readiness, turnaround-fit, assessment and authority envelopes
 * verbatim — and it reads the governed inventory-balance evidence for the
 * bridge legs directly from the engine port (the exact evidence the governed
 * work-readiness calculation consumes). The post-allocation buffer shown as the
 * bridge result is the governed calculation envelope, never a re-derivation.
 *
 * No clock is read and no value is randomised: the reliability view is
 * evaluated at explicit injected instants, and every displayed timestamp is a
 * governed record `asOf`.
 */

const ASSET_ID = "asset-k201";

const MATERIALS_DISPLAY: Record<string, string> = {
  ready: "Materials ready",
  blocked: "Materials blocked",
  not_required: "No materials required",
  unavailable: "Materials evidence unavailable",
};
const INVENTORY_DISPLAY: Record<string, string> = {
  healthy: "Buffer healthy",
  at_reorder_point: "At reorder point",
  below_reorder_point: "Below reorder point",
  unavailable: "Inventory evidence unavailable",
};

function metricOf(wr: WorkReadinessView, suffix: string): GovernedMetricView | undefined {
  return wr.metrics.find((m) => m.key === `${wr.workOrderId}-${suffix}`);
}

function readinessKind(
  materialsLabel: string,
  required: number | null,
  available: number | null,
): WorkOrderReadinessRowView["readinessKind"] {
  if (materialsLabel === "unavailable") return "missing_evidence";
  if (materialsLabel === "not_required") return "not_required";
  if (materialsLabel === "blocked") return "blocked";
  if (materialsLabel === "ready") {
    if (available === 0 && (required ?? 0) === 0) return "available_zero";
    return "ready";
  }
  return "missing_evidence";
}

function sumLeg(
  legs: readonly InventoryLegView[],
  pick: (leg: InventoryLegView) => number | null,
): number | null {
  let total = 0;
  for (const leg of legs) {
    const value = pick(leg);
    if (value === null) return null;
    total += value;
  }
  return total;
}

function bridgeFor(
  workOrderId: string,
  wr: WorkReadinessView,
  partLabelFor: (spareId: string) => string,
): InventoryBridgeView {
  const port = getEngineAdapter();
  const evidence = port.workOrderMaterialsEvidence(workOrderId, ASSET_ID);
  const legs: InventoryLegView[] = (evidence?.spareBalances ?? []).map((b) => ({
    spareId: b.spareId,
    partLabel: partLabelFor(b.spareId),
    onHand: b.onHandQty,
    reserved: b.reservedQty,
    reorderPoint: b.reorderPoint,
    hasBalance: b.hasBalance,
  }));

  const required = metricOf(wr, "required");
  const available = metricOf(wr, "available");
  const shortage = metricOf(wr, "shortage");
  const buffer = metricOf(wr, "buffer");

  const onHandTotal = sumLeg(legs, (l) => l.onHand);
  const reservedTotal = sumLeg(legs, (l) => l.reserved);
  const reorderPointTotal = sumLeg(legs, (l) => l.reorderPoint);

  const q = (value: number | null): string =>
    value === null || !Number.isFinite(value) ? UNAVAILABLE_DISPLAY : String(value);

  const equationText =
    `On hand ${q(onHandTotal)} minus reserved ${q(reservedTotal)} ` +
    `minus required ${required?.display ?? UNAVAILABLE_DISPLAY} ` +
    `minus reorder point ${q(reorderPointTotal)} ` +
    `equals post-allocation buffer ${buffer?.display ?? UNAVAILABLE_DISPLAY}.`;

  return {
    workOrderId,
    legs,
    required: required ?? absentMetric(`${workOrderId}-required`, "Required quantity"),
    available: available ?? absentMetric(`${workOrderId}-available`, "Available (unreserved)"),
    shortage: shortage ?? absentMetric(`${workOrderId}-shortage`, "Shortage"),
    buffer: buffer ?? absentMetric(`${workOrderId}-buffer`, "Buffer to reorder point"),
    onHandTotal,
    reservedTotal,
    reorderPointTotal,
    equationText,
  };
}

function absentMetric(key: string, label: string): GovernedMetricView {
  return {
    key,
    label,
    available: false,
    display: UNAVAILABLE_DISPLAY,
    rawValue: null,
    freshness: "missing",
    freshnessLabel: "No evidence",
    trust: "unknown",
    trustLabel: "Unclassified",
    provenance: "deterministic",
    sourceMode: "local",
    formulaVersion: "n/a",
    asOf: ASSESSMENT_AS_OF,
    evidenceIds: [],
    unavailableReason: "calculation_not_produced",
  };
}

function buildRow(
  wr: WorkReadinessView,
  meta: { number: string; title: string },
  partLabelFor: (spareId: string) => string,
): WorkOrderReadinessRowView {
  const required = metricOf(wr, "required");
  const available = metricOf(wr, "available");
  const shortage = metricOf(wr, "shortage");
  const buffer = metricOf(wr, "buffer");
  return {
    workOrderId: wr.workOrderId,
    workOrderNumber: meta.number,
    title: meta.title,
    materialsLabel: wr.materialsLabel,
    materialsDisplay: MATERIALS_DISPLAY[wr.materialsLabel] ?? wr.materialsDisplay,
    inventoryLabel: wr.bufferLabel,
    inventoryDisplay: INVENTORY_DISPLAY[wr.bufferLabel] ?? wr.bufferDisplay,
    readinessKind: readinessKind(
      wr.materialsLabel,
      required?.rawValue ?? null,
      available?.rawValue ?? null,
    ),
    requiredDisplay: required?.display ?? UNAVAILABLE_DISPLAY,
    availableDisplay: available?.display ?? UNAVAILABLE_DISPLAY,
    shortageDisplay: shortage?.display ?? UNAVAILABLE_DISPLAY,
    bufferDisplay: buffer?.display ?? UNAVAILABLE_DISPLAY,
    freshness: wr.freshness,
    freshnessLabel: wr.freshnessLabel,
    evaluatedAt: wr.evaluatedAt,
    bridge: bridgeFor(wr.workOrderId, wr, partLabelFor),
  };
}

/** Build the complete K-201 Maintenance & Materials workspace view. */
export function getMaintenanceMaterialsView(viewerId: PersonaId): MaintenanceMaterialsView {
  const reliability = getK201ReliabilityView(viewerId);
  const model = getRepository().getAsset360(K201_TAG);

  const partLabelFor = (spareId: string): string => {
    const match = (model?.spares ?? []).find((s) => s.part.id === spareId);
    return match ? match.part.description : spareId;
  };
  const woMeta = (id: string): { number: string; title: string } => {
    const wo = (model?.workOrders ?? []).find((w) => w.id === id);
    return { number: wo?.number ?? id, title: wo?.title ?? id };
  };

  const rows = reliability.workReadiness.map((wr) =>
    buildRow(wr, woMeta(wr.workOrderId), partLabelFor),
  );
  const blockedCount = rows.filter((r) => r.readinessKind === "blocked").length;

  const horizon = reliability.horizon;
  const auth = reliability.authority;

  // Materials-focused evidence lineage: the governed work-readiness and
  // turnaround rows, plus the raw inventory evidence for each work order.
  const port = getEngineAdapter();
  const inventoryLineage: EvidenceLineageRowView[] = reliability.workReadiness
    .map((wr): EvidenceLineageRowView | null => {
      const evidence = port.workOrderMaterialsEvidence(wr.workOrderId, ASSET_ID);
      if (!evidence) return null;
      return {
        key: `${wr.workOrderId}-inventory`,
        label: `Inventory balance · ${wr.workOrderId}`,
        provenance: "measured",
        trustLabel: "Measured fact",
        formulaVersion: "n/a",
        sourceMode: evidence.evidence.sourceMode,
        evidenceIds: evidence.evidence.evidenceIds,
        asOf: evidence.evidence.capturedAt ?? reliability.turnaround.evaluatedAt ?? ASSESSMENT_AS_OF,
      };
    })
    .filter((r): r is EvidenceLineageRowView => r !== null);

  const readinessLineage = reliability.evidenceLineage.filter(
    (r) => r.key.endsWith("-readiness") || r.key === "turnaround-fit",
  );

  return {
    summary: {
      tag: reliability.tag,
      assetName: reliability.assetName,
      assetHref: `/v2/assets/${reliability.tag}`,
      interventionTitle: reliability.recommendation.title,
      interventionType: reliability.recommendation.interventionType,
      recommendationStatusLabel: reliability.recommendation.statusLabel,
      blockedCount,
      workOrderCount: rows.length,
      turnaroundFitDisplay: reliability.turnaround.available
        ? reliability.turnaround.fitDisplay
        : UNAVAILABLE_DISPLAY,
      evaluatedAt: reliability.turnaround.evaluatedAt,
    },
    workOrders: rows,
    turnaround: reliability.turnaround,
    horizon,
    accountability: {
      decisionStatusLabel: auth.decisionStatusLabel,
      nextActLabel: auth.nextActLabel,
      nextActPersonaName: auth.nextActPersonaName,
      endorsementRequired: auth.endorsementRequired,
      endorsementNote: auth.endorsementBanner,
      noDecisionRecorded: reliability.decisionAudit.entries.length === 0,
      readOnlyNotice: auth.readOnlyNotice,
    },
    evidenceLineage: [...readinessLineage, ...inventoryLineage],
  };
}
