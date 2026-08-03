import { describe, expect, it } from "vitest";
import type { GovernedEventType } from "./events";
import { makeRecomputeRequest, type RecomputeRequest, type RecomputeRequestKind } from "./recompute";

/**
 * Slice 2.1b — a recompute request is an OUTBOUND ask for a calculation. It is
 * never an event, is never appended and never performs the calculation itself.
 */

const ANCHOR = "2026-07-27T00:00:00.000Z";

describe("RecomputeRequest", () => {
  it("carries only the kind, asset, originating event and explicit asOf", () => {
    const request = makeRecomputeRequest({
      kind: "asset_assessment",
      assetId: "K-201",
      requestedByEventId: "evt-1",
      requestedByEventType: "ConditionSignalIngested",
      asOf: ANCHOR,
    });

    expect(Object.keys(request).sort()).toEqual([
      "asOf",
      "assetId",
      "kind",
      "requestedByEventId",
      "requestedByEventType",
    ]);
  });

  it("is frozen so a consumer cannot rewrite a governed request", () => {
    const request = makeRecomputeRequest({
      kind: "realised_value",
      assetId: "K-201",
      requestedByEventId: "evt-9",
      requestedByEventType: "OutcomeConfirmed",
      asOf: ANCHOR,
    });
    expect(Object.isFrozen(request)).toBe(true);
  });

  it("copies the input so a later caller mutation cannot alter the request", () => {
    const input: RecomputeRequest = {
      kind: "decision_projected_value",
      assetId: "K-201",
      requestedByEventId: "evt-5",
      requestedByEventType: "EndorsementGranted",
      asOf: ANCHOR,
    };
    const request = makeRecomputeRequest(input);
    expect(request).not.toBe(input);
    expect(request.asOf).toBe(ANCHOR);
  });

  it("never carries a computed value — it only asks", () => {
    const request = makeRecomputeRequest({
      kind: "asset_assessment",
      assetId: "K-201",
      requestedByEventId: "evt-1",
      requestedByEventType: "ConditionSignalIngested",
      asOf: ANCHOR,
    });
    expect(request).not.toHaveProperty("value");
    expect(request).not.toHaveProperty("result");
    expect(request).not.toHaveProperty("envelope");
  });

  it("supports exactly the six approved recompute kinds", () => {
    const kinds: RecomputeRequestKind[] = [
      "asset_assessment",
      "oee_reconciliation",
      "decision_projected_value",
      "work_readiness",
      "turnaround_lead_time_fit",
      "realised_value",
    ];
    for (const kind of kinds) {
      expect(makeRecomputeRequest({
        kind,
        assetId: "K-201",
        requestedByEventId: "evt-1",
        requestedByEventType: "ConditionSignalIngested",
        asOf: ANCHOR,
      }).kind).toBe(kind);
    }
    expect(new Set(kinds).size).toBe(6);
  });

  it("carries the exact governed event type that emitted it", () => {
    const pairs: ReadonlyArray<[RecomputeRequestKind, GovernedEventType]> = [
      ["asset_assessment", "ConditionSignalIngested"],
      ["oee_reconciliation", "ProductionObservationIngested"],
      ["decision_projected_value", "DecisionApproved"],
      ["decision_projected_value", "EndorsementGranted"],
      ["decision_projected_value", "AssessmentComputed"],
      ["work_readiness", "WorkOrderPlanned"],
      ["work_readiness", "MaterialsChecked"],
      ["turnaround_lead_time_fit", "TurnaroundScopeRetained"],
      ["realised_value", "OutcomeConfirmed"],
    ];
    for (const [kind, type] of pairs) {
      const request = makeRecomputeRequest({
        kind,
        assetId: "K-201",
        requestedByEventId: "evt-1",
        requestedByEventType: type,
        asOf: ANCHOR,
      });
      expect(request.requestedByEventType).toBe(type);
    }
  });

  it("keeps the event type distinct from the event id", () => {
    const request = makeRecomputeRequest({
      kind: "work_readiness",
      assetId: "K-201",
      requestedByEventId: "evt-42",
      requestedByEventType: "MaterialsChecked",
      asOf: ANCHOR,
    });
    expect(request.requestedByEventId).toBe("evt-42");
    expect(request.requestedByEventType).toBe("MaterialsChecked");
    expect(request.requestedByEventType).not.toBe(request.requestedByEventId);
  });
});
