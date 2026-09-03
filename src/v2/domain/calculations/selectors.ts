/**
 * Slice 2.1c.1 — governed work-readiness SELECTORS.
 *
 * A selector turns already-computed governed numbers into a categorical label a
 * human reads ("ready", "blocked", "below reorder point"). It is deliberately
 * SEPARATE from the calculation: the numbers are the governed facts on the
 * ledger; the label is a derived presentation of them, versioned in its own
 * right so a change to the wording of a verdict never looks like a change to the
 * underlying material position.
 *
 * Every selector is total and pure. A missing / unavailable input is reported as
 * an explicit `"unavailable"` label — never silently rendered as "ready" or as a
 * numeric zero.
 */

import { WORK_READINESS_FORMULA_SET_VERSION } from "./work-readiness";

export const MATERIALS_READINESS_SELECTOR_VERSION =
  "materials-readiness-selector.v1" as const;
export const INVENTORY_BUFFER_SELECTOR_VERSION =
  "inventory-buffer-selector.v1" as const;

/** No `"at_risk"`: material readiness is a hard ready / blocked position. */
export type MaterialsReadinessLabel =
  | "ready"
  | "blocked"
  | "not_required"
  | "unavailable";

export type InventoryBufferLabel =
  | "healthy"
  | "at_reorder_point"
  | "below_reorder_point"
  | "unavailable";

export interface SelectorResult<TLabel extends string> {
  readonly label: TLabel;
  readonly selectorVersion: string;
  readonly formulaSetVersion: string;
  /** Short human description of exactly which inputs produced the label. */
  readonly basis: string;
}

export interface MaterialsReadinessInputs {
  /** Governed total required quantity, or `null` when unavailable. */
  readonly totalRequiredQty: number | null;
  /** Governed total shortage quantity, or `null` when unavailable. */
  readonly totalShortageQty: number | null;
}

/**
 * Materials readiness:
 * - either input unavailable → `"unavailable"`;
 * - nothing required → `"not_required"`;
 * - any shortage → `"blocked"`;
 * - otherwise → `"ready"`.
 */
export function materialsReadinessSelector(
  inputs: MaterialsReadinessInputs,
): SelectorResult<MaterialsReadinessLabel> {
  const { totalRequiredQty, totalShortageQty } = inputs;
  const base = {
    selectorVersion: MATERIALS_READINESS_SELECTOR_VERSION,
    formulaSetVersion: WORK_READINESS_FORMULA_SET_VERSION,
  } as const;

  if (
    totalRequiredQty === null ||
    !Number.isFinite(totalRequiredQty) ||
    totalShortageQty === null ||
    !Number.isFinite(totalShortageQty)
  ) {
    return {
      ...base,
      label: "unavailable",
      basis: `requiredQty=${String(totalRequiredQty)}, shortageQty=${String(totalShortageQty)}`,
    };
  }
  if (totalRequiredQty === 0) {
    return { ...base, label: "not_required", basis: "requiredQty=0" };
  }
  if (totalShortageQty > 0) {
    return {
      ...base,
      label: "blocked",
      basis: `requiredQty=${totalRequiredQty}, shortageQty=${totalShortageQty}`,
    };
  }
  return {
    ...base,
    label: "ready",
    basis: `requiredQty=${totalRequiredQty}, shortageQty=0`,
  };
}

export interface InventoryBufferInputs {
  /**
   * Governed minimum post-allocation buffer to the reorder point across all
   * required lines, or `null` when there are no lines / it is unavailable.
   */
  readonly postAllocationBufferToReorderPoint: number | null;
}

/**
 * Inventory buffer position:
 * - no lines / unavailable → `"unavailable"`;
 * - `> 0` → `"healthy"`;
 * - `=== 0` → `"at_reorder_point"`;
 * - `< 0` → `"below_reorder_point"`.
 */
export function inventoryBufferSelector(
  inputs: InventoryBufferInputs,
): SelectorResult<InventoryBufferLabel> {
  const buffer = inputs.postAllocationBufferToReorderPoint;
  const base = {
    selectorVersion: INVENTORY_BUFFER_SELECTOR_VERSION,
    formulaSetVersion: WORK_READINESS_FORMULA_SET_VERSION,
  } as const;

  if (buffer === null || !Number.isFinite(buffer)) {
    return { ...base, label: "unavailable", basis: `buffer=${String(buffer)}` };
  }
  if (buffer > 0) {
    return { ...base, label: "healthy", basis: `buffer=${buffer}` };
  }
  if (buffer === 0) {
    return { ...base, label: "at_reorder_point", basis: "buffer=0" };
  }
  return { ...base, label: "below_reorder_point", basis: `buffer=${buffer}` };
}
