import type { PersonaId, TimeRangeKey } from "@/personas/types";

/** Source of the underlying data. */
export type SourceMode = "local" | "snowflake";
export type DataFreshness = "live" | "recent" | "stale" | "offline";

/**
 * The typed shared operational context — the "operational thread" that persists
 * as the user moves between personas and views.
 */
export interface OperationalContextState {
  personaId: PersonaId;
  plantId: string;
  unitId: string | null;
  /** Active asset thread (equipment tag), preserved across persona switches. */
  assetTag: string | null;
  timeRange: TimeRangeKey;
  shift: string | null;
  sourceMode: SourceMode;
  dataFreshness: DataFreshness;
}

export const PERSONA_COOKIE = "aso-persona";
export const CONTEXT_COOKIE = "aso-ctx";

export const DEFAULT_PLANT_ID = "plant-gc";
export const DEFAULT_UNIT_ID = "line-hds2";
