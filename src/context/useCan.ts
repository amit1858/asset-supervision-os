"use client";

import { useOperationalContext } from "./OperationalContext";
import { personaCan } from "@/personas/registry";
import type { Capability } from "@/personas/types";

/**
 * Client capability check bound to the active persona. Components should gate on
 * capabilities via this hook rather than comparing persona names.
 */
export function useCan(): (capability: Capability) => boolean {
  const { personaId } = useOperationalContext();
  return (capability: Capability) => personaCan(personaId, capability);
}
