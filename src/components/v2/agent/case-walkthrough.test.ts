import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  CaseWalkthrough,
  CASE_STAGES,
  providerStatusLabel,
  stageForClaimKind,
} from "./case-walkthrough";
import { CLAIM_KINDS, type GovernedAgentResponse } from "@/agent/types";

const RAW_ISO = "2026-07-27T06:00:00.000Z";
const FORMATTED = "27 July 2026, 06:00 UTC";

function fixture(
  overrides: Partial<GovernedAgentResponse> = {},
): GovernedAgentResponse {
  const base: GovernedAgentResponse = {
    requestId: "req-1",
    question: "Why does K-201 require action now?",
    questionId: "why_action_now",
    provider: "nvidia",
    providerDisplay: "NVIDIA",
    model: "nvidia/nemotron-3-super-120b-a12b",
    generatedAt: RAW_ISO,
    viewer: { personaId: "reliability_manager", personaName: "Reliability Manager" },
    subject: {
      assetTag: "K-201",
      caseId: "case-k201-hydrogen-recycle",
      assetName: "Hydrogen Recycle Compressor",
    },
    situationSummary: "K-201 is deviating from its normal envelope.",
    claims: [
      { id: "c-condition", kind: "condition", text: "Condition deviating.", citationIds: ["cite-c"] },
      { id: "c-exposure", kind: "value", text: "Decision exposure is $1,620,156.", citationIds: ["cite-e"] },
      { id: "c-assessment", kind: "reliability", text: "Health 52, risk 68.", citationIds: ["cite-r"] },
      { id: "c-oee", kind: "oee", text: "OEE 91.2% is HDS-2 line-level.", citationIds: [] },
      { id: "c-materials", kind: "materials", text: "wo-2 is materials-blocked.", citationIds: [] },
      { id: "c-turnaround", kind: "turnaround", text: "35-day lead, 88 days out, 53-day slack.", citationIds: [] },
      { id: "c-authority", kind: "authority", text: "A governed decision awaits a human.", citationIds: [] },
    ],
    citations: [
      {
        id: "cite-c",
        label: "Condition",
        value: "deviating",
        provenance: "sensor.telemetry",
        sourceType: "source_fact",
        sourceId: "sig-1",
        observedAt: RAW_ISO,
        toolName: "get_asset_condition",
      },
      {
        id: "cite-e",
        label: "Decision exposure",
        value: "$1,620,156",
        provenance: "value-at-stake.v1",
        sourceType: "governed_metric",
        sourceId: null,
        observedAt: RAW_ISO,
        toolName: "get_reliability_assessment",
      },
      {
        id: "cite-r",
        label: "Health",
        value: "52",
        provenance: "reliability.v1",
        sourceType: "governed_metric",
        sourceId: null,
        observedAt: RAW_ISO,
        toolName: "get_reliability_assessment",
      },
    ],
    proposedIntervention: {
      title: "Replace K-201 dry gas seal",
      summary: "Existing governed recommendation.",
      statusLabel: "Accepted · awaiting scheduling",
      isExistingRecommendation: true,
      mutates: false,
    },
    authorityHandoff: {
      decisionStatusLabel: "Governed decision · accepted",
      nextActLabel: "View authority requirements",
      nextActPersonaName: "Maintenance Planner",
      endorsementRequired: true,
      endorsementNote: "Reliability Manager endorsement required.",
      routeLabel: "View authority requirements",
      readOnlyNotice: "This investigator never approves, endorses or schedules.",
    },
    calculationReferences: [{ name: "value-at-stake", formulaVersion: "v1" }],
    timestamps: {
      assessmentAsOf: RAW_ISO,
      materialsAsOf: "2026-07-27T12:00:00.000Z",
      turnaroundAsOf: "2026-07-27T12:00:00.000Z",
    },
    freshnessLabels: [],
    trustLabels: [],
    uncertainties: ["Realised value is not yet validated."],
    missingEvidence: ["Portfolio value context — withheld for this persona."],
    prohibitedActions: ["Approve, endorse, reject or validate any governed decision"],
    toolsExecuted: ["get_asset_condition", "get_reliability_assessment"],
    toolsWithheld: [
      { toolName: "get_value_context", reason: "Not entitled to this evidence." },
    ],
    generationStatus: "deterministic",
    deterministicFallback: true,
  };
  return { ...base, ...overrides };
}

function render(response: GovernedAgentResponse): string {
  return renderToStaticMarkup(createElement(CaseWalkthrough, { response }));
}

describe("providerStatusLabel — exact governed status strings", () => {
  it("labels a provider-grounded answer as a live NVIDIA narrative", () => {
    expect(providerStatusLabel("provider_grounded")).toBe(
      "Live NVIDIA narrative · governed and citation-validated",
    );
  });

  it("labels a deterministic answer as a governed deterministic narrative", () => {
    expect(providerStatusLabel("deterministic")).toBe(
      "Governed deterministic narrative",
    );
  });

  it("labels a rejected provider answer as a governed fallback, not a failure", () => {
    const label = providerStatusLabel("provider_rejected_fallback");
    expect(label).toBe("Governed fallback · live provider response was not used");
    expect(label.toLowerCase()).not.toContain("error");
    expect(label.toLowerCase()).not.toContain("failed");
  });
});

describe("stageForClaimKind — every claim kind maps to exactly one thread stage", () => {
  it("assigns each of the ten governed claim kinds a valid stage", () => {
    const stageIds = new Set(CASE_STAGES.map((s) => s.id));
    for (const kind of CLAIM_KINDS) {
      expect(stageIds.has(stageForClaimKind(kind))).toBe(true);
    }
  });

  it("orders the thread Signal → Evidence → Risk → Recommendation → Human authority", () => {
    expect(CASE_STAGES.map((s) => s.label)).toEqual([
      "Signal",
      "Evidence",
      "Risk",
      "Recommendation",
      "Human authority",
    ]);
  });
});

describe("CaseWalkthrough — governed five-stage rendering", () => {
  it("renders all five stage labels for the primary question", () => {
    const html = render(fixture());
    for (const stage of CASE_STAGES) {
      expect(html).toContain(stage.label);
    }
  });

  it("places each governed claim exactly once (no duplication across stages)", () => {
    const html = render(fixture());
    const occurrences = html.split("Decision exposure is $1,620,156.").length - 1;
    expect(occurrences).toBe(1);
  });

  it("shows the governed status label and a read-only assurance", () => {
    const html = render(fixture());
    expect(html).toContain("Governed deterministic narrative");
    expect(html).toContain("Read-only");
  });

  it("renders the live-provider label when the answer is provider-grounded", () => {
    const html = render(fixture({ generationStatus: "provider_grounded" }));
    expect(html).toContain("Live NVIDIA narrative · governed and citation-validated");
  });

  it("restates the existing recommendation and never exposes an action control", () => {
    const html = render(fixture());
    expect(html).toContain("restated, unmodified");
    // The walkthrough is pure read-only presentation: no interactive control
    // (button/input/form/select) through which a decision could be actioned.
    expect(html).not.toMatch(/<button/i);
    expect(html).not.toMatch(/<input/i);
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/<select/i);
  });

  it("routes to human authority with a read-only notice", () => {
    const html = render(fixture());
    expect(html).toContain("Human authority");
    expect(html).toContain("Maintenance Planner");
    expect(html).toContain("never approves");
  });

  it("renders governed timestamps formatted, never as raw ISO", () => {
    const html = render(fixture());
    expect(html).toContain(FORMATTED);
    expect(html).not.toContain(RAW_ISO);
  });

  it("renders cited sources inside the Evidence stage", () => {
    const html = render(fixture());
    expect(html).toContain("Cited sources");
    expect(html).toContain("$1,620,156");
  });

  it("renders the executive decision strip from cited governed values without recomputing them", () => {
    const response = fixture({
      citations: [
        ...fixture().citations,
        {
          id: "cite-ttc",
          label: "Projected days to critical",
          value: "≈17.93 days",
          provenance: "reliability.v1",
          sourceType: "governed_metric",
          sourceId: null,
          observedAt: RAW_ISO,
          toolName: "get_reliability_assessment",
        },
        {
          id: "cite-lead",
          label: "Spare lead time",
          value: "35 days",
          provenance: "business_rule",
          sourceType: "operational_horizon",
          sourceId: null,
          observedAt: "2026-07-27T12:00:00.000Z",
          toolName: "get_turnaround_fit",
        },
        {
          id: "cite-turnaround",
          label: "Days until turnaround",
          value: "88 days",
          provenance: "business_rule",
          sourceType: "operational_horizon",
          sourceId: null,
          observedAt: "2026-07-27T12:00:00.000Z",
          toolName: "get_turnaround_fit",
        },
      ],
    });
    const html = render(response);
    expect(html).toContain("Executive decision view");
    expect(html).toContain("≈17.93 days to critical");
    expect(html).toContain("35 days spare lead time");
    expect(html).toContain("88 days turnaround window");
    expect(html).toContain("Decision exposure");
    expect(html).not.toContain("17.93 - 35");
  });

  it("keeps complete evidence behind progressive disclosure", () => {
    const html = render(fixture());
    expect(html).toContain("View all evidence used");
    expect(html).toContain("<details");
  });

  it("omits a stage with no governed content instead of rendering it empty", () => {
    const html = render(
      fixture({
        claims: [
          { id: "c-condition", kind: "condition", text: "Condition deviating.", citationIds: [] },
        ],
        citations: [],
        proposedIntervention: null,
        authorityHandoff: null,
      }),
    );
    expect(html).toContain("Signal");
    expect(html).not.toContain("Human authority");
  });
});
