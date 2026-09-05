import { describe, it, expect } from "vitest";
import { makeViewBundle, runAgentToolsWith } from "./tools";
import { toolPlanFor } from "./plan";
import { buildDeterministicResponse } from "./deterministic";
import { governedAgentResponseSchema, AGENT_QUESTION_IDS, AGENT_QUESTIONS } from "./types";
import type { PersonaId } from "@/personas/types";

function build(viewerId: PersonaId) {
  const views = makeViewBundle(viewerId);
  const toolResults = runAgentToolsWith(views, toolPlanFor("why_action_now"), viewerId);
  return buildDeterministicResponse({
    viewerId,
    requestId: `req-${viewerId}`,
    questionId: "why_action_now",
    question: "Why does K-201 require action now?",
    toolResults,
    views,
    generatedAt: "2026-09-10T06:00:00.000Z",
  });
}

describe("deterministic K-201 governed answer (plant_manager — full story)", () => {
  const r = build("plant_manager");

  it("is a schema-valid, deterministic, mock-tagged response about K-201", () => {
    expect(governedAgentResponseSchema.safeParse(r).success).toBe(true);
    expect(r.provider).toBe("mock");
    expect(r.providerDisplay).toBe("Deterministic fallback");
    expect(r.generationStatus).toBe("deterministic");
    expect(r.subject.assetTag).toBe("K-201");
    expect(r.viewer.personaId).toBe("plant_manager");
  });

  it("every claim is grounded — its citationIds all exist in the citation set", () => {
    const ids = new Set(r.citations.map((c) => c.id));
    for (const claim of r.claims) {
      expect(claim.citationIds.length).toBeGreaterThan(0);
      for (const id of claim.citationIds) expect(ids.has(id)).toBe(true);
    }
  });

  it("states decision exposure $1,620,156 grounded in the reliability assessment", () => {
    const exposure = r.claims.find((c) => c.id === "c-exposure");
    expect(exposure?.text).toContain("$1,620,156");
    expect(exposure?.citationIds).toContain("get_reliability_assessment:exposure");
  });

  it("routes to the accountable human with a read-only, non-actionable label", () => {
    expect(r.authorityHandoff?.routeLabel).toBe("View authority requirements");
    expect(r.authorityHandoff?.nextActPersonaName).toBe("Reliability Manager");
    expect(r.authorityHandoff?.endorsementRequired).toBe(true);
  });

  it("restates the EXISTING recommendation and never mutates", () => {
    expect(r.proposedIntervention?.isExistingRecommendation).toBe(true);
    expect(r.proposedIntervention?.mutates).toBe(false);
  });

  it("carries calculation provenance including value-at-stake.v1 (not a business label)", () => {
    const ref = r.calculationReferences.find((c) => c.name === "Decision exposure");
    expect(ref?.formulaVersion).toBe("value-at-stake.v1");
  });

  it("presents assessment and readiness timestamps independently (06:00 vs 12:00 UTC)", () => {
    expect(r.timestamps.assessmentAsOf).toMatch(/T06:00:00\.000Z$/);
    expect(r.timestamps.materialsAsOf).toMatch(/T12:00:00\.000Z$/);
    expect(r.timestamps.turnaroundAsOf).toMatch(/T12:00:00\.000Z$/);
  });

  it("declares the permanent read-only prohibitions", () => {
    expect(r.prohibitedActions.length).toBeGreaterThanOrEqual(5);
  });
});

describe("deterministic answer is persona-scoped (reliability_manager — value withheld)", () => {
  const r = build("reliability_manager");

  it("withholds portfolio value context and reports it honestly", () => {
    expect(r.toolsWithheld.some((t) => t.toolName === "get_value_context")).toBe(true);
    expect(r.missingEvidence.some((m) => m.includes("Portfolio value context"))).toBe(true);
  });

  it("never leaks the withheld portfolio value-at-stake figure into any citation", () => {
    expect(r.citations.some((c) => c.value.includes("2,304,156"))).toBe(false);
  });

  it("still surfaces reliability-scoped decision exposure $1,620,156", () => {
    const exposure = r.claims.find((c) => c.id === "c-exposure");
    expect(exposure?.text).toContain("$1,620,156");
  });

  it("remains schema-valid and grounded despite the withheld tool", () => {
    expect(governedAgentResponseSchema.safeParse(r).success).toBe(true);
    const ids = new Set(r.citations.map((c) => c.id));
    for (const claim of r.claims) {
      for (const id of claim.citationIds) expect(ids.has(id)).toBe(true);
    }
  });
});

function buildFor(viewerId: PersonaId, questionId: (typeof AGENT_QUESTION_IDS)[number]) {
  const views = makeViewBundle(viewerId);
  const toolResults = runAgentToolsWith(views, toolPlanFor(questionId), viewerId);
  const prompt = AGENT_QUESTIONS.find((q) => q.id === questionId)!.prompt;
  return buildDeterministicResponse({
    viewerId,
    requestId: `req-${viewerId}-${questionId}`,
    questionId,
    question: prompt,
    toolResults,
    views,
    generatedAt: "2026-09-10T06:00:00.000Z",
  });
}

describe("every governed question runs the real plan→tools→answer path", () => {
  for (const questionId of AGENT_QUESTION_IDS) {
    describe(`question: ${questionId}`, () => {
      const r = buildFor("plant_manager", questionId);

      it("returns a schema-valid, read-only K-201 answer for its own question id", () => {
        expect(governedAgentResponseSchema.safeParse(r).success).toBe(true);
        expect(r.subject.assetTag).toBe("K-201");
        expect(r.questionId).toBe(questionId);
        expect(r.generationStatus).toBe("deterministic");
      });

      it("dispatched exactly the deterministic plan for this question", () => {
        const planned = toolPlanFor(questionId);
        const dispatched = r.toolsExecuted;
        // Every planned tool that was not persona-withheld appears, in order.
        const withheld = new Set(r.toolsWithheld.map((t) => t.toolName));
        expect(dispatched).toEqual(planned.filter((t) => !withheld.has(t)));
      });

      it("is fully grounded — every claim's citations resolve", () => {
        expect(r.citations.length).toBeGreaterThan(0);
        const ids = new Set(r.citations.map((c) => c.id));
        for (const claim of r.claims) {
          expect(claim.citationIds.length).toBeGreaterThan(0);
          for (const id of claim.citationIds) expect(ids.has(id)).toBe(true);
        }
      });

      it("routes to accountable human authority and mutates nothing", () => {
        expect(r.authorityHandoff?.endorsementRequired).toBe(true);
        expect(r.proposedIntervention?.mutates).toBe(false);
        expect(r.proposedIntervention?.isExistingRecommendation).toBe(true);
        expect(r.prohibitedActions.length).toBeGreaterThanOrEqual(5);
      });
    });
  }
});
