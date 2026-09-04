import "server-only";

import type { PersonaId } from "@/personas/types";
import { toV2Href } from "@/v2/nav";
import {
  freshnessLabel,
  type ReliabilityWorkspaceView,
  type ReliabilityPriorityRowView,
} from "@/v2/reliability/view-types";
import { getK201ReliabilityView } from "./asset-reliability-view";

/**
 * September 6–7 Reliability experience — the Reliability Command Center
 * workspace read model (server-only).
 *
 * The workspace opens on the governed priority: K-201. Every figure in the row
 * and the summary strip is taken from the same governed calculation view the
 * Asset 360 screen renders, so the workspace and the asset record can never
 * disagree. Counts are limited to what the seeded governed evidence
 * deterministically supports — no fabricated portfolio-wide totals.
 */
export function getReliabilityWorkspaceView(viewerId: PersonaId): ReliabilityWorkspaceView {
  const view = getK201ReliabilityView(viewerId);

  const byKey = new Map(view.assessmentMetrics.map((m) => [m.key, m]));
  const health = byKey.get("health")!;
  const risk = byKey.get("risk")!;
  const ttc = byKey.get("ttc")!;
  const exposure = byKey.get("exposure")!;

  const row: ReliabilityPriorityRowView = {
    tag: view.tag,
    assetName: view.assetName,
    href: toV2Href(`/assets/${view.tag}`),
    healthDisplay: health.display,
    riskDisplay: risk.display,
    timeToCriticalDisplay: ttc.display,
    exposureDisplay: exposure.display,
    decisionStatusLabel: view.authority.decisionStatusLabel,
    nextActLabel: view.authority.nextActLabel,
    freshnessLabel: freshnessLabel(exposure.freshness),
  };

  const summary: ReliabilityWorkspaceView["summary"] = [
    {
      label: "Priority assets",
      value: "1",
      hint: "K-201 awaiting a governed decision",
    },
    {
      label: "High-exposure cases",
      value: view.authority.endorsementRequired ? "1" : "0",
      hint: view.authority.endorsementRequired
        ? "Endorsement required (≥ $1,000,000)"
        : "None above the endorsement threshold",
    },
    {
      label: "Governed OEE · HDS-2",
      value: view.oee.display,
      hint: "Line overall equipment effectiveness",
    },
  ];

  return {
    evaluatedAt: view.evaluatedAt,
    summary,
    priorities: [row],
    emptyTitle: "No governed priorities",
    emptyDescription:
      "No asset currently has a governed assessment requiring reliability attention.",
  };
}
