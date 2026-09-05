import { describe, it, expect } from "vitest";
import { getK201ReliabilityView } from "./asset-reliability-view";
import { formatUtcDate } from "@/v2/reliability/view-types";

/**
 * September 6–7 Reliability experience — Asset 360 read-model contract.
 *
 * Proves every governed number rendered by the K-201 experience comes from a
 * governed calculation envelope (never recomputed or hardcoded), the endorsement
 * banner cites the SAME governed exposure that drives the requirement, missing
 * facts never render as zero, and non-governed context is labelled as such.
 */
describe("getK201ReliabilityView — governed assessment", () => {
  const view = getK201ReliabilityView("reliability_manager");
  const byKey = new Map(view.assessmentMetrics.map((m) => [m.key, m]));

  it("renders the K-201 identity", () => {
    expect(view.tag).toBe("K-201");
    expect(view.evaluatedAt).toBe("2026-07-27T06:00:00.000Z");
  });

  it("carries the governed goldens (health 52, risk 68, TTC, exposure)", () => {
    expect(byKey.get("health")!.rawValue).toBe(52);
    expect(byKey.get("health")!.display).toBe("52");
    expect(byKey.get("risk")!.rawValue).toBe(68);
    expect(byKey.get("risk")!.display).toBe("68");
    expect(byKey.get("ttc")!.rawValue).toBe(17.929375879868676);
    expect(byKey.get("ttc")!.display).toBe("≈17.93 days");
    expect(byKey.get("exposure")!.rawValue).toBe(1620155.9999999995);
    expect(byKey.get("exposure")!.display).toBe("$1,620,156");
  });

  it("marks every assessment metric available and fresh, with truthful trust", () => {
    for (const key of ["health", "risk", "ttc", "exposure"]) {
      expect(byKey.get(key)!.available, key).toBe(true);
      expect(byKey.get(key)!.freshness, key).toBe("fresh");
    }
    // Health, risk and exposure are deterministic calculations; time-to-critical
    // is a statistical prediction and must be classified as such, never inflated
    // to a deterministic value.
    expect(byKey.get("health")!.trust).toBe("deterministic_calculation");
    expect(byKey.get("risk")!.trust).toBe("deterministic_calculation");
    expect(byKey.get("exposure")!.trust).toBe("deterministic_calculation");
    expect(byKey.get("ttc")!.trust).toBe("prediction");
  });

  it("carries governed OEE (91.2%) fresh", () => {
    expect(view.oee.rawValue).toBe(0.9116125730994152);
    expect(view.oee.display).toBe("91.2%");
    expect(view.oee.freshness).toBe("fresh");
    expect(view.oeeBreakdown).toHaveLength(3);
  });

  it("labels trend-projection confidence as non-governed context", () => {
    expect(view.assessmentContext.display).toBe("0.605");
    expect(view.assessmentContext.rawValue).toBeCloseTo(0.605, 3);
    expect(view.assessmentContext.note.toLowerCase()).toContain("not a governed");
  });
});

describe("getK201ReliabilityView — authority & endorsement", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("is at DECISION_PROPOSED, proposed, RM-owned next act", () => {
    expect(view.authority.phase).toBe("DECISION_PROPOSED");
    expect(view.authority.decisionStatus).toBe("proposed");
    expect(view.authority.nextActPersonaId).toBe("reliability_manager");
  });

  it("requires endorsement citing the SAME governed exposure value", () => {
    const exposure = view.assessmentMetrics.find((m) => m.key === "exposure")!;
    expect(view.authority.endorsementRequirement).toBe("required");
    expect(view.authority.endorsementRequired).toBe(true);
    // Regression: the banner MUST bind to the exposure envelope value
    // (1,620,156), never the projected/value-at-stake figure (2,304,156).
    expect(view.authority.endorsementBannerValueUsd).toBe(exposure.rawValue);
    expect(view.authority.endorsementBannerValueUsd).toBe(1620155.9999999995);
    expect(view.authority.endorsementBanner).toContain("$1,620,156");
    expect(view.authority.endorsementBanner).not.toContain("2,304,156");
  });

  it("grants next-act standing to the Reliability Manager only", () => {
    expect(getK201ReliabilityView("reliability_manager").authority.viewer.canActOnNext).toBe(true);
    expect(getK201ReliabilityView("plant_manager").authority.viewer.canActOnNext).toBe(false);
    expect(getK201ReliabilityView("reliability_engineer").authority.viewer.canActOnNext).toBe(false);
  });

  it("exposes RM as approver and PM as endorser in the actor matrix", () => {
    const rm = view.authority.actors.find((a) => a.personaId === "reliability_manager")!;
    const pm = view.authority.actors.find((a) => a.personaId === "plant_manager")!;
    expect(rm.act).toBe("approve");
    expect(rm.eligibleNow).toBe(true);
    expect(pm.act).toBe("endorse");
    // Endorsement is not actionable until an approval is recorded.
    expect(pm.eligibleNow).toBe(false);
  });

  it("offers no mutation seam — the view is read-only", () => {
    expect(view.authority.readOnlyNotice.toLowerCase()).toContain("read-only");
  });
});

describe("getK201ReliabilityView — lifecycle projection, readiness, audit, lineage", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("projects signal → proposed decision in four governed events", () => {
    expect(view.lifecycleProjection).toHaveLength(4);
    const last = view.lifecycleProjection[3]!;
    expect(last.resultingPhase).toBe("DECISION_PROPOSED");
    expect(view.lifecycleProjection.every((e) => e.actorLabel.startsWith("System"))).toBe(true);
  });

  it("carries governed work readiness for wo-1 and wo-2", () => {
    expect(view.workReadiness.map((w) => w.workOrderId)).toEqual(["wo-1", "wo-2"]);
    const wo1 = view.workReadiness[0]!;
    const wo2 = view.workReadiness[1]!;
    expect(wo1.materialsLabel).toBe("ready");
    expect(wo1.bufferLabel).toBe("below_reorder_point");
    expect(wo2.materialsLabel).toBe("blocked");
  });

  it("carries a governed turnaround fit with an available date", () => {
    expect(view.turnaround.available).toBe(true);
    expect(view.turnaround.fitLabel).toBe("fits");
    expect(view.turnaround.availableDate).toBe("2026-08-31");
  });

  it("keeps the decision audit honestly empty until a human acts", () => {
    expect(view.decisionAudit.entries).toHaveLength(0);
    expect(view.decisionAudit.nextGovernedAction).toContain("Reliability Manager");
  });

  it("exposes evidence lineage for every governed value", () => {
    expect(view.evidenceLineage.length).toBeGreaterThanOrEqual(5);
    for (const row of view.evidenceLineage) {
      expect(row.formulaVersion.length).toBeGreaterThan(0);
      expect(row.trustLabel.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic across calls (byte-identical view)", () => {
    const a = getK201ReliabilityView("reliability_manager");
    const b = getK201ReliabilityView("reliability_manager");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("getK201ReliabilityView — evaluation-instant disclosure", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("derives the assessment instant from the governed exposure record (06:00Z)", () => {
    const exposureRow = view.evidenceLineage.find((r) => r.key === "exposure")!;
    // The header instant is the SAME asOf the governed exposure envelope carries.
    expect(view.evaluatedAt).toBe("2026-07-27T06:00:00.000Z");
    expect(view.evaluatedAt).toBe(exposureRow.asOf);
  });

  it("derives each work-readiness instant from its governed record (12:00Z)", () => {
    for (const wr of view.workReadiness) {
      expect(wr.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
      const row = view.evidenceLineage.find((r) => r.key === `${wr.workOrderId}-readiness`)!;
      expect(row.asOf).toBe(wr.evaluatedAt);
    }
  });

  it("derives the turnaround instant from its governed record (12:00Z)", () => {
    expect(view.turnaround.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    const row = view.evidenceLineage.find((r) => r.key === "turnaround-fit")!;
    expect(row.asOf).toBe(view.turnaround.evaluatedAt);
  });

  it("presents two distinct instants — no single global snapshot for all records", () => {
    expect(view.evaluatedAt).not.toBe(view.workReadiness[0]!.evaluatedAt);
    expect(view.evaluatedAt).not.toBe(view.turnaround.evaluatedAt);
    const instants = new Set([
      view.evaluatedAt,
      ...view.workReadiness.map((w) => w.evaluatedAt),
      view.turnaround.evaluatedAt,
    ]);
    expect(instants).toEqual(new Set(["2026-07-27T06:00:00.000Z", "2026-07-27T12:00:00.000Z"]));
  });

  it("adds work-readiness and turnaround rows to the evidence lineage with their own asOf", () => {
    const keys = view.evidenceLineage.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining(["wo-1-readiness", "wo-2-readiness", "turnaround-fit"]),
    );
    for (const key of ["wo-1-readiness", "wo-2-readiness", "turnaround-fit"]) {
      expect(view.evidenceLineage.find((r) => r.key === key)!.asOf).toBe(
        "2026-07-27T12:00:00.000Z",
      );
    }
  });
});

describe("getK201ReliabilityView — signal sensors carry governed thresholds", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("exposes real reading series with seed warning/critical thresholds", () => {
    expect(view.signal.sensors.length).toBeGreaterThan(0);
    for (const s of view.signal.sensors) {
      expect(s.points.length).toBeGreaterThan(1);
      // Thresholds are read from the governed sensor definition, never invented.
      expect(s.warningThreshold === null || Number.isFinite(s.warningThreshold)).toBe(true);
      expect(s.criticalThreshold === null || Number.isFinite(s.criticalThreshold)).toBe(true);
    }
  });

  it("carries the ISO 10816-3 vibration thresholds (warn 7.1 / crit 11.2 mm/s)", () => {
    const vib = view.signal.sensors.find((s) => s.unit === "mm/s");
    expect(vib, "a vibration sensor in mm/s").toBeTruthy();
    expect(vib!.warningThreshold).toBe(7.1);
    expect(vib!.criticalThreshold).toBe(11.2);
    expect(vib!.latestValue === null || Number.isFinite(vib!.latestValue)).toBe(true);
  });
});

describe("getK201ReliabilityView — operational horizon uses governed inputs", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("plots the failure/lead/turnaround/slack markers from governed records", () => {
    const byKey = new Map(view.horizon.markers.map((m) => [m.key, m]));
    expect(view.horizon.available).toBe(true);
    // Failure marker is the governed TTC (≈17.93 days), never re-derived.
    expect(byKey.get("failure")!.days).toBe(17.929375879868676);
    expect(byKey.get("failure")!.display).toBe("≈17.93 days");
    expect(byKey.get("lead")!.days).toBe(35);
    expect(byKey.get("turnaround")!.days).toBe(88);
    expect(byKey.get("slack")!.days).toBe(53);
  });

  it("states plainly that a lead-time fit is not a safe-to-wait signal", () => {
    expect(view.horizon.comparisonMessage.toLowerCase()).toContain("not");
    expect(view.horizon.comparisonMessage.toLowerCase()).toContain("safe to wait");
  });

  it("anchors absolute calendar dates on the governed assessment instant, disclosing derivation", () => {
    const byKey = new Map(view.horizon.markers.map((m) => [m.key, m]));
    // Predicted failure — anchor + governed TTC offset; a presentation of a
    // governed record, honestly labelled as derived (no envelope stores it).
    const failure = byKey.get("failure")!;
    expect(failure.absoluteDateKind).toBe("presentation-derived");
    expect(formatUtcDate(failure.absoluteDate)).toBe("14 August 2026");
    // Longest spare lead — the spare-available date is a real governed turnaround
    // record date, so it is disclosed as governed, not derived.
    const lead = byKey.get("lead")!;
    expect(lead.absoluteDateKind).toBe("governed");
    expect(lead.absoluteDate).toBe("2026-08-31T00:00:00.000Z");
    expect(formatUtcDate(lead.absoluteDate)).toBe("31 August 2026");
    // Turnaround window opens — anchor + governed offset, derived.
    const turn = byKey.get("turnaround")!;
    expect(turn.absoluteDateKind).toBe("presentation-derived");
    expect(formatUtcDate(turn.absoluteDate)).toBe("23 October 2026");
    // Slack is a duration between two horizons, not a point in time.
    const slack = byKey.get("slack")!;
    expect(slack.absoluteDate).toBeNull();
    expect(slack.absoluteDateKind).toBeNull();
  });

  it("re-derives absolute dates from records only, so the view stays deterministic", () => {
    const a = getK201ReliabilityView("reliability_manager");
    const b = getK201ReliabilityView("reliability_manager");
    expect(JSON.stringify(a.horizon)).toBe(JSON.stringify(b.horizon));
  });
});

describe("getK201ReliabilityView — decision exposure terminology", () => {
  const view = getK201ReliabilityView("reliability_manager");

  it("labels the governed $1,620,156 figure as decision exposure, never value at stake", () => {
    // The authority banner already cites decision exposure; the assessment and
    // lineage surfaces must match — no 'Value at stake' label survives.
    const json = JSON.stringify(view);
    expect(json).not.toContain("Value at stake (exposure)");
    expect(json).not.toContain("Value at stake");
    expect(json.includes("Decision exposure")).toBe(true);
  });
});
