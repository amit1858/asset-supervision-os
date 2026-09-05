import { describe, it, expect } from "vitest";
import { makeViewBundle, runAgentTool, runAgentToolsWith } from "./tools";
import { toolPlanFor } from "./plan";

describe("agent read-only tools — persona capability gates", () => {
  it("permits value context only for a value-realisation persona", () => {
    const pm = runAgentTool("get_value_context", "plant_manager", makeViewBundle("plant_manager"));
    expect(pm.available).toBe(true);
    expect(pm.citations.length).toBeGreaterThan(0);

    const rm = runAgentTool(
      "get_value_context",
      "reliability_manager",
      makeViewBundle("reliability_manager"),
    );
    expect(rm.available).toBe(false);
    expect(rm.citations).toEqual([]);
    expect(rm.unavailableReason ?? "").toContain("value-realisation");
  });

  it("withholds asset-condition tools from a persona lacking that capability", () => {
    const aiAdmin = runAgentTool(
      "get_asset_condition",
      "ai_admin",
      makeViewBundle("ai_admin"),
    );
    expect(aiAdmin.available).toBe(false);
    expect(aiAdmin.citations).toEqual([]);
    expect(aiAdmin.unavailableReason ?? "").toContain("asset-condition");
  });

  it("permits condition + assessment for the reliability manager", () => {
    const views = makeViewBundle("reliability_manager");
    expect(runAgentTool("get_asset_condition", "reliability_manager", views).available).toBe(true);
    expect(
      runAgentTool("get_reliability_assessment", "reliability_manager", views).available,
    ).toBe(true);
  });

  it("de-duplicates a plan and never fabricates a value for a withheld tool", () => {
    const views = makeViewBundle("ai_admin");
    const results = runAgentToolsWith(views, toolPlanFor("why_action_now"), "ai_admin");
    // no duplicate tool executions
    const names = results.map((r) => r.toolName);
    expect(new Set(names).size).toBe(names.length);
    // every withheld tool contributes zero citations
    for (const r of results) {
      if (!r.available) expect(r.citations).toEqual([]);
    }
  });
});

describe("agent tools surface the K-201 goldens verbatim (no recomputation)", () => {
  const views = makeViewBundle("plant_manager");

  it("reliability assessment displays health 52 / risk 68 / exposure $1,620,156", () => {
    const r = runAgentTool("get_reliability_assessment", "plant_manager", views);
    const byId = new Map(r.citations.map((c) => [c.id, c.value]));
    expect(byId.get("get_reliability_assessment:health")).toBe("52");
    expect(byId.get("get_reliability_assessment:risk")).toBe("68");
    expect(byId.get("get_reliability_assessment:exposure")).toBe("$1,620,156");
    expect(byId.get("get_reliability_assessment:ttc")).toBe("≈17.93 days");
    expect(byId.get("get_reliability_assessment:confidence")).toBe("0.605");
  });

  it("OEE displays 91.2% with the fixed loss components", () => {
    const r = runAgentTool("get_oee_and_losses", "plant_manager", views);
    const byId = new Map(r.citations.map((c) => [c.id, c.value]));
    expect(byId.get("get_oee_and_losses:oee")).toBe("91.2%");
    expect(byId.get("get_oee_and_losses:availability")).toBe("97.9%");
    expect(byId.get("get_oee_and_losses:performance")).toBe("93.9%");
    expect(byId.get("get_oee_and_losses:quality")).toBe("99.1%");
    expect(byId.get("get_oee_and_losses:availabilityLossUnits")).toBe("14,123.33");
    expect(byId.get("get_oee_and_losses:performanceLossUnits")).toBe("40,804.67");
    expect(byId.get("get_oee_and_losses:qualityLossUnits")).toBe("5,529");
  });

  it("value context displays the four distinct value concepts", () => {
    const r = runAgentTool("get_value_context", "plant_manager", views);
    const byId = new Map(r.citations.map((c) => [c.id, c.value]));
    expect(byId.get("get_value_context:value-at-stake")).toBe("$2,304,156");
    expect(byId.get("get_value_context:k201-projected")).toBe("$1,094,400");
    expect(byId.get("get_value_context:portfolio-projected")).toBe("$1,449,400");
    expect(byId.get("get_value_context:realised")).toBe("Unavailable");
  });
});

describe("derived lifecycle projection, recorded decision audit and AI telemetry stay distinct", () => {
  const views = makeViewBundle("plant_manager");

  it("lifecycle projection is provenance=deterministic and declares it is NOT a decision record", () => {
    const r = runAgentTool("get_lifecycle_projection", "plant_manager", views);
    expect(r.citations.length).toBeGreaterThan(0);
    for (const c of r.citations) {
      expect(c.provenance).toBe("deterministic");
      expect(c.sourceType).toBe("lifecycle_projection");
    }
    const note = (r.facts as { note?: string }).note ?? "";
    expect(note).toMatch(/NOT a record of decisions/i);
  });

  it("empty decision audit is provenance=human and surfaces the honest 'no decision recorded' title, never a projection", () => {
    const r = runAgentTool("get_decision_audit", "plant_manager", views);
    const status = r.citations.find((c) => c.id === "get_decision_audit:status")!;
    expect(status.provenance).toBe("human");
    expect(status.sourceType).toBe("decision_audit");
    // K-201 has no recorded human decision — the value must be the honest empty title.
    expect((r.facts as { recorded: boolean }).recorded).toBe(false);
    expect(status.value).toMatch(/No governed human decision recorded/i);
    // A derived projection must never masquerade as a recorded decision.
    expect(status.sourceType).not.toBe("lifecycle_projection");
  });

  it("the two evidence kinds never share a source type", () => {
    const proj = runAgentTool("get_lifecycle_projection", "plant_manager", views);
    const audit = runAgentTool("get_decision_audit", "plant_manager", views);
    const projTypes = new Set(proj.citations.map((c) => c.sourceType));
    const auditTypes = new Set(audit.citations.map((c) => c.sourceType));
    for (const t of projTypes) expect(auditTypes.has(t)).toBe(false);
  });
});
