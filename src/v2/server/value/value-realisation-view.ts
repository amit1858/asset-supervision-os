import "server-only";

import { getRepository } from "@/data/repository";
import type { PersonaId } from "@/personas/types";
import { getEngineAdapter } from "@/v2/server/calculations";
import { getK201ReliabilityView } from "@/v2/server/reliability/asset-reliability-view";
import {
  formatUsd,
  UNAVAILABLE_DISPLAY,
  type GovernedMetricView,
  type EvidenceLineageRowView,
} from "@/v2/reliability/view-types";
import type {
  OutstandingOutcomeRowView,
  SourceFactView,
  SourceProvenanceRowView,
  ValueRealisationView,
} from "@/v2/value/view-types";

/**
 * September 9 Value Realisation experience — the READ MODEL (server-only).
 *
 * This model recomputes NOTHING. It presents FOUR strictly separate financial
 * concepts, each with its correct representation:
 *
 *  - Decision exposure ($1,620,156) — the governed assessment envelope
 *    (`valueAtStakeUsd`), reused verbatim from the SAME reliability view that
 *    drives the endorsement policy. This is the only `GovernedMetricView`.
 *
 *  - Value at stake / portfolio projected / realised — repository ROTS
 *    aggregates, and K-201 projected — the port's recommendation projection.
 *    These are seeded / repository facts with NO governed calculation envelope,
 *    so they are `SourceFactView`s: they carry a source identity and record IDs
 *    but are NEVER assigned a fabricated formulaVersion, freshness, provenance
 *    or trust classification.
 *
 * Realised value is not yet available; it is rendered as an explicit
 * "not yet available" statement, NEVER as $0.
 */

const K201_RECOMMENDATION_ID = "rec-k201";
const K201_ASSET_ID = "asset-k201";

// Card-facing attribution is neutral and free of token-economics terminology.
// The exact technical ledger / function identity is provenance only and is
// surfaced solely inside the collapsed provenance disclosure.
const PORTFOLIO_SOURCE = "Portfolio value aggregate · source record";
const PORTFOLIO_PROVENANCE = "Return on Token Spend ledger · portfolio aggregate";
const PORT_SOURCE = "Recommendation value projection · source record";
const PORT_PROVENANCE = "Recommendation value projection (engine port)";

function sourceFact(input: {
  key: string;
  label: string;
  rawValue: number | null;
  available: boolean;
  sourceIdentity: string;
  provenanceIdentity: string;
  sourceRecordIds: readonly string[];
  recordAsOf: string | null;
  qualifier: string;
  unavailableReason?: string | null;
}): SourceFactView {
  return {
    key: input.key,
    label: input.label,
    available: input.available,
    display: input.available ? formatUsd(input.rawValue) : UNAVAILABLE_DISPLAY,
    rawValue: input.available ? input.rawValue : null,
    sourceIdentity: input.sourceIdentity,
    provenanceIdentity: input.provenanceIdentity,
    sourceRecordIds: input.sourceRecordIds,
    recordAsOf: input.recordAsOf,
    unavailableReason: input.available ? null : input.unavailableReason ?? null,
    qualifier: input.qualifier,
  };
}

function countFact(input: {
  key: string;
  label: string;
  rawValue: number;
  sourceRecordIds: readonly string[];
  qualifier: string;
}): SourceFactView {
  return {
    key: input.key,
    label: input.label,
    available: true,
    display: String(input.rawValue),
    rawValue: input.rawValue,
    sourceIdentity: PORTFOLIO_SOURCE,
    provenanceIdentity: PORTFOLIO_PROVENANCE,
    sourceRecordIds: input.sourceRecordIds,
    recordAsOf: null,
    unavailableReason: null,
    qualifier: input.qualifier,
  };
}

/** Build the complete Value Realisation workspace view. */
export function getValueRealisationView(viewerId: PersonaId): ValueRealisationView {
  const reliability = getK201ReliabilityView(viewerId);
  const rots = getRepository().getRots();
  const port = getEngineAdapter();
  const metrics = rots.metrics;

  // Decision exposure — the governed envelope, reused verbatim.
  const exposureMetric =
    reliability.assessmentMetrics.find((m) => m.key === "exposure") ??
    ({
      key: "exposure",
      label: "Decision exposure",
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
      asOf: reliability.evaluatedAt,
      evidenceIds: [],
      unavailableReason: "calculation_not_produced",
    } as GovernedMetricView);
  const decisionExposure: GovernedMetricView = { ...exposureMetric, label: "Decision exposure" };

  // K-201 projected — the port's recommendation projection (a source fact).
  const projection = port.projectRecommendationValue(K201_RECOMMENDATION_ID, K201_ASSET_ID);
  const k201Projected = sourceFact({
    key: "k201-projected",
    label: "K-201 projected value enabled",
    rawValue: projection?.projectedValueEnabledUsd ?? null,
    available: projection !== null,
    sourceIdentity: PORT_SOURCE,
    provenanceIdentity: PORT_PROVENANCE,
    sourceRecordIds: projection ? projection.evidence.evidenceIds : [],
    recordAsOf: projection ? projection.evidence.capturedAt : null,
    qualifier: "conditional — value protected if the intervention is executed",
    unavailableReason: "No projection is available for this recommendation.",
  });

  // Portfolio aggregates — ROTS (source facts).
  const portfolioProjected = sourceFact({
    key: "portfolio-projected",
    label: "Portfolio projected value enabled",
    rawValue: metrics.projectedValueEnabledUsd,
    available: true,
    sourceIdentity: PORTFOLIO_SOURCE,
    provenanceIdentity: PORTFOLIO_PROVENANCE,
    sourceRecordIds: rots.recommendations.map((r) => r.id),
    recordAsOf: null,
    qualifier: "conditional — across all open recommendations if executed",
  });

  const valueAtStake = sourceFact({
    key: "value-at-stake",
    label: "Portfolio value at stake",
    rawValue: metrics.valueAtStakeUsd,
    available: true,
    sourceIdentity: PORTFOLIO_SOURCE,
    provenanceIdentity: PORTFOLIO_PROVENANCE,
    sourceRecordIds: rots.recommendations.map((r) => r.id),
    recordAsOf: null,
    qualifier: "exposure under open decisions — not AI-created value",
  });

  const realised = sourceFact({
    key: "realised",
    label: "Realised value",
    rawValue: metrics.realisedAvailable ? metrics.realisedValueUsd : null,
    available: metrics.realisedAvailable,
    sourceIdentity: PORTFOLIO_SOURCE,
    provenanceIdentity: PORTFOLIO_PROVENANCE,
    sourceRecordIds: [],
    recordAsOf: null,
    qualifier: "validated operational outcomes only",
    unavailableReason:
      "Not yet available — no validated operational outcome exists.",
  });

  const decisionsSupported = countFact({
    key: "decisions-supported",
    label: "Governed decisions recorded",
    rawValue: metrics.decidedCount,
    sourceRecordIds: rots.decisions.map((d) => d.id),
    qualifier: "human decisions on recommendations (population: decisions)",
  });

  const validatedOutcomes = countFact({
    key: "validated-outcomes",
    label: "Outcomes validated",
    rawValue: metrics.resolvedEventCount,
    sourceRecordIds: [],
    qualifier: "outcomes with a realised value on record (population: outcomes)",
  });

  const outstandingValidation = countFact({
    key: "outstanding-validation",
    label: "Outcomes awaiting validation",
    rawValue: metrics.pendingOutcomeCount,
    sourceRecordIds: [],
    qualifier: "accepted actions, outcome not yet validated (population: outcomes)",
  });

  // Each recommendation row shows its TRUE governed-funnel stage, derived from
  // the recommendation status joined to its governed decision — never a
  // hardcoded blanket "outcome pending".
  const outstandingRows: OutstandingOutcomeRowView[] = rots.recommendations.map((r) => {
    const decision = rots.decisions.find((d) => d.recommendationId === r.id) ?? null;
    let stage: OutstandingOutcomeRowView["stage"];
    let statusLabel: string;
    switch (r.status) {
      case "open":
      case "decided":
        stage = "awaiting_decision";
        statusLabel = "Awaiting a governed decision";
        break;
      case "actioned":
        stage = "accepted_outcome_pending";
        statusLabel = "Accepted — outcome pending validation";
        break;
      case "closed":
      default:
        if (decision && decision.decision === "rejected") {
          stage = "rejected_closed";
          statusLabel = "Rejected — closed, no outcome expected";
        } else {
          stage = "closed";
          statusLabel = "Closed";
        }
        break;
    }
    return {
      id: r.id,
      assetTag: null,
      description: r.title,
      projectedDisplay: formatUsd(r.projectedValueEnabledUsd),
      status: r.status,
      stage,
      statusLabel,
    };
  });

  const recommendationCount = rots.recommendations.length;
  const projectedContributingCount = rots.recommendations.filter(
    (r) => r.status === "open" || r.status === "actioned",
  ).length;
  const openCount = rots.recommendations.filter(
    (r) => r.status === "open" || r.status === "decided",
  ).length;
  const outcomeCount = metrics.pendingOutcomeCount + metrics.resolvedEventCount;

  const sourceProvenance: SourceProvenanceRowView[] = [
    {
      key: "portfolio-value",
      label: "Portfolio value at stake, projected value & realised value",
      provenanceIdentity: PORTFOLIO_PROVENANCE,
      recordCount: rots.recommendations.length,
    },
    {
      key: "decision-counts",
      label: "Governed decision & outcome counts",
      provenanceIdentity: PORTFOLIO_PROVENANCE,
      recordCount: rots.decisions.length,
    },
    {
      key: "k201-projection",
      label: "K-201 projected value enabled",
      provenanceIdentity: PORT_PROVENANCE,
      recordCount: k201Projected.sourceRecordIds.length,
    },
  ];

  return {
    decisionExposure,
    valueAtStake,
    k201Projected,
    portfolioProjected,
    realised,
    decisionsSupported,
    validatedOutcomes,
    outstandingValidation,
    outstandingRows,
    recommendationCount,
    projectedContributingCount,
    recommendationScopeNote:
      `${recommendationCount} AI recommendations. Projected value is ` +
      `conditional and reflects only the ${projectedContributingCount} open or ` +
      `actioned recommendations; a rejected or closed recommendation ` +
      `contributes $0. A recommendation's status is distinct from a governed ` +
      `decision and from outcome validation.`,
    throughputScopeNote:
      `Three separate populations — not expected to equal the ` +
      `${recommendationCount} recommendations above: ${metrics.decidedCount} ` +
      `recommendations received a governed human decision ` +
      `(${openCount} remain open); of those, ${metrics.acceptedCount} were ` +
      `accepted and ${metrics.rejectedCount} rejected; the accepted actions ` +
      `have ${outcomeCount} operational outcomes ` +
      `(${metrics.pendingOutcomeCount} awaiting validation, ` +
      `${metrics.resolvedEventCount} validated).`,
    sourceProvenance,
    realisedNotice:
      "Not yet available — no validated operational outcome exists. Realised " +
      "value is recognised only once an outcome is confirmed, and is never " +
      "shown as zero before then.",
    conditionalNotice:
      "Projected values are conditional: they represent value that would be " +
      "protected if the recommended intervention is executed, not value already " +
      "captured.",
    scopeNotice:
      "This workspace excludes AI token economics and Return-on-Token-Spend " +
      "ratios, which are governed in the AI Control Tower.",
    evidenceLineage: buildLineage(decisionExposure),
  };
}

function buildLineage(exposure: GovernedMetricView): EvidenceLineageRowView[] {
  if (!exposure.available) return [];
  return [
    {
      key: exposure.key,
      label: "Decision exposure",
      provenance: exposure.provenance,
      trustLabel: exposure.trustLabel,
      formulaVersion: exposure.formulaVersion,
      sourceMode: exposure.sourceMode,
      evidenceIds: exposure.evidenceIds,
      asOf: exposure.asOf,
    },
  ];
}
