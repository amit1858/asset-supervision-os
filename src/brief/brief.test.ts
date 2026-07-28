import { describe, it, expect } from "vitest";
import { buildPersonaBrief } from "./service";
import { PERSONA_ORDER, personaCan } from "@/personas/registry";
import type { PersonaBrief } from "./types";

const briefs = new Map(PERSONA_ORDER.map((id) => [id, buildPersonaBrief(id, { assetTag: "K-201" })]));

function allItemsWithEvidence(b: PersonaBrief) {
  return [...b.actions, ...b.decisions, ...b.changes, ...b.blockers];
}

describe("Chief of Staff briefing", () => {
  it("produces a deterministic brief for the same seeded data", () => {
    for (const id of PERSONA_ORDER) {
      const a = buildPersonaBrief(id, { assetTag: "K-201" });
      const b = buildPersonaBrief(id, { assetTag: "K-201" });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("gives different personas a different prioritisation of the same K-201 facts", () => {
    const relMgr = briefs.get("reliability_manager")!;
    const shift = briefs.get("shift_supervisor")!;
    const materials = briefs.get("materials_coordinator")!;
    // Same asset thread…
    expect(relMgr.assetTag).toBe("K-201");
    expect(shift.assetTag).toBe("K-201");
    // …different titles and different lead priorities.
    expect(relMgr.title).not.toBe(shift.title);
    expect(relMgr.decisions.length).toBeGreaterThan(0); // manager approves
    expect(shift.decisions.length).toBe(0); // shift does not
    expect(shift.actions[0]?.capability).toBe("issue_operating_instruction");
    expect(materials.actions[0]?.capability).toBe("expedite_material");
  });

  it("never produces a brief item without evidence", () => {
    for (const id of PERSONA_ORDER) {
      const b = briefs.get(id)!;
      for (const item of allItemsWithEvidence(b)) {
        expect(item.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not turn unavailable source data into a factual claim", () => {
    const shift = briefs.get("shift_supervisor")!;
    // Shift-grain OEE is unavailable and appears ONLY as an unavailable section…
    expect(shift.unavailableSections.some((s) => /shift/i.test(s))).toBe(true);
    // …never as an action/change/decision title.
    for (const b of briefs.values()) {
      for (const item of allItemsWithEvidence(b)) {
        const text = "title" in item ? (item as { title?: string }).title ?? "" : (item as { summary?: string }).summary ?? "";
        expect(/awaiting|not connected/i.test(text)).toBe(false);
      }
    }
  });

  it("only surfaces actions the persona is capable of", () => {
    for (const id of PERSONA_ORDER) {
      const b = briefs.get(id)!;
      for (const a of b.actions) {
        expect(a.capability === null || personaCan(id, a.capability)).toBe(true);
      }
    }
  });

  it("surfaces approval decisions only to authorised personas", () => {
    for (const id of PERSONA_ORDER) {
      const b = briefs.get(id)!;
      for (const d of b.decisions) {
        expect(personaCan(id, d.requiresCapability)).toBe(true);
      }
    }
    // The K-201 approval decision reaches approvers, not others.
    expect(briefs.get("plant_manager")!.decisions.length).toBeGreaterThan(0);
    expect(briefs.get("reliability_manager")!.decisions.length).toBeGreaterThan(0);
    expect(briefs.get("reliability_engineer")!.decisions.length).toBe(0);
  });

  it("preserves asset context while changing the brief across personas", () => {
    const eng = buildPersonaBrief("reliability_engineer", { assetTag: "K-201" });
    const planner = buildPersonaBrief("maintenance_planner", { assetTag: "K-201" });
    expect(eng.assetTag).toBe("K-201");
    expect(planner.assetTag).toBe("K-201");
    expect(eng.title).not.toBe(planner.title);
    expect(JSON.stringify(eng.actions)).not.toBe(JSON.stringify(planner.actions));
  });

  it("attaches source status to every brief", () => {
    for (const id of PERSONA_ORDER) {
      const b = briefs.get(id)!;
      expect(b.sources.length).toBeGreaterThan(0);
      expect(b.sources.some((s) => s.key === "local_seed" && s.state === "synthetic")).toBe(true);
    }
  });
});
