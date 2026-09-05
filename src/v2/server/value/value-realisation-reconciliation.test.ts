import { describe, it, expect } from "vitest";
import { getValueRealisationView } from "./value-realisation-view";
import { getRepository } from "@/data/repository";

/**
 * September 9 Value Realisation — semantic-acceptance reconciliation.
 *
 * Proves that the recommendation table, the decision-throughput counts and the
 * four value figures each trace to their EXACT seeded population, that those
 * populations are presented as distinct (never synonyms), that no user-facing
 * card exposes token-economics terminology, and that Decision exposure is kept
 * distinct from Portfolio value at stake / value-at-stake.v1.
 */

const view = getValueRealisationView("plant_manager");
const rots = getRepository().getRots();

describe("recommendation table reconciles to the recommendation population", () => {
  it("lists every recommendation exactly once", () => {
    expect(view.outstandingRows.length).toBe(rots.recommendations.length);
    expect(view.recommendationCount).toBe(rots.recommendations.length);
    const rowIds = view.outstandingRows.map((r) => r.id).sort();
    const recIds = rots.recommendations.map((r) => r.id).sort();
    expect(rowIds).toEqual(recIds);
  });

  it("derives each row's true funnel stage — never a blanket 'outcome pending'", () => {
    const byId = new Map(view.outstandingRows.map((r) => [r.id, r]));
    expect(byId.get("rec-k201")?.stage).toBe("awaiting_decision");
    expect(byId.get("rec-f201")?.stage).toBe("awaiting_decision");
    expect(byId.get("rec-e205")?.stage).toBe("accepted_outcome_pending");
    expect(byId.get("rec-v208")?.stage).toBe("rejected_closed");
    expect(byId.get("rec-v208")?.statusLabel.toLowerCase()).toContain("rejected");
    // The stale hardcoded label must not appear on any row.
    for (const r of view.outstandingRows) {
      expect(r.statusLabel).not.toBe("Open — outcome pending");
    }
    // Rows genuinely differ in stage (not all identical).
    expect(new Set(view.outstandingRows.map((r) => r.stage)).size).toBeGreaterThan(1);
  });

  it("counts only open/actioned recommendations toward projected value", () => {
    const contributing = rots.recommendations.filter(
      (r) => r.status === "open" || r.status === "actioned",
    );
    expect(view.projectedContributingCount).toBe(contributing.length);
    const sum = contributing.reduce((s, r) => s + r.projectedValueEnabledUsd, 0);
    expect(sum).toBe(view.portfolioProjected.rawValue);
    // The scope note states both populations explicitly.
    expect(view.recommendationScopeNote).toContain(String(view.recommendationCount));
    expect(view.recommendationScopeNote).toContain(String(view.projectedContributingCount));
  });
});

describe("decision-throughput counts trace to their exact populations", () => {
  it("decisions supported = governed human decisions", () => {
    expect(view.decisionsSupported.rawValue).toBe(rots.metrics.decidedCount);
    expect(view.decisionsSupported.rawValue).toBe(rots.decisions.length);
  });

  it("validated vs awaiting-validation come from outcomes, not recommendations", () => {
    expect(view.validatedOutcomes.rawValue).toBe(rots.metrics.resolvedEventCount);
    expect(view.outstandingValidation.rawValue).toBe(rots.metrics.pendingOutcomeCount);
  });

  it("keeps recommendation, decision and outcome as non-synonymous labels", () => {
    const labels = [
      view.decisionsSupported.label,
      view.validatedOutcomes.label,
      view.outstandingValidation.label,
    ];
    expect(new Set(labels).size).toBe(labels.length);
    // The counts are three different populations and are not forced equal.
    const counts = [
      view.decisionsSupported.rawValue,
      view.validatedOutcomes.rawValue,
      view.outstandingValidation.rawValue,
      view.recommendationCount,
    ];
    // The throughput note explains the distinct populations.
    expect(view.throughputScopeNote).toContain(String(view.decisionsSupported.rawValue));
    expect(view.throughputScopeNote.toLowerCase()).toContain("population");
    expect(counts).toEqual([5, 0, 4, 7]);
  });
});

describe("no user-facing token-economics terminology on the cards", () => {
  const cards = [
    view.valueAtStake,
    view.portfolioProjected,
    view.realised,
    view.k201Projected,
    view.decisionsSupported,
    view.validatedOutcomes,
    view.outstandingValidation,
  ];

  it("card-facing source identity is neutral", () => {
    for (const c of cards) {
      expect(c.sourceIdentity.toLowerCase()).not.toContain("token");
      expect(c.sourceIdentity).not.toContain("Return on Token Spend");
    }
  });

  it("the technical ledger identity survives only as provenance", () => {
    expect(view.portfolioProjected.provenanceIdentity).toContain("Return on Token Spend");
    const provenanceStrings = view.sourceProvenance.map((p) => p.provenanceIdentity);
    expect(provenanceStrings.some((s) => s.includes("Return on Token Spend"))).toBe(true);
  });
});

describe("Decision exposure stays distinct from value-at-stake.v1", () => {
  it("preserves the governed business figure and formula identity", () => {
    expect(view.decisionExposure.label).toBe("Decision exposure");
    expect(view.decisionExposure.rawValue).toBe(1620155.9999999995);
    expect(view.decisionExposure.display).toBe("$1,620,156");
    expect(view.decisionExposure.formulaVersion).toContain("value-at-stake");
  });

  it("is a different measure from Portfolio value at stake", () => {
    expect(view.valueAtStake.label).toBe("Portfolio value at stake");
    expect(view.valueAtStake.rawValue).toBe(2304155.9999999995);
    expect(view.decisionExposure.rawValue).not.toBe(view.valueAtStake.rawValue);
  });

  it("keeps the formula identity available for the evidence-lineage disclosure", () => {
    const exposureRow = view.evidenceLineage.find((r) => r.key === view.decisionExposure.key);
    expect(exposureRow?.formulaVersion).toContain("value-at-stake");
  });
});
