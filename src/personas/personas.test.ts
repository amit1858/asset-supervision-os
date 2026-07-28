import { describe, it, expect } from "vitest";
import {
  PERSONAS,
  PERSONA_ORDER,
  DEFAULT_PERSONA_ID,
  listPersonas,
  getPersona,
  isPersonaId,
  personaCan,
  personaDefaultRoute,
} from "./registry";
import { ALL_CAPABILITIES, CAPABILITIES, isAuthorityCapability } from "./capabilities";
import { DemoAuthorizationProvider, getAuthorizationProvider } from "./authorization";
import { personaLandingRoute } from "./routing";
import type { PersonaId } from "./types";

const EXPECTED_IDS: PersonaId[] = [
  "plant_manager",
  "shift_supervisor",
  "reliability_manager",
  "reliability_engineer",
  "maintenance_planner",
  "materials_coordinator",
  "turnaround_manager",
  "ai_admin",
];

describe("persona registry", () => {
  it("defines exactly the eight personas", () => {
    expect(PERSONA_ORDER).toEqual(EXPECTED_IDS);
    expect(listPersonas()).toHaveLength(8);
  });

  it("every persona has all required fields populated", () => {
    for (const id of EXPECTED_IDS) {
      const p = getPersona(id);
      expect(p.id).toBe(id);
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.family.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.accountability.length).toBeGreaterThan(0);
      expect(p.primaryQuestions.length).toBeGreaterThan(0);
      expect(p.defaultRoute.startsWith("/")).toBe(true);
      expect(p.navItems.length).toBeGreaterThan(0);
      expect(p.capabilities.length).toBeGreaterThan(0);
      expect(p.kpis.length).toBeGreaterThan(0);
      expect(p.collaborators.length).toBeGreaterThan(0);
      expect(p.readWriteScope.read.length).toBeGreaterThan(0);
      expect(p.context.timeRange).toBeTruthy();
    }
  });

  it("uses the reliability manager as the default persona", () => {
    expect(DEFAULT_PERSONA_ID).toBe("reliability_manager");
  });

  it("validates persona ids", () => {
    expect(isPersonaId("reliability_manager")).toBe(true);
    expect(isPersonaId("not_a_persona")).toBe(false);
    expect(isPersonaId(null)).toBe(false);
    expect(isPersonaId(undefined)).toBe(false);
  });

  it("gives every persona a landing route that matches its default", () => {
    for (const id of EXPECTED_IDS) {
      expect(personaDefaultRoute(id)).toBe(PERSONAS[id].defaultRoute);
    }
    // Landing routes are unique per persona family expectation.
    const routes = EXPECTED_IDS.map(personaDefaultRoute);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe("capability model", () => {
  it("declares 21 capabilities with metadata", () => {
    expect(ALL_CAPABILITIES).toHaveLength(21);
    for (const c of ALL_CAPABILITIES) {
      expect(CAPABILITIES[c].label.length).toBeGreaterThan(0);
    }
  });

  it("only grants capabilities from the central vocabulary", () => {
    for (const id of EXPECTED_IDS) {
      for (const cap of PERSONAS[id].capabilities) {
        expect(ALL_CAPABILITIES).toContain(cap);
      }
    }
  });

  it("keeps approval authority as a subset of held, authority-flagged capabilities", () => {
    for (const id of EXPECTED_IDS) {
      const p = PERSONAS[id];
      for (const cap of p.approvalAuthority) {
        expect(p.capabilities).toContain(cap);
        expect(isAuthorityCapability(cap)).toBe(true);
      }
    }
  });

  it("switching persona never grants a capability outside its definition", () => {
    for (const id of EXPECTED_IDS) {
      const held = new Set(PERSONAS[id].capabilities);
      for (const cap of ALL_CAPABILITIES) {
        expect(personaCan(id, cap)).toBe(held.has(cap));
      }
    }
  });

  it("enforces expected capability boundaries per persona", () => {
    // Engineer drafts but cannot approve.
    expect(personaCan("reliability_engineer", "create_reliability_recommendation")).toBe(true);
    expect(personaCan("reliability_engineer", "approve_reliability_decision")).toBe(false);
    // Only the AI admin configures the model runtime.
    expect(personaCan("ai_admin", "configure_model_runtime")).toBe(true);
    expect(personaCan("reliability_manager", "configure_model_runtime")).toBe(false);
    // Only the turnaround manager approves turnaround scope (besides plant manager).
    expect(personaCan("turnaround_manager", "approve_turnaround_scope")).toBe(true);
    expect(personaCan("maintenance_planner", "approve_turnaround_scope")).toBe(false);
    // Materials coordinator expedites; planner reserves.
    expect(personaCan("materials_coordinator", "expedite_material")).toBe(true);
    expect(personaCan("shift_supervisor", "expedite_material")).toBe(false);
  });

  it("separates read visibility from action authority", () => {
    // Engineer: read-only OEE visibility, NOT plant-performance management authority.
    expect(personaCan("reliability_engineer", "view_oee_impact")).toBe(true);
    expect(personaCan("reliability_engineer", "view_plant_performance")).toBe(false);
    // Materials: read-only planning visibility, NOT work-order preparation authority.
    expect(personaCan("materials_coordinator", "view_work_planning")).toBe(true);
    expect(personaCan("materials_coordinator", "prepare_work_order")).toBe(false);
  });

  it("keeps token economics out of the Plant Manager and in the AI Administrator", () => {
    // Plant Manager: value realisation, NOT token economics.
    expect(personaCan("plant_manager", "view_value_realisation")).toBe(true);
    expect(personaCan("plant_manager", "view_token_economics")).toBe(false);
    expect(personaCan("ai_admin", "view_token_economics")).toBe(true);
    // No AI Value & Cost item in Plant Manager nav; a Value Realisation item exists.
    const nav = PERSONAS.plant_manager.navItems;
    expect(nav.some((n) => n.href.startsWith("/agent-control"))).toBe(false);
    expect(nav.some((n) => n.href === "/value-realisation")).toBe(true);
  });
});

describe("authorization boundary", () => {
  it("permits all personas in the demo provider and flags it unrestricted", () => {
    const auth = new DemoAuthorizationProvider();
    expect(auth.getPermittedPersonas()).toHaveLength(8);
    expect(auth.unrestricted).toBe(true);
    for (const id of EXPECTED_IDS) expect(auth.isPersonaPermitted(id)).toBe(true);
  });

  it("exposes a default provider", () => {
    expect(getAuthorizationProvider().getPermittedPersonas().length).toBe(8);
  });
});

describe("context preservation via persona routing", () => {
  it("lands on the default route when no asset thread is active", () => {
    for (const id of EXPECTED_IDS) {
      expect(personaLandingRoute(id)).toBe(PERSONAS[id].defaultRoute);
      expect(personaLandingRoute(id, { assetTag: null })).toBe(PERSONAS[id].defaultRoute);
    }
  });

  it("preserves the asset thread into each persona's asset-relevant view", () => {
    expect(personaLandingRoute("reliability_engineer", { assetTag: "K-201" })).toBe("/assets/K-201");
    expect(personaLandingRoute("maintenance_planner", { assetTag: "K-201" })).toBe("/planning?asset=K-201");
    expect(personaLandingRoute("materials_coordinator", { assetTag: "K-201" })).toBe("/materials?asset=K-201");
    expect(personaLandingRoute("turnaround_manager", { assetTag: "K-201" })).toBe("/turnaround?asset=K-201");
    // Personas without an asset-level view fall back to their home.
    expect(personaLandingRoute("plant_manager", { assetTag: "K-201" })).toBe("/plant-overview");
    expect(personaLandingRoute("ai_admin", { assetTag: "K-201" })).toBe("/agent-control");
  });
});
