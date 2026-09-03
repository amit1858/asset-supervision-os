import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ANCHOR_NOW } from "@/data/constants";
import { personaCan } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import { makeEnvelope, type ValueEnvelope } from "./envelope";
import type { EventActor, GovernedEvent, GovernedEventType } from "./events";
import { toPersistableEvents } from "./event-log";
import type { CapabilityResolver } from "./authority";
import { authorizationPolicyRef, AUTHORITY_WORKFLOW_POLICY_VERSION } from "./authority-policy";
import {
  caseAggregate,
  caseTrail,
  openCase,
  recordGovernedDecision,
  recordGovernedFact,
  replayCase,
  type GovernedCase,
  type HumanCommandContext,
  type SystemCommandContext,
} from "./governed-case";

/**
 * Slice 2.2 — the governed case: unavoidable authority, atomic audit and
 * deterministic replay for the K-201 intervention.
 */

const ANCHOR = ANCHOR_NOW;
const INIT = { aggregateId: "agg-k201", assetId: "K-201" };

const DESCRIPTOR = {
  mode: "demonstration_unrestricted" as const,
  policy: authorizationPolicyRef(),
  label: "Demonstration — unrestricted persona switching",
};

/** Real capability resolution: any persona may be assumed (demonstration). */
const RESOLVER: CapabilityResolver = {
  canAssume: () => true,
  personaHolds: (personaId, capability) => personaCan(personaId, capability),
};

function envelope(value: number): ValueEnvelope<number> {
  return makeEnvelope<number>({
    id: `value.k201.value-at-stake.${ANCHOR}.${value}`,
    value,
    provenance: "deterministic",
    sourceMode: "local",
    freshness: "fresh",
    formulaVersion: "value-at-stake.v1",
    asOf: ANCHOR,
    capturedAt: ANCHOR,
    producedAt: ANCHOR,
    createdByEventId: "evt-seed",
  });
}

function factEvent(
  sequence: number,
  type: GovernedEventType,
  payload: unknown,
  actor: EventActor = { kind: "system", systemId: "engine" },
): GovernedEvent {
  return {
    eventId: `evt-${sequence}`,
    aggregateId: INIT.aggregateId,
    sequence,
    occurredAt: ANCHOR,
    asOf: ANCHOR,
    actor,
    type,
    payload,
  } as GovernedEvent;
}

function systemCtx(requestId: string): SystemCommandContext {
  return {
    kind: "system",
    systemId: "engine",
    attemptedAt: ANCHOR,
    asOf: ANCHOR,
    requestId,
  };
}

function humanCtx(
  personaId: PersonaId,
  principalId: string,
  requestId: string,
): HumanCommandContext {
  return {
    kind: "human",
    principalId,
    personaId,
    authorization: DESCRIPTOR,
    attemptedAt: ANCHOR,
    asOf: ANCHOR,
    requestId,
  };
}

/** Signal → assessment → recommendation: the case at DECISION_PROPOSED. */
function proposedCase(): GovernedCase {
  let c = openCase(INIT);
  c = recordGovernedFact(
    c,
    systemCtx("req-sig"),
    factEvent(
      1,
      "ConditionSignalIngested",
      { signalId: "sig-1", assetId: "K-201", capturedAt: ANCHOR, readingIds: ["r-1"] },
      { kind: "system", systemId: "condition-feed" },
    ),
  ).case;
  c = recordGovernedFact(
    c,
    systemCtx("req-assess"),
    factEvent(2, "AssessmentComputed", {
      assessmentId: "assess-1",
      assetId: "K-201",
      valueAtStake: envelope(1_620_156),
    }),
  ).case;
  c = recordGovernedFact(
    c,
    systemCtx("req-rec"),
    factEvent(3, "RecommendationGenerated", {
      recommendationId: "rec-1",
      assessmentId: "assess-1",
    }),
  ).case;
  return c;
}

function approvedCase(): { case: GovernedCase; approvalEventId: string } {
  const approve = recordGovernedDecision(
    proposedCase(),
    humanCtx("reliability_manager", "p-rm", "req-approve"),
    {
      act: "approve",
      payload: { decisionId: "dec-1", recommendationId: "rec-1" },
      rationale: "Approve: exposure and evidence support intervention.",
    },
    RESOLVER,
  );
  expect(approve.outcome).toBe("committed");
  return { case: approve.case, approvalEventId: approve.eventId as string };
}

// ---------------------------------------------------------------------------

describe("RM → PM golden path", () => {
  it("commits an approval that requires endorsement, then a PM endorsement", () => {
    const { case: approved, approvalEventId } = approvedCase();
    expect(caseAggregate(approved).snapshot?.decisionStatus).toBe("pending_endorsement");

    const endorse = recordGovernedDecision(
      approved,
      humanCtx("plant_manager", "p-pm", "req-endorse"),
      {
        act: "endorse",
        payload: { endorsementId: "end-1", decisionId: "dec-1", approvalEventId },
        rationale: "Endorse: high-exposure decision reviewed.",
      },
      RESOLVER,
    );
    expect(endorse.outcome).toBe("committed");
    expect(caseAggregate(endorse.case).snapshot?.decisionStatus).toBe("recorded");

    // Exactly one committed audit per accepted governed event.
    const committed = caseTrail(endorse.case).filter((r) => r.result === "committed");
    const events = caseAggregate(endorse.case).events.length;
    expect(committed).toHaveLength(events);
  });

  it("records the policy reference and versioned proof on each decision audit", () => {
    const { case: approved } = approvedCase();
    const record = caseTrail(approved).find(
      (r) => r.action.kind === "decision" && r.result === "committed",
    );
    expect(record?.policyRef?.version).toBe(AUTHORITY_WORKFLOW_POLICY_VERSION);
    expect(record?.actor.kind).toBe("human");
  });
});

describe("separation of duties", () => {
  it("rejects the Plant Manager approving, and keeps lifecycle unchanged", () => {
    const proposed = proposedCase();
    const before = JSON.stringify(toPersistableEvents(caseAggregate(proposed)));
    const result = recordGovernedDecision(
      proposed,
      humanCtx("plant_manager", "p-pm", "req-pm-approve"),
      {
        act: "approve",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "PM attempts to approve.",
      },
      RESOLVER,
    );
    expect(result.outcome).toBe("rejected");
    expect(result.rejectionReason).toBe("persona_not_allowed_for_act");
    // Rejected attempt is retained as audit evidence, lifecycle untouched.
    expect(result.auditRecord?.result).toBe("rejected");
    expect(JSON.stringify(toPersistableEvents(caseAggregate(result.case)))).toBe(before);
  });

  it("prevents the approver from endorsing their own decision", () => {
    const { case: approved, approvalEventId } = approvedCase();
    const selfEndorse = recordGovernedDecision(
      approved,
      humanCtx("plant_manager", "p-rm", "req-self-endorse"),
      {
        act: "endorse",
        payload: { endorsementId: "end-1", decisionId: "dec-1", approvalEventId },
        rationale: "Same principal tries to endorse.",
      },
      RESOLVER,
    );
    expect(selfEndorse.outcome).toBe("rejected");
    expect(selfEndorse.rejectionReason).toBe("self_endorsement_forbidden");
    expect(caseAggregate(selfEndorse.case).snapshot?.decisionStatus).toBe("pending_endorsement");
  });
});

describe("terminal decline and explicit return-for-rework", () => {
  it("declines terminally", () => {
    const decline = recordGovernedDecision(
      proposedCase(),
      humanCtx("reliability_manager", "p-rm", "req-decline"),
      {
        act: "decline",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "Decline: not justified.",
      },
      RESOLVER,
    );
    expect(decline.outcome).toBe("committed");
    expect(caseAggregate(decline.case).snapshot?.decisionStatus).toBe("rejected");
  });

  it("returns for rework as a distinct, non-terminal path", () => {
    const returned = recordGovernedDecision(
      proposedCase(),
      humanCtx("reliability_manager", "p-rm", "req-return"),
      {
        act: "return",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "Return: strengthen the evidence.",
      },
      RESOLVER,
    );
    expect(returned.outcome).toBe("committed");
    expect(caseAggregate(returned.case).snapshot?.decisionStatus).toBe("returned_for_rework");
  });
});

describe("outcome validation requires recorded evidence", () => {
  function endorsedThroughExecution(): GovernedCase {
    const { case: approved, approvalEventId } = approvedCase();
    let c = recordGovernedDecision(
      approved,
      humanCtx("plant_manager", "p-pm", "req-endorse2"),
      {
        act: "endorse",
        payload: { endorsementId: "end-1", decisionId: "dec-1", approvalEventId },
        rationale: "Endorse.",
      },
      RESOLVER,
    ).case;
    c = recordGovernedFact(
      c,
      systemCtx("req-wo"),
      factEvent(6, "WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" }),
    ).case;
    c = recordGovernedFact(
      c,
      systemCtx("req-materials"),
      factEvent(7, "MaterialsChecked", {
        checkId: "chk-1",
        workOrderId: "wo-1",
        partIds: ["p-1"],
      }),
    ).case;
    c = recordGovernedFact(
      c,
      systemCtx("req-scope"),
      factEvent(8, "TurnaroundScopeRetained", { scopeId: "scope-1", workOrderId: "wo-1" }),
    ).case;
    c = recordGovernedFact(
      c,
      systemCtx("req-exec"),
      factEvent(9, "WorkExecuted", { executionId: "exec-1", workOrderId: "wo-1" }),
    ).case;
    return c;
  }

  it("rejects validate_outcome before evidence is recorded, as audit evidence", () => {
    const c = endorsedThroughExecution();
    const result = recordGovernedDecision(
      c,
      humanCtx("reliability_manager", "p-rm", "req-validate-early"),
      {
        act: "validate_outcome",
        payload: { outcomeId: "out-1", evidenceRecordId: "ev-1" },
        rationale: "Validate too early.",
      },
      RESOLVER,
    );
    expect(result.outcome).toBe("rejected");
    expect(result.auditRecord?.result).toBe("rejected");
  });

  it("commits validate_outcome once evidence exists", () => {
    let c = endorsedThroughExecution();
    c = recordGovernedFact(
      c,
      systemCtx("req-evidence"),
      factEvent(10, "OutcomeEvidenceRecorded", {
        evidenceRecordId: "ev-1",
        executionId: "exec-1",
        evidenceIds: ["e-1"],
      }),
    ).case;
    const result = recordGovernedDecision(
      c,
      humanCtx("reliability_manager", "p-rm", "req-validate"),
      {
        act: "validate_outcome",
        payload: { outcomeId: "out-1", evidenceRecordId: "ev-1" },
        rationale: "Validate: evidence recorded.",
      },
      RESOLVER,
    );
    expect(result.outcome).toBe("committed");
    expect(caseAggregate(result.case).snapshot?.outcomeValidationStatus).toBe("confirmed");
  });
});

describe("idempotency", () => {
  it("returns the original result on identical retry without a second event or audit", () => {
    const { case: approved } = approvedCase();
    const trailBefore = caseTrail(approved).length;
    const seqBefore = caseAggregate(approved).snapshot?.lastSequence;

    const retry = recordGovernedDecision(
      approved,
      humanCtx("reliability_manager", "p-rm", "req-approve"),
      {
        act: "approve",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "Approve: exposure and evidence support intervention.",
      },
      RESOLVER,
    );
    expect(retry.outcome).toBe("idempotent");
    expect(caseTrail(retry.case).length).toBe(trailBefore);
    expect(caseAggregate(retry.case).snapshot?.lastSequence).toBe(seqBefore);
  });

  it("fails closed when a request id is reused with different content", () => {
    const { case: approved } = approvedCase();
    const collision = recordGovernedDecision(
      approved,
      humanCtx("reliability_manager", "p-rm", "req-approve"),
      {
        act: "approve",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "A DIFFERENT rationale for the same request id.",
      },
      RESOLVER,
    );
    expect(collision.outcome).toBe("conflict");
    expect(collision.rejectionReason).toBe("request_id_conflict");
  });
});

describe("attribution and rejected fact evidence", () => {
  it("distinguishes system facts from human decisions in the audit trail", () => {
    const { case: approved } = approvedCase();
    const trail = caseTrail(approved);
    const fact = trail.find((r) => r.action.kind === "fact");
    const decision = trail.find((r) => r.action.kind === "decision");
    expect(fact?.actor.kind).toBe("system");
    expect(decision?.actor.kind).toBe("human");
    if (decision?.actor.kind === "human") {
      expect(decision.actor.principalId).toBe("p-rm");
      expect(decision.actor.personaId).toBe("reliability_manager");
    }
  });

  it("audits a well-formed but rejected fact attempt without changing lifecycle", () => {
    const proposed = proposedCase();
    const before = JSON.stringify(toPersistableEvents(caseAggregate(proposed)));
    // A work order cannot be planned while the decision is only proposed.
    const result = recordGovernedFact(
      proposed,
      systemCtx("req-bad-wo"),
      factEvent(4, "WorkOrderPlanned", { workOrderId: "wo-1", decisionId: "dec-1" }),
    );
    expect(result.outcome).toBe("rejected");
    expect(result.auditRecord?.result).toBe("rejected");
    expect(result.auditRecord?.action).toEqual({ kind: "fact", eventType: "WorkOrderPlanned" });
    expect(JSON.stringify(toPersistableEvents(caseAggregate(result.case)))).toBe(before);
  });
});

describe("replay", () => {
  function fullCase(): GovernedCase {
    const { case: approved, approvalEventId } = approvedCase();
    return recordGovernedDecision(
      approved,
      humanCtx("plant_manager", "p-pm", "req-endorse3"),
      {
        act: "endorse",
        payload: { endorsementId: "end-1", decisionId: "dec-1", approvalEventId },
        rationale: "Endorse for replay.",
      },
      RESOLVER,
    ).case;
  }

  it("rebuilds byte-identical events and trail", () => {
    const original = fullCase();
    const events = toPersistableEvents(caseAggregate(original));
    const audits = caseTrail(original);
    const replayed = replayCase(INIT, events, audits, RESOLVER);
    expect(replayed.outcome).toBe("replayed");
    if (replayed.outcome !== "replayed") return;
    expect(JSON.stringify(toPersistableEvents(caseAggregate(replayed.case)))).toBe(
      JSON.stringify(events),
    );
    expect(JSON.stringify(caseTrail(replayed.case))).toBe(JSON.stringify(audits));
  });

  it("reconstructs the idempotency index so a retry after replay is idempotent", () => {
    const original = fullCase();
    const events = toPersistableEvents(caseAggregate(original));
    const audits = caseTrail(original);
    const replayed = replayCase(INIT, events, audits, RESOLVER);
    if (replayed.outcome !== "replayed") throw new Error("expected replay");

    const retry = recordGovernedDecision(
      replayed.case,
      humanCtx("reliability_manager", "p-rm", "req-approve"),
      {
        act: "approve",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "Approve: exposure and evidence support intervention.",
      },
      RESOLVER,
    );
    expect(retry.outcome).toBe("idempotent");
  });

  it("fails replay closed when a committed decision audit names a stale policy version", () => {
    const original = fullCase();
    const events = toPersistableEvents(caseAggregate(original));
    const audits = caseTrail(original).map((r) =>
      r.action.kind === "decision" && r.result === "committed" && r.policyRef
        ? { ...r, policyRef: { ...r.policyRef, version: "v2-authority-workflow.v0" } }
        : r,
    );
    const replayed = replayCase(INIT, events, audits, RESOLVER);
    expect(replayed.outcome).toBe("rejected");
    if (replayed.outcome === "rejected") {
      expect(replayed.reason).toBe("policy_version_mismatch");
    }
  });

  it("fails replay closed when a committed decision audit cites a missing event", () => {
    const original = fullCase();
    const events = toPersistableEvents(caseAggregate(original));
    const audits = caseTrail(original).map((r) =>
      r.action.kind === "decision" && r.result === "committed"
        ? { ...r, resultingEventId: "evt-does-not-exist" }
        : r,
    );
    const replayed = replayCase(INIT, events, audits, RESOLVER);
    expect(replayed.outcome).toBe("rejected");
    if (replayed.outcome === "rejected") {
      expect(replayed.reason).toBe("missing_audit_proof");
    }
  });
});

describe("determinism", () => {
  it("reads no clock and no random source", () => {
    for (const file of ["governed-case.ts", "audit.ts", "authority.ts", "authority-policy.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toContain("Date.now(");
      expect(source, file).not.toContain("Math.random(");
      expect(source, file).not.toContain("new Date()");
      expect(source, file).not.toContain("performance.now(");
    }
  });

  it("rejects a structurally malformed request before it becomes audit evidence", () => {
    const proposed = proposedCase();
    const trailBefore = caseTrail(proposed).length;
    const bad = recordGovernedDecision(
      proposed,
      { ...humanCtx("reliability_manager", "p-rm", "req-bad"), attemptedAt: "not-a-timestamp" },
      {
        act: "approve",
        payload: { decisionId: "dec-1", recommendationId: "rec-1" },
        rationale: "Malformed attempt time.",
      },
      RESOLVER,
    );
    expect(bad.outcome).toBe("malformed");
    expect(bad.auditRecord).toBeNull();
    expect(caseTrail(bad.case).length).toBe(trailBefore);
  });
});
