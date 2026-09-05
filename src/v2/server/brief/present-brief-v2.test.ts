import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPersonaBrief } from "@/brief/service";
import { presentBriefForV2 } from "./present-brief-v2";

const relMgr = buildPersonaBrief("reliability_manager", { assetTag: "K-201" });
const materials = buildPersonaBrief("materials_coordinator", { assetTag: "K-201" });

describe("presentBriefForV2 — September 8 acceptance corrections", () => {
  it("relabels the $1,620,156 governed figure as decision exposure, not value at stake", () => {
    const before = relMgr.riskValue.find((r) => r.label === "Value at stake (K-201)");
    expect(before).toBeTruthy();
    const v2 = presentBriefForV2(relMgr);
    expect(v2.riskValue.some((r) => r.label === "Value at stake (K-201)")).toBe(false);
    const after = v2.riskValue.find((r) => r.label === "Decision exposure");
    expect(after).toBeTruthy();
    // The value itself is untouched — only the label is corrected.
    expect(after!.value).toBe(before!.value);
    expect(after!.provenance).toBe(before!.provenance);
  });

  it("corrects the seal blocker detail to name WO-2, not the 48-hour WO-1", () => {
    const v2 = presentBriefForV2(relMgr);
    const seal = v2.blockers.find((b) => b.id === "blk-seal");
    expect(seal).toBeTruthy();
    expect(seal!.detail).toMatch(/seal replacement \(WO-2\)/);
    expect(seal!.detail).toMatch(/not the 48-hour bearing inspection \(WO-1\)/);
  });

  it("corrects the expedite-seal action to constrain WO-2, not WO-1", () => {
    const v2 = presentBriefForV2(materials);
    const act = v2.actions.find((a) => a.id === "act-expedite-seal");
    expect(act).toBeTruthy();
    expect(act!.why).toMatch(/seal replacement \(WO-2\)/);
    expect(act!.why).toMatch(/not materials-blocked/);
    expect(act!.consequenceOfInaction).toBe("Seal replacement blocked on materials.");
  });

  it("turns the reliability manager's imperative approval point into governed status", () => {
    expect(relMgr.summary.points).toContain("Approve, modify, or reject the K-201 intervention.");
    const v2 = presentBriefForV2(relMgr);
    expect(v2.summary.points).not.toContain("Approve, modify, or reject the K-201 intervention.");
    expect(v2.summary.points.some((p) => /awaiting a governed reliability decision/i.test(p))).toBe(true);
  });

  it("corrects the materials headline and point to reference the seal replacement", () => {
    const v2 = presentBriefForV2(materials);
    expect(v2.summary.headline).toBe(
      "K-201 seal replacement is blocked by a dry gas seal shortage with a 35-day lead time.",
    );
    expect(v2.summary.points.some((p) => /seal replacement \(WO-2\)/.test(p))).toBe(true);
    expect(v2.summary.points).not.toContain("Lead time threatens the 48-hour intervention.");
  });

  it("restates the reliability manager's persona-dependent approval headline as a governed statement", () => {
    expect(relMgr.summary.headline).toContain("requires your approval");
    const v2 = presentBriefForV2(relMgr);
    // Persona-safe: no imperative "your approval" language on the V2 surface.
    expect(v2.summary.headline).not.toMatch(/your approval/i);
    expect(v2.summary.headline).toBe(
      "K-201 requires a governed decision; the ≈18-day critical horizon is earlier than the 35-day seal lead time.",
    );
  });

  it("rewrites governed-decision links into the V2 governed case", () => {
    const before = relMgr.decisions[0];
    expect(before?.href).toBe("/assets/K-201");
    const v2 = presentBriefForV2(relMgr);
    expect(v2.decisions[0]!.href).toBe("/v2/assets/K-201");
  });

  it("is pure and deterministic — never fabricates, reorders or removes a governed fact", () => {
    const a = presentBriefForV2(relMgr);
    const b = presentBriefForV2(relMgr);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Same counts of every governed collection before and after.
    expect(a.riskValue.length).toBe(relMgr.riskValue.length);
    expect(a.blockers.length).toBe(relMgr.blockers.length);
    expect(a.actions.length).toBe(relMgr.actions.length);
    expect(a.decisions.length).toBe(relMgr.decisions.length);
    expect(a.changes.length).toBe(relMgr.changes.length);
    // Evidence is preserved intact.
    for (let i = 0; i < a.decisions.length; i++) {
      expect(a.decisions[i]!.evidence).toEqual(relMgr.decisions[i]!.evidence);
    }
  });

  it("no-ops safely when an unrelated brief carries none of the corrected strings", () => {
    const shift = buildPersonaBrief("shift_supervisor", { assetTag: "K-201" });
    const v2 = presentBriefForV2(shift);
    expect(v2.summary.headline).toBe(shift.summary.headline);
    expect(v2.summary.points).toEqual(shift.summary.points);
  });

  it("performs presentation only — recomputes no governed metric or numeric value", () => {
    const v2 = presentBriefForV2(relMgr);
    // Every governed numeric value on the decision is byte-identical.
    for (let i = 0; i < relMgr.decisions.length; i++) {
      expect(v2.decisions[i]!.valueAtStakeUsd).toBe(relMgr.decisions[i]!.valueAtStakeUsd);
      expect(v2.decisions[i]!.title).toBe(relMgr.decisions[i]!.title);
      expect(v2.decisions[i]!.owner).toEqual(relMgr.decisions[i]!.owner);
    }
    // Risk-value figures are untouched; only labels may be corrected.
    const beforeValues = relMgr.riskValue.map((r) => r.value).sort();
    const afterValues = v2.riskValue.map((r) => r.value).sort();
    expect(afterValues).toEqual(beforeValues);
    // Provenance of every risk value is preserved.
    for (const rv of v2.riskValue) {
      const match = relMgr.riskValue.find((r) => r.value === rv.value);
      expect(rv.provenance).toBe(match!.provenance);
    }
  });
});

describe("V2 brief wiring (source invariants)", () => {
  const routeScreen = readFileSync(
    join(process.cwd(), "src/components/v2/V2RouteScreen.tsx"),
    "utf8",
  );
  const myBrief = readFileSync(
    join(process.cwd(), "src/components/brief/MyBrief.tsx"),
    "utf8",
  );

  it("applies the V2 presentation transform and selects the v2 brief variant", () => {
    expect(routeScreen).toContain("presentBriefForV2(");
    expect(routeScreen).toContain('variant="v2"');
  });

  it("renders the read-only governed-case call to action in the v2 variant", () => {
    // Imperative approval language is replaced by a read-only governed-case link.
    expect(myBrief).toContain("Review governed case");
    expect(myBrief).toContain("decision exposure");
  });
});
