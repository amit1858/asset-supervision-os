"use client";

import { useState } from "react";
import type { RecommendedDisposition } from "@/domain/enums";
import { Button } from "./Button";
import { DISPOSITION } from "@/design-system/status";
import { cn } from "@/lib/cn";
import { useCan } from "@/context/useCan";
import { useOperationalContext } from "@/context/OperationalContext";
import { getPersona } from "@/personas/registry";

type Decision = "approved" | "rejected" | "modified";

/**
 * Human approval control. Encodes that the human — not the model — has decision
 * authority, AND that authority is capability-gated: only a persona holding
 * `approve_reliability_decision` may act; others see a read-only explanation.
 * The active persona is included in the recorded (demo) decision context. Phase
 * 3 persists it to `human_decisions` with a full audit trail.
 */
export function ApprovalControl({
  recommendationId,
  disposition,
  decidedBy = "reliability.lead@synthetic",
}: {
  recommendationId: string;
  disposition: RecommendedDisposition;
  decidedBy?: string;
}) {
  const can = useCan();
  const { personaId } = useOperationalContext();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [modified, setModified] = useState<RecommendedDisposition>(disposition);
  const [showModify, setShowModify] = useState(false);

  if (!can("approve_reliability_decision")) {
    return (
      <div className="rounded-md border border-border bg-elevated px-3 py-2.5 text-xs text-text-secondary" role="note">
        <span className="mr-1" aria-hidden>🔒</span>
        Read-only for {getPersona(personaId).displayName}. Approving a reliability decision requires
        the “Approve reliability decision” capability — route to the Reliability Manager or Plant
        Manager.
      </div>
    );
  }

  if (decision) {
    const label =
      decision === "approved"
        ? `Approved — ${DISPOSITION[disposition].label}`
        : decision === "modified"
          ? `Modified — ${DISPOSITION[modified].label}`
          : "Rejected";
    const tone =
      decision === "rejected"
        ? "border-critical-border bg-critical-subtle text-critical-text"
        : "border-healthy-border bg-healthy-subtle text-healthy-text";
    return (
      <div className={cn("rounded-md border px-3 py-2.5", tone)} role="status">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden>{decision === "rejected" ? "✕" : "☑"}</span>
          {label}
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Recorded by {getPersona(personaId).displayName} ({decidedBy}) · {recommendationId} · demo session (not persisted)
        </p>
        <button
          className="mt-1 text-xs text-brand-text underline underline-offset-2"
          onClick={() => {
            setDecision(null);
            setShowModify(false);
          }}
        >
          Reset
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="success" size="sm" onClick={() => setDecision("approved")}>
          ☑ Approve
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowModify((s) => !s)}>
          ✎ Modify
        </Button>
        <Button variant="danger" size="sm" onClick={() => setDecision("rejected")}>
          ✕ Reject
        </Button>
      </div>
      {showModify ? (
        <div className="rounded border border-border bg-elevated p-2">
          <label className="block text-xs font-medium text-text-secondary" htmlFor="disp">
            Change disposition to
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <select
              id="disp"
              className="rounded border border-border-strong bg-surface px-2 py-1 text-sm"
              value={modified}
              onChange={(e) => setModified(e.target.value as RecommendedDisposition)}
            >
              {(Object.keys(DISPOSITION) as RecommendedDisposition[]).map((d) => (
                <option key={d} value={d}>
                  {DISPOSITION[d].label}
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={() => setDecision("modified")}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-text-muted">
        A human must approve, modify, or reject. The system does not act autonomously.
      </p>
    </div>
  );
}
