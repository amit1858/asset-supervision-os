"use client";

import { useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Drawer } from "./Drawer";
import { CaseWalkthrough } from "./case-walkthrough";
import {
  AGENT_QUESTIONS,
  type AgentQuestionId,
  type GovernedAgentResponse,
} from "@/agent/types";
import { useModelConnection } from "@/components/auth/ModelConnectionProvider";

/**
 * K-201 governed Case Investigator — the single canonical agent surface.
 *
 * This is the ONLY agent client the browser loads. It renders a prominent,
 * above-the-fold launch action beside the reliability assessment and opens an
 * accessible drawer that reuses the existing governed API, types, questions,
 * citation validation and deterministic fallback — reorganised into the
 * Signal → Evidence → Risk → Recommendation → Human authority thread.
 *
 * It imports ONLY the client-safe contract (`@/agent/types`) and pure
 * presentation; it never imports a server module, read model, provider or the
 * authority-mutation seam. It is strictly read-only and never opens on its own.
 */

const PRIMARY_QUESTION_ID: AgentQuestionId = "why_action_now";
const PRIMARY_QUESTION =
  AGENT_QUESTIONS.find((q) => q.id === PRIMARY_QUESTION_ID) ?? AGENT_QUESTIONS[0]!;
const SECONDARY_QUESTIONS = AGENT_QUESTIONS.filter(
  (q) => q.id !== PRIMARY_QUESTION_ID,
);

type CaseState =
  | { kind: "idle" }
  | { kind: "loading"; questionId: AgentQuestionId }
  | { kind: "error"; questionId: AgentQuestionId }
  | { kind: "ready"; response: GovernedAgentResponse };

export function K201CaseInvestigator() {
  const { connection, getProviderHeaders } = useModelConnection();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CaseState>({ kind: "idle" });
  // A monotonic request token: only the newest in-flight request may commit its
  // result, so a superseded response can never overwrite a newer one.
  const requestToken = useRef(0);
  const inFlight = useRef(false);
  const titleId = useId();

  const ask = useCallback(async (questionId: AgentQuestionId) => {
    // Prevent a duplicate in-flight request — the same or another question
    // cannot be launched until the current one settles.
    if (inFlight.current) return;
    inFlight.current = true;
    const token = ++requestToken.current;
    setState({ kind: "loading", questionId });
    try {
      const res = await fetch("/api/agent/k201-case", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...getProviderHeaders(),
        },
        body: JSON.stringify({ questionId }),
      });
      if (token !== requestToken.current) return;
      if (!res.ok) {
        setState({ kind: "error", questionId });
        return;
      }
      const response = (await res.json()) as GovernedAgentResponse;
      if (token !== requestToken.current) return;
      setState({ kind: "ready", response });
    } catch {
      if (token === requestToken.current) setState({ kind: "error", questionId });
    } finally {
      if (token === requestToken.current) inFlight.current = false;
    }
  }, [getProviderHeaders]);

  const openInvestigator = useCallback(() => {
    setOpen(true);
  }, []);

  const closeInvestigator = useCallback(() => setOpen(false), []);

  const activeQuestion =
    state.kind === "loading" ? state.questionId : undefined;
  const readyQuestion =
    state.kind === "ready" ? state.response.questionId : undefined;
  const isLoading = state.kind === "loading";

  return (
    <section data-journey-target="k201-investigator-launcher" className="rounded-md border border-border bg-surface shadow-subtle">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Governed Case Investigator · Read-only
          </div>
          <h3 className="mt-1 text-base font-semibold text-text-primary">
            Investigate K-201 with AI
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Trace the governed evidence behind this decision.
          </p>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-text-muted">
            Every claim is cited, routed to human authority and never acted on
            by the agent.
          </p>
          <p className="mt-2 text-[11px] font-medium text-text-secondary">
            Investigation path: Signal → Evidence → Risk → Recommendation →
            Human authority
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Primary investigation: Why act now? ·{" "}
            {connection.status === "connected"
              ? "NVIDIA-assisted narration is connected; governed fallback remains active."
              : "governed deterministic narration is active."}
          </p>
        </div>
        <button
          type="button"
          onClick={openInvestigator}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "shrink-0 rounded-md border border-brand bg-brand px-3.5 py-2 text-sm font-semibold text-text-inverted",
            "hover:bg-brand-hover",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          )}
        >
          Investigate with AI
        </button>
      </div>

      <Drawer
        open={open}
        onClose={closeInvestigator}
        titleId={titleId}
        title="Governed Case Investigator — K-201"
        subtitle="Signal → Evidence → Risk → Recommendation → Human authority"
      >
        <div className="space-y-5">
          <div className="border-b border-border pb-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Choose an investigation
            </div>
            <button
              type="button"
              onClick={() => ask(PRIMARY_QUESTION_ID)}
              disabled={isLoading}
              aria-pressed={
                PRIMARY_QUESTION_ID === activeQuestion ||
                PRIMARY_QUESTION_ID === readyQuestion
              }
              className={cn(
                "w-full rounded-md border px-3.5 py-3 text-left text-sm font-semibold transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                PRIMARY_QUESTION_ID === activeQuestion ||
                  PRIMARY_QUESTION_ID === readyQuestion
                  ? "border-brand bg-brand-subtle text-brand-text"
                  : "border-brand bg-surface text-brand-text hover:bg-brand-subtle",
                isLoading && "opacity-60",
              )}
            >
              {PRIMARY_QUESTION.label}
              <span className="mt-0.5 block text-[11px] font-normal text-text-muted">
                Start here — the governed case for acting now.
              </span>
            </button>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {SECONDARY_QUESTIONS.map((q) => {
                const selected =
                  q.id === activeQuestion || q.id === readyQuestion;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => ask(q.id)}
                    disabled={isLoading}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      selected
                        ? "border-brand bg-brand-subtle text-brand-text"
                        : "border-border bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
                      isLoading && !selected && "opacity-60",
                    )}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {state.kind === "idle" ? (
              <p className="text-sm text-text-muted">
                Choose a question to open the governed K-201 case.
              </p>
            ) : null}
            {state.kind === "loading" ? (
              <p className="text-sm text-text-secondary" role="status">
                Investigating governed evidence…
              </p>
            ) : null}
            {state.kind === "error" ? (
              <div role="alert" className="space-y-2">
                <p className="text-sm text-critical-text">
                  The governed investigator could not respond.
                </p>
                <button
                  type="button"
                  onClick={() => ask(state.questionId)}
                  className={cn(
                    "rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-text-primary",
                    "hover:border-border-strong",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  )}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {state.kind === "ready" ? (
              <CaseWalkthrough response={state.response} />
            ) : null}
          </div>
        </div>
      </Drawer>
    </section>
  );
}
