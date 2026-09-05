import { describe, it, expect } from "vitest";
import { getOeeLossView } from "./oee-loss-view";

/**
 * September 9 OEE & Loss Intelligence experience — read-model contract.
 *
 * Proves the HDS-2 OEE view reuses the governed `oee_reconciliation` envelope
 * verbatim: OEE 91.2% and its three components, the three exact loss-unit
 * magnitudes, and a proportional loss split that is ONLY constructed because the
 * losses are additive components of a single total. Each exact magnitude is
 * always carried; the split is presentation geometry, never a recomputed value.
 */
describe("getOeeLossView — governed OEE and components", () => {
  const view = getOeeLossView("reliability_manager");

  it("reuses the governed OEE and its components verbatim", () => {
    expect(view.oee.rawValue).toBe(0.9116125730994152);
    expect(view.oee.display).toBe("91.2%");
    const byKey = new Map(view.components.map((c) => [c.key, c]));
    expect(byKey.get("availability")!.display).toBe("97.9%");
    expect(byKey.get("performance")!.display).toBe("93.9%");
    expect(byKey.get("quality")!.display).toBe("99.1%");
  });

  it("is the LINE OEE, not a per-asset OEE for K-201", () => {
    expect(view.summary.lineId).toBe("line-hds2");
    expect(view.assetContext.tag).toBe("K-201");
    expect(view.assetContext.note.toLowerCase()).toContain("not a per-asset");
  });

  it("evaluates OEE at the assessment instant (06:00Z)", () => {
    expect(view.summary.evaluatedAt).toBe("2026-07-27T06:00:00.000Z");
  });
});

describe("getOeeLossView — loss magnitudes and additive split", () => {
  const view = getOeeLossView("reliability_manager");
  const seg = new Map(view.losses.segments.map((s) => [s.key, s]));

  it("carries the three exact governed loss magnitudes", () => {
    expect(seg.get("availability")!.metric.rawValue).toBe(14123.333333333334);
    expect(seg.get("performance")!.metric.rawValue).toBe(40804.66666666663);
    expect(seg.get("quality")!.metric.rawValue).toBe(5529);
  });

  it("constructs a proportional split whose total is the additive sum", () => {
    expect(view.losses.presentation).toBe("proportional_split");
    expect(view.losses.totalUnits).toBe(14123.333333333334 + 40804.66666666663 + 5529);
  });

  it("splits each segment as its share of the additive total (ratios sum to 1)", () => {
    const total = view.losses.totalUnits!;
    for (const s of view.losses.segments) {
      expect(s.ratio).toBeCloseTo(s.metric.rawValue! / total, 12);
    }
    const sum = view.losses.segments.reduce((acc, s) => acc + (s.ratio ?? 0), 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("never hides a governed magnitude behind the proportion (display carries the value)", () => {
    expect(seg.get("availability")!.metric.display).toBe("14,123.33");
    expect(seg.get("performance")!.metric.display).toBe("40,804.67");
    expect(seg.get("quality")!.metric.display).toBe("5,529");
  });
});

describe("getOeeLossView — lineage and determinism", () => {
  const view = getOeeLossView("reliability_manager");

  it("classifies OEE and losses as deterministic calculations", () => {
    expect(view.oee.trustLabel).toBe("Deterministic calculation");
    for (const s of view.losses.segments) {
      expect(s.metric.trustLabel).toBe("Deterministic calculation");
    }
  });

  it("exposes evidence lineage for OEE, components and each loss magnitude", () => {
    const keys = view.evidenceLineage.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "oee",
        "availability",
        "performance",
        "quality",
        "availabilityLossUnits",
        "performanceLossUnits",
        "qualityLossUnits",
      ]),
    );
  });

  it("is deterministic across calls and viewer-independent", () => {
    const a = getOeeLossView("reliability_manager");
    const b = getOeeLossView("plant_manager");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
