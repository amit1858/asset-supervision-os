"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PersonaId, TimeRangeKey } from "@/personas/types";
import {
  CONTEXT_COOKIE,
  PERSONA_COOKIE,
  type OperationalContextState,
} from "./types";

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

interface OperationalContextValue extends OperationalContextState {
  setPersona: (id: PersonaId) => void;
  setAsset: (tag: string | null) => void;
  setPlant: (plantId: string) => void;
  setUnit: (unitId: string | null) => void;
  setTimeRange: (range: TimeRangeKey) => void;
  setShift: (shift: string | null) => void;
}

const Ctx = createContext<OperationalContextValue | null>(null);

/**
 * Client provider for the shared operational context. Initialised from
 * server-read cookies (no hydration mismatch). Every mutation mirrors to cookies
 * so server components and middleware see the updated thread on next navigation.
 * The `personaId` here is a VIEW selection, not authentication.
 */
export function OperationalContextProvider({
  initial,
  children,
}: {
  initial: OperationalContextState;
  children: ReactNode;
}) {
  const [state, setState] = useState<OperationalContextState>(initial);

  const persist = useCallback((next: OperationalContextState) => {
    writeCookie(PERSONA_COOKIE, next.personaId);
    writeCookie(
      CONTEXT_COOKIE,
      JSON.stringify({
        plantId: next.plantId,
        unitId: next.unitId,
        assetTag: next.assetTag,
        timeRange: next.timeRange,
        shift: next.shift,
      }),
    );
  }, []);

  const update = useCallback(
    (patch: Partial<OperationalContextState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value: OperationalContextValue = {
    ...state,
    setPersona: (id) => update({ personaId: id }),
    setAsset: (tag) => update({ assetTag: tag }),
    setPlant: (plantId) => update({ plantId }),
    setUnit: (unitId) => update({ unitId }),
    setTimeRange: (timeRange) => update({ timeRange }),
    setShift: (shift) => update({ shift }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOperationalContext(): OperationalContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useOperationalContext must be used within OperationalContextProvider");
  }
  return ctx;
}
