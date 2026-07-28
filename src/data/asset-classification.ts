import type { Asset } from "@/domain/types";
import type { AssetOperationalStatus, Criticality } from "@/domain/enums";

/**
 * Asset criticality and current condition are SEPARATE concepts and must never
 * be conflated. Criticality classifies the consequence of failure (A–E, fixed);
 * condition status describes the asset's current operational state (may change).
 * A Criticality-A asset is NOT "in critical condition" unless its condition
 * status is actually `critical`.
 */

/** Fixed consequence-of-failure classification. */
export function criticalityOf(asset: Asset): Criticality {
  return asset.criticality;
}

/** Current operational condition status. */
export function conditionStatusOf(asset: Asset): AssetOperationalStatus {
  return asset.operationalStatus;
}

/** True only when the asset's CONDITION is critical (not its criticality class). */
export function isInCriticalCondition(asset: Asset): boolean {
  return asset.operationalStatus === "critical";
}

export function countByConditionStatus(
  assets: Asset[],
  status: AssetOperationalStatus,
): number {
  return assets.filter((a) => a.operationalStatus === status).length;
}

export function countByCriticality(assets: Asset[], level: Criticality): number {
  return assets.filter((a) => a.criticality === level).length;
}
