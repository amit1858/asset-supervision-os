import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_PERSONA_ID, isPersonaId } from "@/personas/registry";
import {
  CONTEXT_COOKIE,
  DEFAULT_PLANT_ID,
  DEFAULT_UNIT_ID,
  PERSONA_COOKIE,
  type OperationalContextState,
} from "./types";

/**
 * Read the operational context from cookies on the server. Persona is stored in
 * its own cookie so middleware can route "/" without parsing JSON. Returns a
 * fully-populated state with sensible defaults, so the app always has context.
 */
export function readOperationalContext(): OperationalContextState {
  const store = cookies();
  const personaRaw = store.get(PERSONA_COOKIE)?.value;
  const personaId = isPersonaId(personaRaw) ? personaRaw : DEFAULT_PERSONA_ID;

  let parsed: Partial<OperationalContextState> = {};
  const ctxRaw = store.get(CONTEXT_COOKIE)?.value;
  if (ctxRaw) {
    try {
      parsed = JSON.parse(ctxRaw) as Partial<OperationalContextState>;
    } catch {
      parsed = {};
    }
  }

  return {
    personaId,
    plantId: parsed.plantId ?? DEFAULT_PLANT_ID,
    unitId: parsed.unitId ?? DEFAULT_UNIT_ID,
    assetTag: parsed.assetTag ?? null,
    timeRange: parsed.timeRange ?? "30d",
    shift: parsed.shift ?? null,
    sourceMode:
      (process.env.DATA_SOURCE ?? "local") === "snowflake" ? "snowflake" : "local",
    dataFreshness: "recent",
  };
}
