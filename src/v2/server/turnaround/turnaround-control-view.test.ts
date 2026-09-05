import { describe, it, expect } from "vitest";
import { getTurnaroundControlView } from "./turnaround-control-view";

/**
 * September 9 Turnaround Control experience — read-model contract.
 *
 * Proves the K-201 turnaround view composes governed values verbatim: the exact
 * governed subject identity is shown unchanged, the governed fit metrics (max
 * lead 35, days until turnaround 88, slack 53) and the governed operational
 * horizon (predicted critical horizon ≈17.93 days) are reused, work-order timing
 * is derived from the governed subject, the mandatory "a fit is not safe to wait"
 * caution is present, timestamps come from governed records, and the surface is
 * strictly read-only.
 */
describe("getTurnaroundControlView — governed subject identity", () => {
  const view = getTurnaroundControlView("turnaround_manager");

  it("shows the exact governed subject IDs verbatim", () => {
    expect(view.identity.turnaroundScopeId).toBe("wp-k201");
    expect(view.identity.workOrderId).toBe("wo-2");
    expect(view.identity.assetId).toBe("asset-k201");
  });

  it("carries human-readable names alongside the IDs", () => {
    expect(view.identity.scopePackageCode).toBe("WP-201-ROT");
    expect(view.identity.assetTag).toBe("K-201");
    expect(view.identity.turnaroundName.length).toBeGreaterThan(0);
  });
});

describe("getTurnaroundControlView — governed fit and horizon", () => {
  const view = getTurnaroundControlView("turnaround_manager");

  it("reuses the governed turnaround-fit metrics verbatim", () => {
    expect(view.turnaround.available).toBe(true);
    expect(view.turnaround.fitLabel).toBe("fits");
    expect(view.turnaround.availableDate).toBe("2026-08-31");
    expect(view.summary.maxLeadDisplay).toBe("35");
    expect(view.summary.daysUntilDisplay).toBe("88");
    expect(view.summary.slackDisplay).toBe("53");
  });

  it("reuses the governed operational horizon (failure marker is the governed TTC)", () => {
    const failure = view.horizon.markers.find((m) => m.key === "failure")!;
    expect(view.horizon.available).toBe(true);
    expect(failure.days).toBe(17.929375879868676);
    expect(failure.display).toBe("≈17.93 days");
  });

  it("derives every displayed timestamp from a governed record (12:00Z turnaround)", () => {
    expect(view.turnaround.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    expect(view.summary.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
  });
});

describe("getTurnaroundControlView — work-order timing and readiness", () => {
  const view = getTurnaroundControlView("turnaround_manager");
  const byId = new Map(view.workOrders.map((w) => [w.workOrderId, w]));

  it("carries both K-201 work orders", () => {
    expect(view.workOrders.map((w) => w.workOrderId)).toEqual(["wo-1", "wo-2"]);
  });

  it("derives timing from the governed turnaround subject", () => {
    expect(byId.get("wo-1")!.timing).toBe("immediate");
    expect(byId.get("wo-2")!.timing).toBe("turnaround_scoped");
  });

  it("keeps the materials readiness of each work order", () => {
    expect(byId.get("wo-1")!.readinessKind).toBe("ready");
    expect(byId.get("wo-1")!.materialsLabel).toBe("ready");
    expect(byId.get("wo-2")!.readinessKind).toBe("blocked");
    expect(byId.get("wo-2")!.materialsLabel).toBe("blocked");
  });

  it("resolves the governed work-order numbers", () => {
    expect(byId.get("wo-1")!.workOrderNumber).toBe("WO-48231");
    expect(byId.get("wo-2")!.workOrderNumber).toBe("WO-48102");
  });
});

describe("getTurnaroundControlView — caution, accountability, determinism", () => {
  const view = getTurnaroundControlView("turnaround_manager");

  it("presents the mandatory safe-to-wait caution verbatim", () => {
    expect(view.safeToWaitWarning).toBe(
      "The spare lead time fits the turnaround window, but the predicted critical " +
        "horizon occurs earlier than both. A fit against the turnaround must not be " +
        "read as safe to wait.",
    );
  });

  it("names the decision owner and scope owner, read-only", () => {
    expect(view.accountability.decisionOwnerName.length).toBeGreaterThan(0);
    expect(view.accountability.scopeOwnerName.length).toBeGreaterThan(0);
    expect(view.accountability.readOnlyNotice.toLowerCase()).toContain("read-only");
  });

  it("exposes turnaround and readiness evidence lineage", () => {
    const keys = view.evidenceLineage.map((r) => r.key);
    expect(keys).toContain("turnaround-fit");
    expect(keys.some((k) => k.endsWith("-readiness"))).toBe(true);
  });

  it("is deterministic across calls (byte-identical view)", () => {
    const a = getTurnaroundControlView("turnaround_manager");
    const b = getTurnaroundControlView("turnaround_manager");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("presents governed figures identically regardless of viewer", () => {
    const tm = getTurnaroundControlView("turnaround_manager");
    const pm = getTurnaroundControlView("plant_manager");
    expect(JSON.stringify(tm.summary)).toBe(JSON.stringify(pm.summary));
    expect(JSON.stringify(tm.identity)).toBe(JSON.stringify(pm.identity));
    expect(JSON.stringify(tm.workOrders)).toBe(JSON.stringify(pm.workOrders));
    expect(JSON.stringify(tm.horizon)).toBe(JSON.stringify(pm.horizon));
  });
});
