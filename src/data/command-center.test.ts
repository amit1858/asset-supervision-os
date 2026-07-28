import { describe, it, expect } from "vitest";
import { getRepository } from "./repository";

/**
 * Guards the Command Center count correction: every total must reconcile with
 * its breakdown, and the distinct concepts are calculated separately.
 */
describe("command center counts reconcile", () => {
  const cc = getRepository().getCommandCenter();
  const c = cc.counts;

  it("requiring attention equals critical + attention", () => {
    expect(c.requiringAttention).toBe(c.critical + c.attention);
  });

  it("under supervision equals the sum of every status bucket", () => {
    expect(c.underSupervision).toBe(
      c.critical + c.attention + c.monitored + c.inMaintenance + c.normal,
    );
  });

  it("attention list matches the requiring-attention count and status", () => {
    expect(cc.attentionAssets).toHaveLength(c.requiringAttention);
    for (const s of cc.attentionAssets) {
      expect(["critical", "attention"]).toContain(s.asset.operationalStatus);
    }
  });

  it("monitored list matches the monitored count and status", () => {
    expect(cc.monitoredAssets).toHaveLength(c.monitored);
    for (const s of cc.monitoredAssets) {
      expect(s.asset.operationalStatus).toBe("monitor");
    }
  });

  it("pending decisions are exactly the open recommendations", () => {
    expect(cc.pendingApprovals.every((r) => r.status === "open")).toBe(true);
    expect(c.pendingDecisions).toBe(cc.pendingApprovals.length);
    expect(c.openRecommendations).toBeGreaterThanOrEqual(c.pendingDecisions);
  });

  it("does not overstate attention (no Normal/Maintenance assets counted as attention)", () => {
    // In the seed: 0 critical, 1 attention (K-201), 2 monitor, 1 maintenance.
    expect(c.critical).toBe(0);
    expect(c.attention).toBe(1);
    expect(c.requiringAttention).toBe(1);
    expect(c.monitored).toBe(2);
    expect(c.inMaintenance).toBe(1);
    expect(c.underSupervision).toBe(8);
  });
});
