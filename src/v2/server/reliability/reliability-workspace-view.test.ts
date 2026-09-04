import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getReliabilityWorkspaceView } from "./reliability-workspace-view";

/**
 * September 6–7 Reliability experience — the Reliability Command Center
 * workspace read-model contract. Proves the priority queue and summary strip
 * are derived from the same governed view as the Asset 360 record, so the
 * workspace and the asset record can never disagree.
 */
describe("getReliabilityWorkspaceView", () => {
  const view = getReliabilityWorkspaceView("reliability_manager");

  it("opens on K-201 as the governed priority", () => {
    expect(view.priorities).toHaveLength(1);
    const row = view.priorities[0]!;
    expect(row.tag).toBe("K-201");
    expect(row.href).toBe("/v2/assets/K-201");
  });

  it("carries the governed goldens into the priority row", () => {
    const row = view.priorities[0]!;
    expect(row.healthDisplay).toBe("52");
    expect(row.riskDisplay).toBe("68");
    expect(row.timeToCriticalDisplay).toBe("≈17.93 days");
    expect(row.exposureDisplay).toBe("$1,620,156");
    expect(row.freshnessLabel).toBe("Fresh");
  });

  it("names the next governed action and decision status", () => {
    const row = view.priorities[0]!;
    expect(row.decisionStatusLabel).toContain("Proposed");
    expect(row.nextActLabel).toContain("Reliability Manager");
  });

  it("summarises the governed state truthfully", () => {
    const highExposure = view.summary.find((s) => s.label === "High-exposure cases")!;
    expect(highExposure.value).toBe("1");
    const oee = view.summary.find((s) => s.label.includes("OEE"))!;
    expect(oee.value).toBe("91.2%");
  });

  it("labels the undecided proposed case as a case, never a completed decision", () => {
    // No governed human decision exists (lifecycle is 'proposed', decision
    // audit is empty). The summary strip must not imply a decision has been
    // made: the high-exposure metric counts a *case*, and no summary label
    // may assert a completed decision.
    const highExposure = view.summary.find((s) => s.label === "High-exposure cases");
    expect(highExposure).toBeDefined();
    expect(view.summary.some((s) => s.label === "High-exposure decisions")).toBe(false);
    for (const s of view.summary) {
      expect(s.label).not.toMatch(/decisions?\s+(made|recorded|approved|completed)/i);
    }
    // The governed decision status must still read as pending, not decided.
    const row = view.priorities[0]!;
    expect(row.decisionStatusLabel).toContain("awaiting a human decision");
    expect(row.decisionStatusLabel).not.toMatch(/approved|declined|endorsed|decided/i);
  });

  it("is deterministic across calls", () => {
    const again = getReliabilityWorkspaceView("reliability_manager");
    expect(JSON.stringify(again)).toBe(JSON.stringify(view));
  });
});

describe("ReliabilityWorkspace — evaluation-timestamp presentation", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/v2/reliability/ReliabilityWorkspace.tsx"),
    "utf8",
  );

  it("formats the governed evaluatedAt through formatUtcInstant, never raw", () => {
    // The workspace view-model carries a raw ISO asOf; the component must render
    // it only through the shared user-facing UTC formatter, derived from the
    // governed record and never hardcoded.
    expect(source).toContain("formatUtcInstant(view.evaluatedAt)");
    expect(source).not.toContain("Evaluated ${view.evaluatedAt}");
  });

  it("never exposes a raw ISO instant or a hardcoded timestamp to the user", () => {
    // No literal UTC "Z" ISO timestamp and no hardcoded formatted string.
    expect(source).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(source).not.toContain("06:00 UTC");
  });
});
