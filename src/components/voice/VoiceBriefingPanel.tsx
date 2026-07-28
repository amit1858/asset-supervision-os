"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useVoice } from "@/voice/VoiceContext";
import { VOICE_STATE_LABEL } from "@/voice/session";
import type { ProposedVoiceAction, VoiceEvidenceReference, VoiceTurn } from "@/voice/types";
import { Icon } from "@/components/layout/icons";
import { RestrictedAction } from "@/components/ui/CapabilityGate";
import { PROVENANCE } from "@/design-system/status";
import { CAPABILITIES } from "@/personas/capabilities";
import { cn } from "@/lib/cn";

/**
 * VoiceBriefingPanel — a governed conversational assistant over the Chief of
 * Staff brief. Docks beside the workspace at ≥1280px (content reflows, nothing
 * covered); below that it is a modal overlay with a scrim, focus trap, Escape
 * to close, and focus return. Voice never approves or executes — proposed
 * actions route to the existing governed approval control.
 */
export function VoiceBriefingPanel() {
  const voice = useVoice();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const docked = useMinWidth(1280);
  const modal = voice.isOpen && !docked;

  useEffect(() => {
    if (voice.isOpen) inputRef.current?.focus();
  }, [voice.isOpen]);

  // Selecting the (unconnected) mic returns focus to the text input.
  useEffect(() => {
    if (voice.micNotice) inputRef.current?.focus();
  }, [voice.micNotice]);

  // Keep the latest turn (incl. a proposed action) scrolled into view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [voice.turns.length]);

  if (!voice.isOpen) return null;

  const sd = voice.scopeDisplay;
  const last = voice.turns[voice.turns.length - 1];
  const announcement =
    voice.state === "thinking"
      ? "Working on your question"
      : voice.state === "error"
        ? "Something went wrong"
        : last?.role === "assistant"
          ? "Response ready"
          : "Ready";

  const submit = () => {
    if (!text.trim()) return;
    voice.ask(text, "text");
    setText("");
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      voice.close();
      return;
    }
    if (!modal || e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (!nodes || nodes.length === 0) return;
    const focusable = Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
    const first = focusable[0]!;
    const lastEl = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {modal ? (
        <button data-voice-scrim aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default bg-overlay" onClick={voice.close} />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal}
        aria-labelledby="voice-panel-title"
        onKeyDown={onKeyDown}
        className={cn(
          "fixed z-50 flex w-full flex-col border-l border-border bg-surface shadow-panel",
          modal ? "right-0 top-0 h-dvh max-w-[400px]" : "right-0 max-w-[400px]",
        )}
        style={modal ? undefined : { top: "var(--shell-header-h)", height: "calc(100dvh - var(--shell-header-h))" }}
      >
        {/* Header (fixed) */}
        <div className="flex items-start justify-between gap-2 border-b border-border bg-elevated px-4 py-3">
          <div className="min-w-0">
            <h2 id="voice-panel-title" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <Icon name="voice" size={16} className="text-brand" />
              Ask Asset Supervision OS
              <span
                className="rounded bg-neutralstatus-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutralstatus-text"
                title="Demo conversation · Audio is not recorded"
              >
                Demo
              </span>
            </h2>
            <p className="mt-0.5 text-xs font-medium text-text-secondary">{sd.personaName}</p>
            <p className="text-[11px] text-text-muted">Demo conversation · Audio is not recorded</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Stop" title="Stop" onClick={voice.stop} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface">
              <Icon name="stop" size={16} />
            </button>
            <button type="button" aria-label="Close assistant" title="Close" onClick={voice.close} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Scope (business-readable) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border bg-surface px-4 py-1.5 text-[11px] text-text-muted">
          <span>{sd.plantName}</span>
          {sd.unitName ? <span>{sd.unitName}</span> : null}
          {sd.assetTag ? <span className="font-medium text-brand-text">Asset {sd.assetTag}</span> : null}
          <span>{sd.timeRangeLabel}</span>
          <span>{sd.freshnessLabel}</span>
          <span className="ml-auto"><StatusChip state={voice.state} /></span>
        </div>
        <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

        {/* Transcript (independent scroll, padded so the last item clears the composer) */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-3 pb-6">
          {voice.turns.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Ask for your role-specific update or discuss the current operational context. Every
              answer is grounded in your evidence-backed brief.
            </p>
          ) : (
            voice.turns.map((t) => <TurnView key={t.id} turn={t} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Mic notice (honest: not connected) */}
        {voice.micNotice ? (
          <div role="status" className="border-t border-border bg-attention-subtle px-4 py-2 text-[11px] text-attention-text">
            Voice capture is not connected in this demonstration. Choose a suggested question or type below.
          </div>
        ) : null}

        {/* Suggestions (anchored) */}
        <div className="border-t border-border bg-surface px-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            {voice.suggestions.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => voice.pickSuggestion(i, "text")}
                className="rounded border border-border bg-canvas px-2 py-1 text-left text-[11px] text-text-secondary hover:bg-elevated hover:text-text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Composer (anchored) */}
        <div className="border-t border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Voice capture (demo — not connected)"
              title="Voice capture — demo, not connected"
              onClick={voice.useMic}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:bg-elevated"
            >
              <Icon name="mic" size={18} />
            </button>
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Type your question"
                placeholder="Type your question…"
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
              />
              <button type="submit" aria-label="Send" title="Send" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-text-inverted hover:bg-brand-hover">
                <Icon name="send" size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function useMinWidth(px: number): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(min-width:${px}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${px}px)`);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return match;
}

function StatusChip({ state }: { state: string }) {
  const busy = state === "thinking" || state === "transcribing" || state === "responding";
  const bad = state === "permission_denied" || state === "unavailable" || state === "offline" || state === "error";
  const cls = bad
    ? "border-attention-border bg-attention-subtle text-attention-text"
    : busy
      ? "border-info-border bg-info-subtle text-info-text"
      : "border-border bg-surface text-text-secondary";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium", cls)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {VOICE_STATE_LABEL[state as keyof typeof VOICE_STATE_LABEL]}
    </span>
  );
}

function TurnView({ turn }: { turn: VoiceTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-md rounded-tr-sm border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-text-primary">
          {turn.text}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-sm text-text-primary">{turn.text}</p>

      {turn.unavailableNote ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-attention-text">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-attention" />
          Unavailable from current sources: {turn.unavailableNote}
        </p>
      ) : null}

      {turn.evidence.length > 0 ? <EvidenceList evidence={turn.evidence} /> : null}

      {turn.provenanceKinds.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-muted">
          <span className="uppercase tracking-wide">Basis:</span>
          {turn.provenanceKinds.map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", PROVENANCE[p].dotClass)} aria-hidden />
              {PROVENANCE[p].label}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-1 text-[10px] text-text-muted">
        {turn.sources.map((s) => s.label).slice(0, 1).join("")} · {turn.sources.length} source
        {turn.sources.length === 1 ? "" : "s"} referenced
      </p>

      {turn.proposedAction ? <ProposedAction action={turn.proposedAction} /> : null}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: VoiceEvidenceReference[] }) {
  return (
    <details className="group mt-1.5">
      <summary className="cursor-pointer text-[11px] font-medium text-brand-text marker:content-none">
        <span className="inline-flex items-center gap-1">
          <Icon name="chevron-down" size={12} className="transition-transform group-open:rotate-180" />
          Evidence ({evidence.length})
        </span>
      </summary>
      <ul className="mt-1 space-y-1">
        {evidence.map((e, i) => {
          const meta = PROVENANCE[e.provenance];
          const inner = (
            <span className="flex items-start gap-1.5" title={`${e.value} (${meta.label})`}>
              <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", meta.dotClass)} aria-hidden />
              <span>
                <span className="text-text-primary">{e.label}:</span>{" "}
                <span className="text-text-secondary">{e.value}</span>
              </span>
            </span>
          );
          return (
            <li key={i} className="text-[11px]">
              {e.href ? <Link href={e.href} className="hover:underline">{inner}</Link> : inner}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ProposedAction({ action }: { action: ProposedVoiceAction }) {
  const cap = CAPABILITIES[action.requiredCapability];
  return (
    <div className="mt-2 rounded border border-attention-border bg-canvas px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-attention-text">
        <Icon name="alert" size={12} /> Proposed action — requires confirmation
      </div>
      <div className="mt-0.5 text-sm font-medium text-text-primary">{action.title}</div>
      <dl className="mt-1 space-y-0.5 text-[11px] text-text-secondary">
        <div>Target: {action.targetType}{action.targetId ? ` · ${action.targetId}` : ""}</div>
        <div>Consequence: {action.consequence}</div>
        <div>Authority required: {cap.label}</div>
      </dl>
      <div className="mt-2">
        <RestrictedAction capability={action.requiredCapability}>
          {action.href ? (
            <Link
              href={action.href}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
              className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-semibold text-text-primary hover:bg-elevated"
            >
              Review and confirm →
            </Link>
          ) : (
            <span className="text-xs text-text-muted">Open the record to confirm.</span>
          )}
        </RestrictedAction>
      </div>
      <p className="mt-1 text-[10px] text-text-muted">
        The assistant cannot approve or change anything — confirm through the governed approval control.
      </p>
    </div>
  );
}
