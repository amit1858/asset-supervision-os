import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getMaintenanceMaterialsView } from "./maintenance-materials-view";

/**
 * September 8 Maintenance & Materials experience — read-model contract.
 *
 * Proves the K-201 maintenance & materials view composes governed values
 * verbatim: the inventory-position bridge balances to the GOVERNED buffer (never
 * a re-derivation), materials readiness and inventory health stay distinct
 * dimensions, negatives are shown honestly, unavailable is never zero, the
 * operational horizon reuses the governed TTC, timestamps come from governed
 * records, and the panel is strictly read-only.
 */
describe("getMaintenanceMaterialsView — work-order readiness", () => {
  const view = getMaintenanceMaterialsView("reliability_manager");
  const byId = new Map(view.workOrders.map((r) => [r.workOrderId, r]));

  it("carries both K-201 work orders", () => {
    expect(view.workOrders.map((r) => r.workOrderId)).toEqual(["wo-1", "wo-2"]);
  });

  it("keeps materials readiness and inventory health as DISTINCT dimensions", () => {
    const wo1 = byId.get("wo-1")!;
    // wo-1 is materials-READY yet simultaneously BELOW reorder point — the two
    // dimensions must never be conflated.
    expect(wo1.readinessKind).toBe("ready");
    expect(wo1.materialsLabel).toBe("ready");
    expect(wo1.inventoryLabel).toBe("below_reorder_point");

    const wo2 = byId.get("wo-2")!;
    expect(wo2.readinessKind).toBe("blocked");
    expect(wo2.materialsLabel).toBe("blocked");
    expect(wo2.inventoryLabel).toBe("below_reorder_point");
  });

  it("counts exactly one materials-blocked work order", () => {
    expect(view.summary.blockedCount).toBe(1);
    expect(view.summary.workOrderCount).toBe(2);
  });

  it("shows negative buffers honestly (never clamped to zero)", () => {
    expect(byId.get("wo-1")!.bufferDisplay).toContain("-1");
    expect(byId.get("wo-2")!.bufferDisplay).toContain("-2");
  });
});

describe("getMaintenanceMaterialsView — inventory-position bridge", () => {
  const view = getMaintenanceMaterialsView("reliability_manager");

  it("balances on-hand − reserved − required − reorder point to the GOVERNED buffer", () => {
    for (const row of view.workOrders) {
      const b = row.bridge;
      // Every leg is a governed inventory fact; the buffer is the governed
      // calculation envelope. The bridge must reconcile exactly.
      expect(b.onHandTotal).not.toBeNull();
      expect(b.reservedTotal).not.toBeNull();
      expect(b.reorderPointTotal).not.toBeNull();
      expect(b.required.rawValue).not.toBeNull();
      expect(b.buffer.rawValue).not.toBeNull();
      const derived =
        b.onHandTotal! - b.reservedTotal! - b.required.rawValue! - b.reorderPointTotal!;
      expect(derived).toBe(b.buffer.rawValue);
    }
  });

  it("carries a governed-fact leg with a resolved part label for each work order", () => {
    for (const row of view.workOrders) {
      expect(row.bridge.legs.length).toBeGreaterThan(0);
      for (const leg of row.bridge.legs) {
        expect(leg.hasBalance).toBe(true);
        expect(leg.partLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("provides an accessible restatement of the bridge arithmetic", () => {
    const eq = view.workOrders[0]!.bridge.equationText;
    expect(eq).toContain("On hand");
    expect(eq).toContain("post-allocation buffer");
  });
});

describe("getMaintenanceMaterialsView — horizon, turnaround, timestamps", () => {
  const view = getMaintenanceMaterialsView("reliability_manager");

  it("reuses the governed operational horizon (failure marker is the governed TTC)", () => {
    const failure = view.horizon.markers.find((m) => m.key === "failure")!;
    expect(view.horizon.available).toBe(true);
    expect(failure.days).toBe(17.929375879868676);
    expect(failure.display).toBe("≈17.93 days");
  });

  it("carries the governed turnaround fit with its available date", () => {
    expect(view.turnaround.available).toBe(true);
    expect(view.turnaround.fitLabel).toBe("fits");
    expect(view.turnaround.availableDate).toBe("2026-08-31");
    expect(view.summary.turnaroundFitDisplay).not.toBe("Unavailable");
  });

  it("derives every displayed timestamp from a governed record (12:00Z materials)", () => {
    for (const row of view.workOrders) {
      expect(row.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    }
    expect(view.turnaround.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    expect(view.summary.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
  });
});

describe("getMaintenanceMaterialsView — accountability & lineage", () => {
  const view = getMaintenanceMaterialsView("reliability_manager");

  it("names the responsible human and endorsement condition, read-only", () => {
    expect(view.accountability.noDecisionRecorded).toBe(true);
    expect(view.accountability.nextActPersonaName.length).toBeGreaterThan(0);
    expect(view.accountability.endorsementRequired).toBe(true);
    expect(view.accountability.readOnlyNotice.toLowerCase()).toContain("read-only");
  });

  it("exposes materials, turnaround and raw inventory evidence lineage", () => {
    const keys = view.evidenceLineage.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "wo-1-readiness",
        "wo-2-readiness",
        "turnaround-fit",
        "wo-1-inventory",
        "wo-2-inventory",
      ]),
    );
    // Raw inventory balances are measured facts, not formula outputs.
    const inv = view.evidenceLineage.find((r) => r.key === "wo-1-inventory")!;
    expect(inv.trustLabel).toBe("Measured fact");
  });

  it("is deterministic across calls (byte-identical view)", () => {
    const a = getMaintenanceMaterialsView("reliability_manager");
    const b = getMaintenanceMaterialsView("reliability_manager");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("presents governed materials figures identically regardless of viewer", () => {
    const rm = getMaintenanceMaterialsView("reliability_manager");
    const pm = getMaintenanceMaterialsView("plant_manager");
    expect(JSON.stringify(rm.workOrders)).toBe(JSON.stringify(pm.workOrders));
    expect(JSON.stringify(rm.horizon)).toBe(JSON.stringify(pm.horizon));
  });

  it("carries a non-empty governed inventory bridge for each work order", () => {
    // The blocked WO-2 bridge must have legs so the visual can open by default;
    // the empty-legs branch is a genuine unavailable state, not the K-201 case.
    for (const wo of view.workOrders) {
      expect(wo.bridge.legs.length).toBeGreaterThan(0);
    }
  });
});

describe("MaintenanceMaterialsWorkspace — inventory-bridge visual drivers (source invariants)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/v2/materials/MaintenanceMaterialsWorkspace.tsx"),
    "utf8",
  );

  it("opens the inventory bridge by default only for a materials-blocked work order", () => {
    // The blocked work order surfaces its inventory evidence expanded; a ready
    // work order stays compact. The trigger is the governed readinessKind.
    expect(source).toContain('defaultOpen={row.readinessKind === "blocked"}');
  });

  it("shows an honest unavailable note instead of an empty bridge when no legs exist", () => {
    expect(source).toContain("bridge.legs.length === 0");
    expect(source).toContain("Inventory evidence unavailable");
  });
});
