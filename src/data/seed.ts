import "server-only";
import type { Dataset } from "@/domain/types";
import { buildDataset } from "./generate";
import { SEED } from "./constants";

/**
 * Memoized seeded dataset. Generated once per process from a fixed seed, so the
 * demo is deterministic and repeatable. This is the local-development fallback
 * that lets the UI run before any Snowflake credentials are configured.
 */
let cached: Dataset | null = null;

export function getDataset(): Dataset {
  if (cached === null) {
    cached = buildDataset(SEED);
  }
  return cached;
}