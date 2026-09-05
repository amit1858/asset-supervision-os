import "server-only";

import { getDataset } from "@/data/seed";
import { getPersona } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import {
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
  TurnaroundControlView,
  TurnaroundWorkOrderView,
} from "@/v2/turnaround/view-types";

/**
 * September 9 Turnaround Control experience — the K-201 turnaround READ MODEL
 * (server-only).
 *
 * This model recomputes NOTHING. It composes the SAME governed reliability view
 * (`getK201ReliabilityView`) the Asset 360 and Materials screens consume,
 * reusing its governed turnaround-fit envelope (max spare lead 35d, days until
 * turnaround 88, slack 53d, earliest spare availability 2026-08-31, evaluated at
 * 12:00Z), its governed operational horizon (predicted critical horizon
 * ≈17.93d) and its governed work-readiness envelopes (wo-1 materials-ready,
 * wo-2 materials-blocked) verbatim. The exact governed subject identity of the
 * turnaround-fit calculation is displayed unchanged; human-readable names only
 * accompany the IDs. No scheduling, procurement, approval or scope-mutation
 * control exists here.
 */

const ASSET_ID = "asset-k201";
const TURNAROUND_SCOPE_ID = "wp-k201";
const TURNAROUND_WORK_ORDER_ID = "wo-2";

/**
 * The mandatory read-only caution. Explanatory copy — NOT a governed value —
 * that a lead-time fit against the turnaround window is not a safe-to-wait
 * signal, because the predicted critical horizon occurs earlier than both.
 */
const SAFE_TO_WAIT_WARNING =
  "The spare lead time fits the turnaround window, but the predicted critical " +
  "horizon occurs earlier than both. A fit against the turnaround must not be " +
  "read as safe to wait.";

const MATERIALS_DISPLAY: Record<string, string> = {
  ready: "Materials ready",
  blocked: "Materials blocked",
  not_required: "No materials required",
  unavailable: "Materials evidence unavailable",
};

function metricOf(wr: WorkReadinessView, suffix: string): GovernedMetricView | undefined {
  return wr.metrics.find((m) => m.key === `${wr.workOrderId}-${suffix}`);
}

function readinessKind(
  materialsLabel: string,
  required: number | null,
  available: number | null,
): TurnaroundWorkOrderView["readinessKind"] {
  if (materialsLabel === "unavailable") return "missing_evidence";
  if (materialsLabel === "not_required") return "not_required";
  if (materialsLabel === "blocked") return "blocked";
  if (materialsLabel === "ready") {
    if (available === 0 && (required ?? 0) === 0) return "available_zero";
    return "ready";
  }
  return "missing_evidence";
}

/** Build the complete K-201 Turnaround Control workspace view. */
export function getTurnaroundControlView(viewerId: PersonaId): TurnaroundControlView {
  const reliability = getK201ReliabilityView(viewerId);
  const db = getDataset();

  const workPackage = db.turnaroundWorkPackages.find((p) => p.id === TURNAROUND_SCOPE_ID);
  const project = workPackage
    ? db.turnaroundProjects.find((pr) => pr.id === workPackage.turnaroundProjectId)
    : undefined;
  const scopeWorkOrder = db.workOrders.find((w) => w.id === TURNAROUND_WORK_ORDER_ID);
  const asset = db.assets.find((a) => a.id === ASSET_ID);

  const woMeta = (id: string): { number: string; title: string } => {
    const wo = db.workOrders.find((w) => w.id === id);
    return { number: wo?.number ?? id, title: wo?.title ?? id };
  };

  const workOrders: TurnaroundWorkOrderView[] = reliability.workReadiness.map((wr) => {
    const meta = woMeta(wr.workOrderId);
    const required = metricOf(wr, "required")?.rawValue ?? null;
    const available = metricOf(wr, "available")?.rawValue ?? null;
    const timing: TurnaroundWorkOrderView["timing"] =
      wr.workOrderId === TURNAROUND_WORK_ORDER_ID ? "turnaround_scoped" : "immediate";
    return {
      workOrderId: wr.workOrderId,
      workOrderNumber: meta.number,
      title: meta.title,
      materialsLabel: wr.materialsLabel,
      materialsDisplay: MATERIALS_DISPLAY[wr.materialsLabel] ?? wr.materialsDisplay,
      readinessKind: readinessKind(wr.materialsLabel, required, available),
      timing,
      timingLabel:
        timing === "turnaround_scoped"
          ? "Held for the turnaround window"
          : "Immediate — outside the turnaround scope",
      freshnessLabel: wr.freshnessLabel,
    };
  });

  const turnaround = reliability.turnaround;
  const maxLead = turnaround.metrics.find((m) => m.key === "ta-maxlead");
  const until = turnaround.metrics.find((m) => m.key === "ta-until");
  const slack = turnaround.metrics.find((m) => m.key === "ta-slack");
  const auth = reliability.authority;
  const scopeOwner = getPersona("turnaround_manager");

  const lineage: EvidenceLineageRowView[] = reliability.evidenceLineage.filter(
    (r) => r.key === "turnaround-fit" || r.key.endsWith("-readiness"),
  );

  return {
    summary: {
      tag: reliability.tag,
      assetName: reliability.assetName,
      assetHref: `/v2/assets/${reliability.tag}`,
      fitDisplay: turnaround.available ? turnaround.fitDisplay : UNAVAILABLE_DISPLAY,
      maxLeadDisplay: maxLead?.display ?? UNAVAILABLE_DISPLAY,
      daysUntilDisplay: until?.display ?? UNAVAILABLE_DISPLAY,
      slackDisplay: slack?.display ?? UNAVAILABLE_DISPLAY,
      availableDate: turnaround.availableDate,
      evaluatedAt: turnaround.evaluatedAt,
    },
    identity: {
      turnaroundScopeId: TURNAROUND_SCOPE_ID,
      workOrderId: TURNAROUND_WORK_ORDER_ID,
      assetId: ASSET_ID,
      turnaroundName: project?.name ?? project?.code ?? TURNAROUND_SCOPE_ID,
      scopePackageCode: workPackage?.code ?? TURNAROUND_SCOPE_ID,
      workOrderNumber: scopeWorkOrder?.number ?? TURNAROUND_WORK_ORDER_ID,
      assetTag: asset?.tag ?? K201_TAG,
    },
    turnaround,
    horizon: reliability.horizon,
    workOrders,
    accountability: {
      decisionStatusLabel: auth.decisionStatusLabel,
      decisionOwnerName: auth.nextActPersonaName,
      nextActLabel: auth.nextActLabel,
      scopeOwnerName: scopeOwner.displayName,
      endorsementRequired: auth.endorsementRequired,
      endorsementNote: auth.endorsementBanner,
      readOnlyNotice: auth.readOnlyNotice,
    },
    safeToWaitWarning: SAFE_TO_WAIT_WARNING,
    evidenceLineage: lineage,
  };
}
