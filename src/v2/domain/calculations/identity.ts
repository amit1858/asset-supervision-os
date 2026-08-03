import type { RecomputeRequestKind } from "../recompute";
import {
  scopeIdentityParts,
  subjectIdentityParts,
  type CalculationSubject,
  type LedgerScope,
} from "./subject";

/**
 * Slice 2.1c — deterministic, collision-safe calculation identity.
 *
 * Every identity in the ledger is a pure function of the governed facts that
 * justify it. There is no UUID, no counter, no clock and no random source, so a
 * replay on another machine reconstructs byte-identical identities.
 *
 * Keys are built with NETSTRING component encoding (`<length>:<value>,`) rather
 * than delimiter concatenation. Naive joining is not injective — `["a:b", "c"]`
 * and `["a", "b:c"]` collapse to the same string — and a collision between two
 * different subjects would let one calculation silently supersede another's
 * head. Length-prefixing every component, INCLUDING the scheme, makes the
 * encoding injective for arbitrary strings: delimiters, colons, commas, pipes,
 * newlines and empty strings are all safe.
 *
 * No hashing is used. The keys are long but exactly reversible, which keeps a
 * rejected identity diagnosable instead of opaque.
 *
 * `asOf` is deliberately NOT part of the request id. A request id identifies
 * WHICH governed question was asked; the evaluation instant is bound to the
 * governed request itself, so the same triggering event arriving with a
 * different `asOf` is an identity conflict, not a new question and not a valid
 * supersession.
 */

/** Identity of one calculation attempt. Derived, never minted randomly. */
export type CalculationId = string;
/** Identity of the governed question a calculation answers. */
export type CalculationRequestId = string;
/** `kind` + subject identity: the slot whose head a produced result advances. */
export type CalculationSlot = string;

function encodeComponent(part: string): string {
  if (typeof part !== "string") {
    throw new TypeError(
      `A canonical key component must be a string; received ${typeof part}.`,
    );
  }
  return `${part.length}:${part},`;
}

/**
 * Injective canonical key over an ordered component list.
 *
 * The scheme is encoded as the first component, so two different schemes can
 * never produce the same key regardless of their content.
 */
export function canonicalKey(scheme: string, parts: readonly string[]): string {
  if (typeof scheme !== "string" || scheme.trim() === "") {
    throw new TypeError("A canonical key requires a non-empty scheme.");
  }
  if (!Array.isArray(parts)) {
    throw new TypeError("A canonical key requires an array of components.");
  }
  let key = encodeComponent(scheme);
  for (const part of parts) key += encodeComponent(part);
  return key;
}

export function subjectKey(subject: CalculationSubject): string {
  const parts = subjectIdentityParts(subject);
  if (parts === null) {
    throw new TypeError(
      "A calculation subject requires every identity component to be non-empty.",
    );
  }
  return canonicalKey("subject", [subject.kind, ...parts]);
}

export function ledgerScopeKeyOf(scope: LedgerScope): string {
  const parts = scopeIdentityParts(scope);
  if (parts === null) {
    throw new TypeError(
      "A ledger scope requires every identity component to be non-empty.",
    );
  }
  return canonicalKey("ledger_scope", [scope.kind, ...parts]);
}

export function slotKey(
  kind: RecomputeRequestKind,
  subject: CalculationSubject,
): CalculationSlot {
  return canonicalKey("slot", [kind, subjectKey(subject)]);
}

export function requestIdOf(
  kind: RecomputeRequestKind,
  subject: CalculationSubject,
  requestedByEventId: string,
): CalculationRequestId {
  if (typeof requestedByEventId !== "string" || requestedByEventId.trim() === "") {
    throw new TypeError("A calculation request requires a non-empty triggering event id.");
  }
  return canonicalKey("request", [kind, subjectKey(subject), requestedByEventId]);
}

/**
 * A calculation is one ATTEMPT at a request under one formula set. Binding the
 * formula-set version into the id is what allows a governed formula upgrade to
 * produce a genuinely new, superseding calculation for the same request and the
 * same `asOf`, while a plain retry of the same request under the same formula
 * set resolves to the same id and is idempotently ignored.
 */
export function calculationIdOf(
  requestId: CalculationRequestId,
  formulaSetVersion: string,
): CalculationId {
  if (typeof requestId !== "string" || requestId.trim() === "") {
    throw new TypeError("A calculation id requires a non-empty request id.");
  }
  if (typeof formulaSetVersion !== "string" || formulaSetVersion.trim() === "") {
    throw new TypeError("A calculation id requires a non-empty formula-set version.");
  }
  return canonicalKey("calculation", [requestId, formulaSetVersion]);
}

/** Deterministic envelope identity for one output field of one calculation. */
export function outputEnvelopeIdOf(
  calculationId: CalculationId,
  fieldName: string,
): string {
  return canonicalKey("value", [calculationId, fieldName]);
}

/**
 * Deterministic `assessmentId` for the proposal a produced asset assessment
 * offers back to the governed boundary. It is a pure function of the
 * calculation that produced it, so the same calculation always proposes the
 * same assessment identity and a duplicate proposal is recognisable.
 */
export function proposedAssessmentIdOf(calculationId: CalculationId): string {
  return canonicalKey("assessment", [calculationId]);
}
