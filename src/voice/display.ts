import type { VoiceScope } from "./types";
import type { TimeRangeKey } from "@/personas/types";
import { getPersona } from "@/personas/registry";

/**
 * Business-readable labels for the voice scope. Internal IDs stay in the domain
 * model and API payloads; this only affects what the user sees. No
 * implementation terms (provider, mock, API, repository) appear here.
 */
const TIME_LABELS: Record<TimeRangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  shift: "Current shift",
};

const FRESHNESS_LABELS: Record<string, string> = {
  live: "Live",
  recent: "Updated recently",
  stale: "May be delayed",
  offline: "No live feed",
};

export interface VoiceScopeDisplay {
  personaName: string;
  plantName: string;
  unitName: string | null;
  assetTag: string | null;
  timeRangeLabel: string;
  shiftLabel: string | null;
  freshnessLabel: string;
}

export function voiceScopeDisplay(
  scope: VoiceScope,
  plants: Array<{ id: string; name: string }>,
  units: Array<{ id: string; name: string }>,
): VoiceScopeDisplay {
  return {
    personaName: getPersona(scope.personaId).displayName,
    plantName: plants.find((p) => p.id === scope.plantId)?.name ?? scope.plantId,
    unitName: scope.unitId ? units.find((u) => u.id === scope.unitId)?.name ?? scope.unitId : null,
    assetTag: scope.assetTag,
    timeRangeLabel: TIME_LABELS[scope.timeRange],
    shiftLabel: scope.shift,
    freshnessLabel: FRESHNESS_LABELS[scope.dataFreshness] ?? scope.dataFreshness,
  };
}
