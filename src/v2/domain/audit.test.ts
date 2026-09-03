import { describe, it, expect } from "vitest";
import {
  auditIdOf,
  buildAuditRecord,
  commandFingerprint,
  stableStringify,
  type AuditAction,
  type AuditActorRecord,
} from "./audit";
import { authorizationPolicyRef } from "./authority-policy";

/**
 * Slice 2.2 — deterministic audit identity, canonical fingerprints and frozen
 * records. No clock, no randomness.
 */

const APPROVE: AuditAction = { kind: "decision", act: "approve" };

const HUMAN_ACTOR: AuditActorRecord = {
  kind: "human",
  principalId: "p-rm",
  personaId: "reliability_manager",
  authorization: {
    mode: "demonstration_unrestricted",
    policy: authorizationPolicyRef(),
    label: "Demonstration — unrestricted persona switching",
  },
};

describe("auditIdOf", () => {
  it("is deterministic and injective in sequence", () => {
    expect(auditIdOf("agg-1", 1)).toBe(auditIdOf("agg-1", 1));
    expect(auditIdOf("agg-1", 1)).not.toBe(auditIdOf("agg-1", 2));
    expect(auditIdOf("agg-1", 1)).not.toBe(auditIdOf("agg-2", 1));
  });
});

describe("stableStringify", () => {
  it("sorts object keys so serialisation is canonical", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("preserves array order", () => {
    expect(stableStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(stableStringify([3, 2, 1])).not.toBe(stableStringify([1, 2, 3]));
  });
});

describe("commandFingerprint", () => {
  const baseInput = {
    action: APPROVE,
    payload: { decisionId: "dec-1", recommendationId: "rec-1" },
    rationale: "Approving on strong evidence.",
    principalId: "p-rm",
    personaId: "reliability_manager" as const,
    systemId: null,
    policyRef: authorizationPolicyRef(),
  };

  it("is stable across key ordering of the payload", () => {
    const a = commandFingerprint(baseInput);
    const b = commandFingerprint({
      ...baseInput,
      payload: { recommendationId: "rec-1", decisionId: "dec-1" },
    });
    expect(a).toBe(b);
  });

  it("trims rationale but distinguishes different content", () => {
    const trimmed = commandFingerprint({ ...baseInput, rationale: "  Approving on strong evidence.  " });
    const original = commandFingerprint(baseInput);
    expect(trimmed).toBe(original);
    const different = commandFingerprint({ ...baseInput, rationale: "Different reasoning." });
    expect(different).not.toBe(original);
  });

  it("changes when the principal or persona changes", () => {
    const original = commandFingerprint(baseInput);
    expect(commandFingerprint({ ...baseInput, principalId: "p-other" })).not.toBe(original);
  });
});

describe("buildAuditRecord", () => {
  it("mints a deterministic id and deep-freezes the record", () => {
    const record = buildAuditRecord({
      sequence: 1,
      aggregateId: "agg-1",
      requestId: "req-1",
      action: APPROVE,
      result: "committed",
      actor: HUMAN_ACTOR,
      attemptedAt: "2026-07-27T00:00:00.000Z",
      rationale: "Approving.",
      targetProposalId: "dec-1",
      previousDecisionStatus: "proposed",
      resultingEventId: "evt-1",
      rejectionReason: null,
      policyRef: authorizationPolicyRef(),
      fingerprint: "fp-1",
    });
    expect(record.auditId).toBe(auditIdOf("agg-1", 1));
    expect(Object.isFrozen(record)).toBe(true);
    expect(() => {
      // @ts-expect-error frozen at runtime
      record.result = "rejected";
    }).toThrow();
  });
});
