import { describe, expect, it } from "vitest";

import {
  computeWorkReadiness,
  WORK_READINESS_EVIDENCE_ABSENT,
  WORK_READINESS_EVIDENCE_MALFORMED,
  WORK_READINESS_EVIDENCE_UNAVAILABLE,
  WORK_READINESS_EVIDENCE_UNOBSERVABLE,
  WORK_READINESS_FIELD_NAMES,
  type WorkReadinessResult,
  type WorkReadinessSpareBalance,
} from "./work-readiness";

const AS_OF = "2026-07-27T12:00:00.000Z";
const CAPTURED = "2026-07-27T06:00:00.000Z";

function valueOf(result: WorkReadinessResult, name: string): number | null {
  const field = result.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`missing field ${name}`);
  return field.value;
}

function reasonOf(result: WorkReadinessResult, name: string): string {
  const field = result.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`missing field ${name}`);
  return field.unavailableReason;
}

function balance(
  spareId: string,
  onHandQty: number,
  reservedQty: number,
  reorderPoint: number,
): WorkReadinessSpareBalance {
  return { spareId, hasSparePart: true, hasBalance: true, onHandQty, reservedQty, reorderPoint };
}

describe("computeWorkReadiness", () => {
  it("always records exactly the eleven governed fields and no readiness score", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.fields.map((f) => f.name)).toEqual([...WORK_READINESS_FIELD_NAMES]);
    expect(result.fields).toHaveLength(11);
    expect(result.fields.some((f) => f.name.toLowerCase().includes("score"))).toBe(false);
  });

  it("reproduces the wo-1 golden: ready, coverage 1, buffer -1", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("produced");
    expect(valueOf(result, "requiredSpareLineCount")).toBe(1);
    expect(valueOf(result, "totalRequiredQty")).toBe(1);
    expect(valueOf(result, "sparesWithBalanceCount")).toBe(1);
    expect(valueOf(result, "totalAvailableUnreservedQty")).toBe(1);
    expect(valueOf(result, "totalShortageQty")).toBe(0);
    expect(valueOf(result, "sparesWithShortageCount")).toBe(0);
    expect(valueOf(result, "minimumCoverageRatio")).toBe(1);
    expect(valueOf(result, "postAllocationBufferToReorderPoint")).toBe(-1);
  });

  it("reproduces the wo-2 golden: an available zero on hand yields a shortage, not missing evidence", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-seal"],
      spareBalances: [balance("sp-seal", 0, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("produced");
    expect(valueOf(result, "totalAvailableUnreservedQty")).toBe(0);
    expect(valueOf(result, "totalShortageQty")).toBe(1);
    expect(valueOf(result, "sparesWithShortageCount")).toBe(1);
    expect(valueOf(result, "minimumCoverageRatio")).toBe(0);
  });

  it("treats a fully-reserved balance as zero available", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [balance("sp-brg", 2, 2, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(valueOf(result, "totalAvailableUnreservedQty")).toBe(0);
    expect(valueOf(result, "totalShortageQty")).toBe(1);
  });

  it("marks availability aggregates unavailable when any required line lacks a balance, keeping the counts", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg", "sp-missing"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("produced");
    // counts that do not depend on availability stay governed facts
    expect(valueOf(result, "requiredSpareLineCount")).toBe(2);
    expect(valueOf(result, "totalRequiredQty")).toBe(2);
    expect(valueOf(result, "sparesWithBalanceCount")).toBe(1);
    // every availability-derived aggregate is explicitly unavailable, not zero
    for (const name of [
      "totalAvailableUnreservedQty",
      "totalShortageQty",
      "sparesWithShortageCount",
      "minimumCoverageRatio",
      "postAllocationBufferToReorderPoint",
    ]) {
      expect(valueOf(result, name), name).toBeNull();
      expect(reasonOf(result, name), name).toBe(WORK_READINESS_EVIDENCE_UNAVAILABLE);
    }
  });

  it("treats a present InventoryBalance with an absent SparePart as unavailable, not zero and not a missing balance", () => {
    // The inventory row exists (hasBalance) but the SparePart master fact is
    // absent (hasSparePart false). That is a missing SparePart, distinct from a
    // missing balance: the line must not be counted as a governed balance, and
    // availability must not be manufactured as zero.
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [
        {
          spareId: "sp-brg",
          hasSparePart: false,
          hasBalance: true,
          onHandQty: 5,
          reservedQty: 0,
          reorderPoint: 1,
        },
      ],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("produced");
    // counts that do not depend on the resolved balance remain governed facts
    expect(valueOf(result, "requiredSpareLineCount")).toBe(1);
    expect(valueOf(result, "totalRequiredQty")).toBe(1);
    // the absent SparePart means this line is not a governed balance
    expect(valueOf(result, "sparesWithBalanceCount")).toBe(0);
    // every availability-derived aggregate is explicitly unavailable, not zero
    for (const name of [
      "totalAvailableUnreservedQty",
      "totalShortageQty",
      "sparesWithShortageCount",
      "minimumCoverageRatio",
      "postAllocationBufferToReorderPoint",
    ]) {
      expect(valueOf(result, name), name).toBeNull();
      expect(reasonOf(result, name), name).toBe(WORK_READINESS_EVIDENCE_UNAVAILABLE);
    }
  });

  it("produces available zeros for an empty required-spare list", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: [],
      spareBalances: [],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("produced");
    expect(valueOf(result, "requiredSpareLineCount")).toBe(0);
    expect(valueOf(result, "totalRequiredQty")).toBe(0);
    expect(valueOf(result, "sparesWithBalanceCount")).toBe(0);
    expect(valueOf(result, "totalAvailableUnreservedQty")).toBe(0);
    expect(valueOf(result, "totalShortageQty")).toBe(0);
    expect(valueOf(result, "sparesWithShortageCount")).toBe(0);
    // min / buffer over zero lines are undefined, not zero
    expect(valueOf(result, "minimumCoverageRatio")).toBeNull();
    expect(valueOf(result, "postAllocationBufferToReorderPoint")).toBeNull();
  });

  it("always leaves engineering/labour/permits unavailable with evidence_absent", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    for (const name of [
      "engineeringReadinessGoverned",
      "labourReadinessGoverned",
      "permitsReadinessGoverned",
    ]) {
      expect(valueOf(result, name), name).toBeNull();
      expect(reasonOf(result, name), name).toBe(WORK_READINESS_EVIDENCE_ABSENT);
    }
  });

  it("gates to overall unavailable on a malformed required-spare list", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg", "sp-brg"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: CAPTURED,
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("unavailable");
    if (result.overall.status !== "unavailable") throw new Error("unreachable");
    expect(result.overall.reason).toBe(WORK_READINESS_EVIDENCE_MALFORMED);
    expect(result.fields.every((f) => f.value === null)).toBe(true);
  });

  it("gates to overall unavailable on future-dated (unobservable) evidence", () => {
    const result = computeWorkReadiness({
      requiredSpareIds: ["sp-brg"],
      spareBalances: [balance("sp-brg", 1, 0, 1)],
      capturedAt: "2026-07-28T00:00:00.000Z",
      asOf: AS_OF,
    });
    expect(result.overall.status).toBe("unavailable");
    if (result.overall.status !== "unavailable") throw new Error("unreachable");
    expect(result.overall.reason).toBe(WORK_READINESS_EVIDENCE_UNOBSERVABLE);
  });
});
