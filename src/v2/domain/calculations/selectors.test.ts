import { describe, expect, it } from "vitest";

import {
  INVENTORY_BUFFER_SELECTOR_VERSION,
  inventoryBufferSelector,
  MATERIALS_READINESS_SELECTOR_VERSION,
  materialsReadinessSelector,
} from "./selectors";
import { WORK_READINESS_FORMULA_SET_VERSION } from "./work-readiness";

describe("materials readiness selector", () => {
  it("labels a fully-covered requirement ready", () => {
    const result = materialsReadinessSelector({
      totalRequiredQty: 1,
      totalShortageQty: 0,
    });
    expect(result.label).toBe("ready");
    expect(result.selectorVersion).toBe(MATERIALS_READINESS_SELECTOR_VERSION);
    expect(result.formulaSetVersion).toBe(WORK_READINESS_FORMULA_SET_VERSION);
    expect(result.basis).toContain("shortageQty=0");
  });

  it("labels any shortage blocked", () => {
    expect(
      materialsReadinessSelector({ totalRequiredQty: 1, totalShortageQty: 1 }).label,
    ).toBe("blocked");
  });

  it("labels a zero requirement not_required", () => {
    expect(
      materialsReadinessSelector({ totalRequiredQty: 0, totalShortageQty: 0 }).label,
    ).toBe("not_required");
  });

  it("labels a null input unavailable, never ready", () => {
    expect(
      materialsReadinessSelector({ totalRequiredQty: null, totalShortageQty: null }).label,
    ).toBe("unavailable");
    expect(
      materialsReadinessSelector({ totalRequiredQty: 1, totalShortageQty: null }).label,
    ).toBe("unavailable");
  });
});

describe("inventory buffer selector", () => {
  it("labels a positive buffer healthy", () => {
    const result = inventoryBufferSelector({ postAllocationBufferToReorderPoint: 2 });
    expect(result.label).toBe("healthy");
    expect(result.selectorVersion).toBe(INVENTORY_BUFFER_SELECTOR_VERSION);
    expect(result.formulaSetVersion).toBe(WORK_READINESS_FORMULA_SET_VERSION);
    expect(result.basis).toContain("buffer=2");
  });

  it("labels a zero buffer at_reorder_point", () => {
    expect(
      inventoryBufferSelector({ postAllocationBufferToReorderPoint: 0 }).label,
    ).toBe("at_reorder_point");
  });

  it("labels a negative buffer below_reorder_point", () => {
    expect(
      inventoryBufferSelector({ postAllocationBufferToReorderPoint: -1 }).label,
    ).toBe("below_reorder_point");
  });

  it("labels a null buffer unavailable", () => {
    expect(
      inventoryBufferSelector({ postAllocationBufferToReorderPoint: null }).label,
    ).toBe("unavailable");
  });
});
