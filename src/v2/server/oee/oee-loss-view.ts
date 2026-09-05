import "server-only";

import { LINE } from "@/data/constants";
import type { PersonaId } from "@/personas/types";
import type {
  CalculationSubject,
  LedgerScope,
} from "@/v2/domain/calculations/subject";
import { executeRecompute } from "@/v2/domain/calculations/execute";
import { createLedger } from "@/v2/domain/calculations/ledger";
import { isAvailable, type ValueEnvelope } from "@/v2/domain/envelope";
import type { RecomputeRequest } from "@/v2/domain/recompute";
import { getEngineAdapter } from "@/v2/server/calculations";
import {
  ASSESSMENT_AS_OF,
  K201_TAG,
} from "@/v2/server/reliability/asset-reliability-view";
import {
  formatPercent,
  freshnessLabel,
  trustLabel,
  UNAVAILABLE_DISPLAY,
  type EvidenceLineageRowView,
  type GovernedMetricView,
} from "@/v2/reliability/view-types";
import type {
  LossSegmentView,
  LossVisualizationView,
  OeeLossView,
} from "@/v2/oee/view-types";

/**
 * September 9 OEE & Loss Intelligence experience — the HDS-2 OEE READ MODEL
 * (server-only).
 *
 * This model recomputes NOTHING. It runs the SAME governed `oee_reconciliation`
 * ledger the reliability Asset 360 consumes, at the SAME assessment instant
 * (06:00Z), and reads the resulting `ValueEnvelope`s verbatim: OEE 91.2%,
 * availability 97.9%, performance 93.9%, quality 99.1%, and the three loss-unit
 * magnitudes (availability 14,123.33 / performance 40,804.67 / quality 5,529
 * production units) that the reliability view does not surface.
 *
 * The proportional loss split is only constructed because the OEE loss tree
 * proves the three losses share ONE unit (production units) and are ADDITIVE
 * components of a single total (`totalLossUnits = availabilityLossUnits +
 * performanceLossUnits + qualityLossUnits`, see `src/engines/oee.ts`). The
 * `ratio` is each magnitude's share of that additive total; the exact governed
 * magnitude is always carried alongside and never hidden behind the proportion.
 */

const LINE_SUBJECT: CalculationSubject = { kind: "production_line", lineId: LINE.id };
const LINE_SCOPE: LedgerScope = { kind: "production_line", lineId: LINE.id };

const port = getEngineAdapter();

/** Present fractional loss magnitudes without losing precision in display. */
const UNITS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatUnits(value: number | null): string {
  return value === null || !Number.isFinite(value) ? UNAVAILABLE_DISPLAY : UNITS.format(value);
}

/** Run the governed OEE reconciliation and return its fields as an envelope map. */
function oeeEnvelopes(): Map<string, ValueEnvelope<number>> {
  const request: RecomputeRequest = {
    kind: "oee_reconciliation",
    assetId: "asset-k201",
    requestedByEventId: "read-model",
    requestedByEventType: "ProductionObservationIngested",
    asOf: ASSESSMENT_AS_OF,
  };
  const result = executeRecompute(createLedger(LINE_SCOPE), request, LINE_SUBJECT, port);
  const map = new Map<string, ValueEnvelope<number>>();
  if (result.outcome !== "accepted") return map;
  const output = result.record.output;
  if (output.outcome === "failed") return map;
  for (const field of output.fields) map.set(field.name, field.envelope);
  return map;
}

function percentMetric(
  key: string,
  label: string,
  envelope: ValueEnvelope<number> | undefined,
): GovernedMetricView {
  if (!envelope) {
    return {
      key,
      label,
      available: false,
      display: UNAVAILABLE_DISPLAY,
      rawValue: null,
      freshness: "missing",
      freshnessLabel: freshnessLabel("missing"),
      trust: "unknown",
      trustLabel: trustLabel("unknown"),
      provenance: "deterministic",
      sourceMode: "local",
      formulaVersion: "n/a",
      asOf: ASSESSMENT_AS_OF,
      evidenceIds: [],
      unavailableReason: "calculation_not_produced",
    };
  }
  const available = isAvailable(envelope);
  const rawValue = available ? envelope.value : null;
  return {
    key,
    label,
    available,
    display: available ? formatPercent(rawValue) : UNAVAILABLE_DISPLAY,
    rawValue,
    freshness: envelope.freshness,
    freshnessLabel: freshnessLabel(envelope.freshness),
    trust: envelope.trustClassification,
    trustLabel: trustLabel(envelope.trustClassification),
    provenance: envelope.provenance,
    sourceMode: envelope.sourceMode,
    formulaVersion: envelope.formulaVersion,
    asOf: envelope.asOf,
    evidenceIds: envelope.evidenceIds,
    unavailableReason: available ? null : envelope.unavailableReason,
  };
}

function unitsMetric(
  key: string,
  label: string,
  envelope: ValueEnvelope<number> | undefined,
): GovernedMetricView {
  const base = percentMetric(key, label, envelope);
  const available = base.available && base.rawValue !== null;
  return {
    ...base,
    display: available ? formatUnits(base.rawValue) : UNAVAILABLE_DISPLAY,
  };
}

/** Build the complete HDS-2 OEE & Loss Intelligence workspace view. */
export function getOeeLossView(_viewerId: PersonaId): OeeLossView {
  const map = oeeEnvelopes();

  const oee = percentMetric("oee", "Overall equipment effectiveness", map.get("oee"));
  const components: GovernedMetricView[] = [
    percentMetric("availability", "Availability", map.get("availability")),
    percentMetric("performance", "Performance", map.get("performance")),
    percentMetric("quality", "Quality", map.get("quality")),
  ];

  const availLoss = unitsMetric("availabilityLossUnits", "Availability loss", map.get("availabilityLossUnits"));
  const perfLoss = unitsMetric("performanceLossUnits", "Performance loss", map.get("performanceLossUnits"));
  const qualLoss = unitsMetric("qualityLossUnits", "Quality loss", map.get("qualityLossUnits"));

  const rawMagnitudes = [availLoss, perfLoss, qualLoss].map((m) => m.rawValue);
  const allAvailable = rawMagnitudes.every((v) => v !== null && Number.isFinite(v));
  const totalUnits = allAvailable
    ? (rawMagnitudes as number[]).reduce((sum, v) => sum + v, 0)
    : null;

  const ratioFor = (metric: GovernedMetricView): number | null =>
    totalUnits !== null && totalUnits > 0 && metric.rawValue !== null
      ? metric.rawValue / totalUnits
      : null;

  const segment = (
    key: LossSegmentView["key"],
    label: string,
    metric: GovernedMetricView,
  ): LossSegmentView => {
    const ratio = ratioFor(metric);
    return {
      key,
      label,
      metric,
      ratio,
      ratioDisplay: ratio === null ? UNAVAILABLE_DISPLAY : formatPercent(ratio),
    };
  };

  const losses: LossVisualizationView = {
    presentation: totalUnits !== null ? "proportional_split" : "independent_bars",
    rationale:
      "Availability, performance and quality losses share one unit (production " +
      "units) and are additive components of the total loss (total = availability " +
      "+ performance + quality). The split shows each governed magnitude's share " +
      "of that additive total; no share is a recomputed operational value.",
    unitLabel: "production units (bbl)",
    segments: [
      segment("availability", "Availability loss", availLoss),
      segment("performance", "Performance loss", perfLoss),
      segment("quality", "Quality loss", qualLoss),
    ],
    totalUnits,
    totalDisplay: formatUnits(totalUnits),
  };

  const oeeEnvelope = map.get("oee");
  const lineageRows: { metric: GovernedMetricView; label: string }[] = [
    { metric: oee, label: "OEE" },
    { metric: components[0]!, label: "Availability" },
    { metric: components[1]!, label: "Performance" },
    { metric: components[2]!, label: "Quality" },
    { metric: availLoss, label: "Availability loss (units)" },
    { metric: perfLoss, label: "Performance loss (units)" },
    { metric: qualLoss, label: "Quality loss (units)" },
  ];
  const evidenceLineage: EvidenceLineageRowView[] = lineageRows
    .filter((r) => r.metric.available)
    .map((r) => ({
      key: r.metric.key,
      label: r.label,
      provenance: r.metric.provenance,
      trustLabel: r.metric.trustLabel,
      formulaVersion: r.metric.formulaVersion,
      sourceMode: r.metric.sourceMode,
      evidenceIds: r.metric.evidenceIds,
      asOf: r.metric.asOf,
    }));

  return {
    summary: {
      lineId: LINE.id,
      lineLabel: `${LINE.name} · ${LINE.code}`,
      evaluatedAt: oeeEnvelope ? oeeEnvelope.asOf : ASSESSMENT_AS_OF,
    },
    oee,
    components,
    losses,
    assetContext: {
      tag: K201_TAG,
      assetName: "Hydrogen recycle compressor",
      assetHref: `/v2/assets/${K201_TAG}`,
      note:
        "K-201 is the asset under review on this line. This is the governed OEE " +
        "of the HDS-2 line, not a per-asset OEE for K-201.",
    },
    evidenceLineage,
  };
}
