"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useOperationalContext } from "@/context/OperationalContext";
import { getSpeechOutput } from "./index";
import { voiceScopeDisplay, type VoiceScopeDisplay } from "./display";
import type { VoiceQuery, VoiceScope, VoiceState, VoiceTurn } from "./types";
import { getVoiceSuggestions } from "./suggestions";

interface NameMap {
  id: string;
  name: string;
}

interface VoiceContextValue {
  isOpen: boolean;
  state: VoiceState;
  turns: VoiceTurn[];
  scope: VoiceScope;
  scopeDisplay: VoiceScopeDisplay;
  suggestions: string[];
  /** True after the user selects the microphone (which is not connected in the demo). */
  micNotice: boolean;
  open: (initialQuery?: string) => void;
  close: () => void;
  ask: (text: string, via: VoiceQuery["via"]) => void;
  pickSuggestion: (index: number, via: VoiceQuery["via"]) => void;
  /** Selecting the mic shows an honest "not connected" notice — no capture, no permission. */
  useMic: () => void;
  stop: () => void;
}

const Ctx = createContext<VoiceContextValue | null>(null);

/**
 * Voice session provider. Inherits the live operational context, grounds every
 * answer through the SERVER conversation endpoint, and exposes business-readable
 * scope labels. The deterministic mock returns a complete payload, so the state
 * lifecycle is ready → thinking → ready (no lingering "responding"). The
 * microphone is not connected in this phase and never requests permission or
 * fabricates a transcript.
 */
export function VoiceProvider({
  plants,
  units,
  children,
}: {
  plants: NameMap[];
  units: NameMap[];
  children: ReactNode;
}) {
  const octx = useOperationalContext();
  const pathname = usePathname();
  const speechOutput = useMemo(() => getSpeechOutput(), []);

  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<VoiceState>("closed");
  const [micNotice, setMicNotice] = useState(false);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const turnSeq = useRef(0);

  const scope: VoiceScope = useMemo(
    () => ({
      personaId: octx.personaId,
      plantId: octx.plantId,
      unitId: octx.unitId,
      assetTag: octx.assetTag,
      timeRange: octx.timeRange,
      shift: octx.shift,
      route: pathname,
      sourceMode: octx.sourceMode,
      dataFreshness: octx.dataFreshness,
    }),
    [octx.personaId, octx.plantId, octx.unitId, octx.assetTag, octx.timeRange, octx.shift, octx.sourceMode, octx.dataFreshness, pathname],
  );
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const scopeDisplay = useMemo(() => voiceScopeDisplay(scope, plants, units), [scope, plants, units]);

  /** Send a question to the SERVER truth boundary and render the grounded turn. */
  const send = useCallback(
    (userText: string, payload: { text?: string; suggestionId?: number }, via: VoiceQuery["via"]) => {
      const clean = userText.trim();
      if (!clean) return;
      setMicNotice(false);
      turnSeq.current += 1;
      const userTurn: VoiceTurn = {
        id: `u-${turnSeq.current}`,
        role: "user",
        text: clean,
        provenanceKinds: [],
        evidence: [],
        sources: [],
        unavailableNote: null,
        proposedAction: null,
      };
      setTurns((t) => [...t, userTurn]);
      setState("thinking");
      const s = scopeRef.current;
      fetch("/api/voice/brief-conversation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          via,
          personaId: s.personaId,
          plantId: s.plantId,
          unitId: s.unitId,
          assetTag: s.assetTag,
          timeRange: s.timeRange,
          shift: s.shift,
          route: s.route,
          sourceMode: s.sourceMode,
          dataFreshness: s.dataFreshness,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            setState("error");
            return;
          }
          const data = (await res.json()) as Omit<VoiceTurn, "id" | "role"> & { turnId: string };
          const turn: VoiceTurn = {
            id: data.turnId,
            role: "assistant",
            text: data.text,
            provenanceKinds: data.provenanceKinds,
            evidence: data.evidence,
            sources: data.sources,
            unavailableNote: data.unavailableNote,
            proposedAction: data.proposedAction,
          };
          setTurns((t) => [...t, turn]);
          // Complete payload → interaction is available again.
          setState("ready");
        })
        .catch(() => setState("error"));
    },
    [],
  );

  const ask = useCallback((text: string, via: VoiceQuery["via"]) => send(text, { text }, via), [send]);

  const pickSuggestion = useCallback(
    (index: number, via: VoiceQuery["via"]) => {
      const text = getVoiceSuggestions(scopeRef.current.personaId)[index];
      if (text) send(text, { suggestionId: index }, via);
    },
    [send],
  );

  const open = useCallback(
    (initialQuery?: string) => {
      returnFocus.current = (document.activeElement as HTMLElement) ?? null;
      setIsOpen(true);
      setState("ready");
      setMicNotice(false);
      if (initialQuery) ask(initialQuery, "text");
    },
    [ask],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setState("closed");
    setMicNotice(false);
    speechOutput.stop();
    returnFocus.current?.focus?.();
  }, [speechOutput]);

  const stop = useCallback(() => {
    speechOutput.stop();
    setMicNotice(false);
    setState((s) => (s === "closed" ? s : "ready"));
  }, [speechOutput]);

  // Honest mock microphone: no permission request, no fabricated transcript.
  const useMic = useCallback(() => setMicNotice(true), []);

  const value: VoiceContextValue = {
    isOpen,
    state,
    turns,
    scope,
    scopeDisplay,
    suggestions: getVoiceSuggestions(octx.personaId),
    micNotice,
    open,
    close,
    ask,
    pickSuggestion,
    useMic,
    stop,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoice(): VoiceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoice must be used within VoiceProvider");
  return v;
}
