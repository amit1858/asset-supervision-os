"use client";

import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGuidedJourneyForPersona, type GuidedJourney } from "@/v2/journeys";
import { useOperationalContext } from "@/context/OperationalContext";

const STORAGE_KEY = "aso-guided-journey:v1";

interface JourneyState {
  journeyId: string;
  stepIndex: number;
  active: boolean;
}

export function GuidedJourney() {
  const router = useRouter();
  const pathname = usePathname();
  const { personaId } = useOperationalContext();
  const journey = getGuidedJourneyForPersona(personaId);
  const [state, setState] = useState<JourneyState | null>(null);
  const [missing, setMissing] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const current = useMemo(
    () => (journey && state?.journeyId === journey.id ? journey.steps[state.stepIndex] : null),
    [journey, state],
  );

  const persist = useCallback((next: JourneyState | null) => {
    if (typeof window === "undefined") return;
    if (!next) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const exit = useCallback(() => {
    persist(null);
    setMissing(false);
    restoreRef.current?.focus();
    restoreRef.current = null;
  }, [persist]);

  useEffect(() => {
    if (!journey) {
      if (state) exit();
      return;
    }
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as JourneyState;
      if (saved.active && saved.journeyId === journey.id) setState(saved);
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [journey, exit, state]);

  useEffect(() => {
    if (!current) return;
    if (pathname !== current.route) {
      router.push(current.route);
      const expectedRoute = current.route;
      window.setTimeout(() => {
        if (window.location.pathname !== expectedRoute) window.location.assign(expectedRoute);
      }, 350);
      return;
    }
    let attempts = 0;
    let timer: number | undefined;
    const locate = () => {
      const target = document.querySelector<HTMLElement>(`[data-journey-target="${current.targetId}"]`);
      if (!target) {
        attempts += 1;
        if (attempts < 20) timer = window.setTimeout(locate, 150);
        else setMissing(true);
        return;
      }
      setMissing(false);
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setRect(target.getBoundingClientRect());
    };
    locate();
    const onResize = () => {
      const target = document.querySelector<HTMLElement>(`[data-journey-target="${current.targetId}"]`);
      if (target) setRect(target.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [current, pathname, router]);

  useEffect(() => {
    if (!state?.active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
      if (event.key === "ArrowRight") advance();
      if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function start() {
    if (!journey) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    persist({ journeyId: journey.id, stepIndex: 0, active: true });
  }
  function advance() {
    if (!journey || !state) return;
    if (state.stepIndex >= journey.steps.length - 1) {
      exit();
      return;
    }
    persist({ ...state, stepIndex: state.stepIndex + 1 });
  }
  function back() {
    if (!state || state.stepIndex === 0) return;
    persist({ ...state, stepIndex: state.stepIndex - 1 });
  }
  function retry() {
    setMissing(false);
    setRect(null);
    setState((prev) => (prev ? { ...prev } : prev));
  }

  return (
    <>
      {journey ? (
        <button
          type="button"
          data-journey-launcher
          onClick={start}
          className="rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] px-2.5 py-1.5 text-xs font-medium text-header-fg hover:bg-[var(--color-header-control-hover)]"
        >
          Start {journey.title}
        </button>
      ) : null}
      {state?.active && current && typeof document !== "undefined"
        ? createPortal(
            <JourneyOverlay journey={journey!} current={current} state={state} rect={rect} missing={missing} onNext={advance} onBack={back} onExit={exit} onRetry={retry} onSkip={advance} />,
            document.body,
          )
        : null}
    </>
  );
}

function JourneyOverlay({
  journey,
  current,
  state,
  rect,
  missing,
  onNext,
  onBack,
  onExit,
  onRetry,
  onSkip,
}: {
  journey: GuidedJourney;
  current: GuidedJourney["steps"][number];
  state: JourneyState;
  rect: DOMRect | null;
  missing: boolean;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const overlayHeightBudget = Math.min(400, window.innerHeight - 32);
  const top = rect
    ? Math.max(
        16,
        Math.min(
          window.innerHeight - overlayHeightBudget - 16,
          Math.max(72, rect.bottom + 14),
        ),
      )
    : 16;
  const left = rect ? Math.min(window.innerWidth - 360, Math.max(16, rect.left)) : 16;
  return (
    <div className="fixed inset-0 z-[80]" aria-label="Guided role journey">
      {rect ? <div className="pointer-events-none fixed rounded-md border-2 border-brand shadow-[0_0_0_9999px_rgba(9,30,66,0.34)]" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} /> : <div className="fixed inset-0 bg-slate-950/35" />}
      <section role="dialog" aria-modal="true" aria-labelledby="journey-title" className="absolute max-h-[calc(100vh-2rem)] w-[min(340px,calc(100vw-32px))] overflow-y-auto rounded-md border border-border bg-surface p-4 shadow-panel" style={{ left, top }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-text">{journey.title}</div>
            <h2 id="journey-title" className="mt-1 text-base font-semibold text-text-primary">{missing ? "Step unavailable" : current.title}</h2>
          </div>
          <button type="button" aria-label="Exit guided journey" onClick={onExit} className="text-sm text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="mt-2 text-xs text-text-muted">Step {state.stepIndex + 1} of {journey.steps.length} · {journey.durationLabel}</div>
        {missing ? (
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            <p>This walkthrough step is unavailable on the current screen.</p>
            <div className="flex gap-2"><button type="button" onClick={onRetry} className="rounded border border-border px-2.5 py-1.5 font-medium">Retry</button><button type="button" onClick={onSkip} className="rounded border border-border px-2.5 py-1.5 font-medium">Skip step</button></div>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3 text-sm">
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">What you are seeing</div><p className="mt-1 text-text-secondary">{current.what}</p></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Why it matters</div><p className="mt-1 text-text-secondary">{current.why}</p></div>
              {current.outcome ? <p className="rounded border border-brand bg-brand-subtle px-2.5 py-2 text-xs font-medium text-brand-text">{current.outcome}</p> : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={onExit} className="text-xs text-text-muted hover:text-text-primary">Explore myself</button>
              <div className="flex gap-2"><button type="button" onClick={onBack} disabled={state.stepIndex === 0} className="rounded border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40">Back</button><button type="button" onClick={onNext} className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white">{state.stepIndex === journey.steps.length - 1 ? "Finish" : "Next"}</button></div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
