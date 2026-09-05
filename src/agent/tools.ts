import "server-only";
import type { PersonaId, Capability } from "@/personas/types";
import { getPersona, personaCan } from "@/personas/registry";
import { getK201ReliabilityView } from "@/v2/server/reliability/asset-reliability-view";
import { getMaintenanceMaterialsView } from "@/v2/server/materials/maintenance-materials-view";
import { getOeeLossView } from "@/v2/server/oee/oee-loss-view";
import { getTurnaroundControlView } from "@/v2/server/turnaround/turnaround-control-view";
import { getValueRealisationView } from "@/v2/server/value/value-realisation-view";
import type {
  AssetReliabilityView,
  GovernedMetricView,
} from "@/v2/reliability/view-types";
import type { MaintenanceMaterialsView } from "@/v2/materials/view-types";
import type { OeeLossView } from "@/v2/oee/view-types";
import type { TurnaroundControlView } from "@/v2/turnaround/view-types";
import type { SourceFactView, ValueRealisationView } from "@/v2/value/view-types";
import type { Citation } from "./types";

/**
 * The read-only tool allowlist for the K-201 case investigator (server-only).
 *
 * Every tool is a pure READ over an existing governed read model. There is NO
 * write tool, NO mutation tool and NO path to the authority-command seam. Each
 * tool is gated by the viewing persona's capabilities (resolved on the server
 * from the trusted context), so a persona only ever sees evidence it is
 * entitled to. Withheld tools are reported honestly rather than silently
 * dropped, and never fabricated.
 *
 * Tools never invent values: every citation carries a value read verbatim from
 * a governed metric envelope, a governed source fact, or a governed record.
 */

export const AGENT_TOOL_NAMES = [
  "get_asset_condition",
  "get_reliability_assessment",
  "get_material_readiness",
  "get_turnaround_fit",
  "get_oee_and_losses",
  "get_value_context",
  "get_decision_authority",
  "get_lifecycle_projection",
  "get_decision_audit",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export interface ToolRun {
  readonly citations: readonly Citation[];
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface ToolResult {
  readonly toolName: AgentToolName;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly requirementLabel: string;
  readonly citations: readonly Citation[];
  readonly facts: Readonly<Record<string, unknown>>;
}

/**
 * A lazily-memoised bundle of the five governed read models for one viewer.
 * Each read model is evaluated at most once per request, even when several
 * tools draw on it.
 */
export interface ViewBundle {
  reliability(): AssetReliabilityView;
  materials(): MaintenanceMaterialsView;
  oee(): OeeLossView;
  turnaround(): TurnaroundControlView;
  value(): ValueRealisationView;
}

export function makeViewBundle(viewerId: PersonaId): ViewBundle {
  let reliability: AssetReliabilityView | undefined;
  let materials: MaintenanceMaterialsView | undefined;
  let oee: OeeLossView | undefined;
  let turnaround: TurnaroundControlView | undefined;
  let value: ValueRealisationView | undefined;
  return {
    reliability: () => (reliability ??= getK201ReliabilityView(viewerId)),
    materials: () => (materials ??= getMaintenanceMaterialsView(viewerId)),
    oee: () => (oee ??= getOeeLossView(viewerId)),
    turnaround: () => (turnaround ??= getTurnaroundControlView(viewerId)),
    value: () => (value ??= getValueRealisationView(viewerId)),
  };
}

// ---------------------------------------------------------------------------
// Citation builders — never fabricate a value.
// ---------------------------------------------------------------------------

function metricCitation(toolName: AgentToolName, m: GovernedMetricView): Citation {
  return {
    id: `${toolName}:${m.key}`,
    label: m.label,
    value: m.display,
    provenance: m.provenance,
    sourceType: "governed_metric",
    sourceId: m.evidenceIds[0] ?? null,
    observedAt: m.asOf,
    toolName,
  };
}

function factCitation(toolName: AgentToolName, f: SourceFactView): Citation {
  return {
    id: `${toolName}:${f.key}`,
    label: f.label,
    value: f.display,
    provenance: "source_record",
    sourceType: "source_fact",
    sourceId: f.sourceRecordIds[0] ?? null,
    observedAt: f.recordAsOf,
    toolName,
  };
}

// ---------------------------------------------------------------------------
// Capability gates
// ---------------------------------------------------------------------------

function canAny(id: PersonaId, caps: readonly Capability[]): boolean {
  return caps.some((c) => personaCan(id, c));
}

interface AgentTool {
  readonly name: AgentToolName;
  readonly requirementLabel: string;
  readonly requires: (id: PersonaId) => boolean;
  readonly run: (views: ViewBundle) => ToolRun;
}

const CONDITION_CAP: Capability = "view_asset_condition";

const TOOLS: Record<AgentToolName, AgentTool> = {
  get_asset_condition: {
    name: "get_asset_condition",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const { signal } = views.reliability();
      const citations: Citation[] = signal.sensors.map((s) => ({
        id: `get_asset_condition:${s.key}`,
        label: `${s.label} (latest)`,
        value: s.latestDisplay,
        provenance: "measured",
        sourceType: "sensor_reading",
        sourceId: null,
        observedAt: s.latestAt,
        toolName: "get_asset_condition",
      }));
      return {
        citations,
        facts: {
          headline: signal.headline,
          detail: signal.detail,
          sensors: signal.sensors.map((s) => ({
            key: s.key,
            label: s.label,
            latest: s.latestDisplay,
            warningThreshold: s.warningThreshold,
            criticalThreshold: s.criticalThreshold,
            observedAt: s.latestAt,
          })),
          conditionEvents: signal.conditionEvents,
        },
      };
    },
  },

  get_reliability_assessment: {
    name: "get_reliability_assessment",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const v = views.reliability();
      const citations = v.assessmentMetrics.map((m) =>
        metricCitation("get_reliability_assessment", m),
      );
      const ctx = v.assessmentContext;
      citations.push({
        id: "get_reliability_assessment:confidence",
        label: ctx.label,
        value: ctx.display,
        provenance: "statistical",
        sourceType: "assessment_context",
        sourceId: null,
        observedAt: v.evaluatedAt,
        toolName: "get_reliability_assessment",
      });
      return {
        citations,
        facts: {
          evaluatedAt: v.evaluatedAt,
          metrics: v.assessmentMetrics.map((m) => ({
            key: m.key,
            label: m.label,
            display: m.display,
            available: m.available,
          })),
          confidence: { label: ctx.label, display: ctx.display, note: ctx.note },
        },
      };
    },
  },

  get_material_readiness: {
    name: "get_material_readiness",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const m = views.materials();
      const citations: Citation[] = [];
      for (const wo of m.workOrders) {
        citations.push({
          id: `get_material_readiness:${wo.workOrderId}:readiness`,
          label: `${wo.workOrderNumber} materials readiness`,
          value: wo.materialsDisplay,
          provenance: "business_rule",
          sourceType: "work_order_readiness",
          sourceId: wo.workOrderId,
          observedAt: wo.evaluatedAt,
          toolName: "get_material_readiness",
        });
        citations.push(metricCitation("get_material_readiness", wo.bridge.shortage));
        citations.push(metricCitation("get_material_readiness", wo.bridge.buffer));
      }
      return {
        citations,
        facts: {
          blockedCount: m.summary.blockedCount,
          workOrderCount: m.summary.workOrderCount,
          workOrders: m.workOrders.map((wo) => ({
            id: wo.workOrderId,
            number: wo.workOrderNumber,
            title: wo.title,
            readinessKind: wo.readinessKind,
            materials: wo.materialsDisplay,
            inventory: wo.inventoryDisplay,
            required: wo.requiredDisplay,
            available: wo.availableDisplay,
            shortage: wo.shortageDisplay,
            buffer: wo.bufferDisplay,
          })),
        },
      };
    },
  },

  get_turnaround_fit: {
    name: "get_turnaround_fit",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const t = views.turnaround();
      const citations: Citation[] = t.turnaround.metrics.map((m) =>
        metricCitation("get_turnaround_fit", m),
      );
      for (const marker of t.horizon.markers) {
        citations.push({
          id: `get_turnaround_fit:horizon:${marker.key}`,
          label: marker.label,
          value: marker.display,
          provenance: "business_rule",
          sourceType: "operational_horizon",
          sourceId: null,
          observedAt: t.horizon.anchoredAt,
          toolName: "get_turnaround_fit",
        });
      }
      return {
        citations,
        facts: {
          fit: t.summary.fitDisplay,
          maxLead: t.summary.maxLeadDisplay,
          daysUntilTurnaround: t.summary.daysUntilDisplay,
          slack: t.summary.slackDisplay,
          availableDate: t.summary.availableDate,
          safeToWaitWarning: t.safeToWaitWarning,
          workOrders: t.workOrders.map((wo) => ({
            id: wo.workOrderId,
            number: wo.workOrderNumber,
            timing: wo.timing,
            timingLabel: wo.timingLabel,
            readinessKind: wo.readinessKind,
          })),
          horizon: t.horizon.markers.map((h) => ({
            key: h.key,
            label: h.label,
            display: h.display,
            absoluteDate: h.absoluteDate,
          })),
          comparison: t.horizon.comparisonMessage,
        },
      };
    },
  },

  get_oee_and_losses: {
    name: "get_oee_and_losses",
    requirementLabel: "Requires plant-performance or OEE visibility.",
    requires: (id) => canAny(id, ["view_plant_performance", "view_oee_impact"]),
    run: (views) => {
      const o = views.oee();
      const citations: Citation[] = [metricCitation("get_oee_and_losses", o.oee)];
      for (const c of o.components) citations.push(metricCitation("get_oee_and_losses", c));
      for (const seg of o.losses.segments) {
        citations.push(metricCitation("get_oee_and_losses", seg.metric));
      }
      return {
        citations,
        facts: {
          line: o.summary.lineLabel,
          evaluatedAt: o.summary.evaluatedAt,
          oee: o.oee.display,
          components: o.components.map((c) => ({ label: c.label, display: c.display })),
          losses: {
            unit: o.losses.unitLabel,
            total: o.losses.totalDisplay,
            segments: o.losses.segments.map((s) => ({
              label: s.label,
              magnitude: s.metric.display,
              share: s.ratioDisplay,
            })),
            rationale: o.losses.rationale,
          },
          assetContextNote: o.assetContext.note,
        },
      };
    },
  },

  get_value_context: {
    name: "get_value_context",
    requirementLabel: "Requires value-realisation visibility.",
    requires: (id) => personaCan(id, "view_value_realisation"),
    run: (views) => {
      const val = views.value();
      const citations: Citation[] = [
        metricCitation("get_value_context", val.decisionExposure),
        factCitation("get_value_context", val.valueAtStake),
        factCitation("get_value_context", val.k201Projected),
        factCitation("get_value_context", val.portfolioProjected),
        factCitation("get_value_context", val.realised),
      ];
      return {
        citations,
        facts: {
          decisionExposure: val.decisionExposure.display,
          portfolioValueAtStake: val.valueAtStake.display,
          k201Projected: val.k201Projected.display,
          portfolioProjected: val.portfolioProjected.display,
          realised: val.realised.display,
          realisedNotice: val.realisedNotice,
          scopeNotice: val.scopeNotice,
        },
      };
    },
  },

  get_decision_authority: {
    name: "get_decision_authority",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const a = views.reliability().authority;
      const citations: Citation[] = [
        {
          id: "get_decision_authority:status",
          label: "Governed decision status",
          value: a.decisionStatusLabel,
          provenance: "business_rule",
          sourceType: "authority",
          sourceId: null,
          observedAt: null,
          toolName: "get_decision_authority",
        },
        {
          id: "get_decision_authority:next_act",
          label: "Next governed act",
          value: `${a.nextActLabel} — ${a.nextActPersonaName}`,
          provenance: "business_rule",
          sourceType: "authority",
          sourceId: null,
          observedAt: null,
          toolName: "get_decision_authority",
        },
        {
          id: "get_decision_authority:endorsement",
          label: "Endorsement requirement",
          value: a.endorsementBanner,
          provenance: "business_rule",
          sourceType: "authority",
          sourceId: null,
          observedAt: null,
          toolName: "get_decision_authority",
        },
      ];
      return {
        citations,
        facts: {
          decisionStatusLabel: a.decisionStatusLabel,
          nextActLabel: a.nextActLabel,
          nextActPersonaName: a.nextActPersonaName,
          endorsementRequired: a.endorsementRequired,
          endorsementRequirement: a.endorsementRequirement,
          endorsementBanner: a.endorsementBanner,
          viewerCanActOnNext: a.viewer.canActOnNext,
          viewerReason: a.viewer.reason,
          readOnlyNotice: a.readOnlyNotice,
        },
      };
    },
  },

  get_lifecycle_projection: {
    name: "get_lifecycle_projection",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const entries = views.reliability().lifecycleProjection;
      const citations: Citation[] = entries.map((e) => ({
        id: `get_lifecycle_projection:${e.eventId}`,
        label: `Projected: ${e.typeLabel}`,
        value: e.summary,
        provenance: "deterministic",
        sourceType: "lifecycle_projection",
        sourceId: e.eventId,
        observedAt: e.asOf,
        toolName: "get_lifecycle_projection",
      }));
      return {
        citations,
        facts: {
          note: "Derived lifecycle projection — a deterministic forward projection, NOT a record of decisions that have occurred.",
          entries: entries.map((e) => ({
            sequence: e.sequence,
            type: e.typeLabel,
            actor: e.actorLabel,
            asOf: e.asOf,
            summary: e.summary,
            resultingPhase: e.resultingPhaseLabel,
          })),
        },
      };
    },
  },

  get_decision_audit: {
    name: "get_decision_audit",
    requirementLabel: "Requires asset-condition visibility.",
    requires: (id) => personaCan(id, CONDITION_CAP),
    run: (views) => {
      const audit = views.reliability().decisionAudit;
      const recorded = audit.entries.length > 0;
      const citations: Citation[] = [
        {
          id: "get_decision_audit:status",
          label: "Governed human-decision record",
          value: recorded
            ? `${audit.entries.length} recorded decision${audit.entries.length === 1 ? "" : "s"}`
            : audit.emptyTitle,
          provenance: "human",
          sourceType: "decision_audit",
          sourceId: null,
          observedAt: null,
          toolName: "get_decision_audit",
        },
      ];
      return {
        citations,
        facts: {
          recorded,
          emptyTitle: audit.emptyTitle,
          emptyDescription: audit.emptyDescription,
          nextGovernedAction: audit.nextGovernedAction,
          entries: audit.entries.map((e) => ({
            action: e.action,
            actor: e.actorLabel,
            at: e.at,
            summary: e.summary,
          })),
        },
      };
    },
  },
};

/** Run one tool for a viewer, honouring its capability gate. */
export function runAgentTool(
  toolName: AgentToolName,
  viewerId: PersonaId,
  views: ViewBundle,
): ToolResult {
  const tool = TOOLS[toolName];
  if (!tool.requires(viewerId)) {
    const persona = getPersona(viewerId);
    return {
      toolName,
      available: false,
      unavailableReason: `${persona.displayName} is not entitled to this evidence. ${tool.requirementLabel}`,
      requirementLabel: tool.requirementLabel,
      citations: [],
      facts: {},
    };
  }
  const { citations, facts } = tool.run(views);
  return {
    toolName,
    available: true,
    unavailableReason: null,
    requirementLabel: tool.requirementLabel,
    citations,
    facts,
  };
}

/** Run an ordered set of tools, sharing one memoised view bundle. */
export function runAgentTools(
  toolNames: readonly AgentToolName[],
  viewerId: PersonaId,
): ToolResult[] {
  return runAgentToolsWith(makeViewBundle(viewerId), toolNames, viewerId);
}

/** Run an ordered set of tools against an existing (shared) view bundle. */
export function runAgentToolsWith(
  views: ViewBundle,
  toolNames: readonly AgentToolName[],
  viewerId: PersonaId,
): ToolResult[] {
  const seen = new Set<AgentToolName>();
  const results: ToolResult[] = [];
  for (const name of toolNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    results.push(runAgentTool(name, viewerId, views));
  }
  return results;
}
