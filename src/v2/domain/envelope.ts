import type { SourceMode } from "@/context/types";
import type { Provenance } from "@/domain/enums";
import type { FreshnessState } from "./freshness-state";
import { trustFromProvenance, type TrustClassification } from "./trust";

/**
 * Slice 2.1a — E1: the shared, immutable value envelope every later slice
 * consumes (technical plan §11, §12.3c, Decision 6/7).
 *
 * The envelope carries only the dimensions the governed value itself needs:
 *
 * | Field                 | Meaning                                             |
 * |-----------------------|-----------------------------------------------------|
 * | `sourceMode`          | how/where the data was sourced (`local`/`snowflake`) |
 * | `freshness`           | temporal state relative to the explicit `asOf`       |
 * | `provenance`          | epistemic origin of the value                        |
 * | `trustClassification` | DERIVED presentation mapping over `provenance`       |
 * | `status`/`value`      | availability of the value                            |
 * | evidence / calc meta  | `evidenceIds`, `formulaVersion`, timestamps, event   |
 *
 * Integration health (`IntegrationState`, including the `synthetic` disclosure)
 * is deliberately NOT carried here: it belongs to the existing source /
 * integration model and will be surfaced by a separate source assessment when a
 * concrete consumer is designed. The existing `ValueStatus`
 * (`projected | validated | realised`) is a different, orthogonal axis — the
 * value-realisation lifecycle — and is neither forked nor redefined here.
 *
 * Invariants:
 * - Immutable. Every constructor returns a NEW frozen envelope; a prior version
 *   is never mutated, and no second, divergent copy of a prior version is ever
 *   produced.
 * - Each version has its own caller-supplied `id` and records `supersedesId`
 *   pointing at the version it replaces. Whether a version has itself been
 *   superseded is derived from the successor relationship in the append-only
 *   ledger (Slice 2.1c), never stamped back onto history.
 * - `unavailable` means `value === null` plus a non-empty `unavailableReason`;
 *   `available` never carries a reason. Numeric `0` is a legitimate available
 *   value.
 * - `trustClassification` is always derived internally from `provenance`;
 *   callers cannot supply or override it.
 * - No calculation logic lives here. The envelope records a value produced
 *   elsewhere (in later slices, by `engines/*` via the calculation ledger).
 */

export type EnvelopeStatus = "available" | "unavailable";

interface ValueEnvelopeBase {
  /** Identity of THIS version; each version has its own id. */
  readonly id: string;
  /** Monotonic; a superseding version is exactly `prev.version + 1`. */
  readonly version: number;
  /** The `id` of the version this one replaces, or `null` for the first. */
  readonly supersedesId: string | null;
  /** Derived from `provenance`; never an input. */
  readonly trustClassification: TrustClassification;
  readonly provenance: Provenance;
  /** How/where sourced. Not integration health. */
  readonly sourceMode: SourceMode;
  /** Temporal axis only; never `synthetic`. */
  readonly freshness: FreshnessState;
  readonly formulaVersion: string;
  readonly evidenceIds: readonly string[];
  /** Explicit evaluation instant (= `ANCHOR_NOW`); never `Date.now()`. */
  readonly asOf: string;
  readonly capturedAt: string | null;
  readonly producedAt: string;
  readonly createdByEventId: string;
}

export interface AvailableValueEnvelope<T> extends ValueEnvelopeBase {
  readonly status: "available";
  readonly value: T;
  readonly unavailableReason?: undefined;
}

export interface UnavailableValueEnvelope extends ValueEnvelopeBase {
  readonly status: "unavailable";
  readonly value: null;
  /** Always present and non-empty — an absence is explained, never implied. */
  readonly unavailableReason: string;
}

export type ValueEnvelope<T> = AvailableValueEnvelope<T> | UnavailableValueEnvelope;

interface EnvelopeFieldsInit {
  id: string;
  provenance: Provenance;
  sourceMode: SourceMode;
  freshness: FreshnessState;
  formulaVersion: string;
  evidenceIds?: readonly string[];
  asOf: string;
  capturedAt?: string | null;
  producedAt: string;
  createdByEventId: string;
}

export interface MakeAvailableEnvelopeInit<T> extends EnvelopeFieldsInit {
  value: T;
  unavailableReason?: never;
}

export interface MakeUnavailableEnvelopeInit extends EnvelopeFieldsInit {
  value: null;
  unavailableReason: string;
}

export type MakeEnvelopeInit<T> =
  | MakeAvailableEnvelopeInit<T>
  | MakeUnavailableEnvelopeInit;

interface SupersedeFieldsInit {
  /** New, caller-supplied identity for the superseding version. */
  id: string;
  /** The governed event that produced this version. */
  createdByEventId: string;
  producedAt: string;
  provenance?: Provenance;
  sourceMode?: SourceMode;
  freshness?: FreshnessState;
  formulaVersion?: string;
  evidenceIds?: readonly string[];
  asOf?: string;
  capturedAt?: string | null;
}

export interface SupersedeAvailableInit<T> extends SupersedeFieldsInit {
  value: T;
  unavailableReason?: never;
}

export interface SupersedeUnavailableInit extends SupersedeFieldsInit {
  value: null;
  unavailableReason: string;
}

export type SupersedeInit<T> = SupersedeAvailableInit<T> | SupersedeUnavailableInit;

export interface MarkUnavailableOptions {
  /** New, caller-supplied identity for the superseding version. */
  id: string;
  /** The governed event that established the unavailability. */
  createdByEventId: string;
  producedAt: string;
  freshness?: FreshnessState;
  asOf?: string;
  capturedAt?: string | null;
}

function requireReason(reason: string): string {
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new TypeError(
      "An unavailable value envelope requires a non-empty unavailableReason.",
    );
  }
  return reason;
}

/**
 * Freeze the envelope and its evidence list. The generic payload `T` is stored
 * by reference and is NOT cloned or frozen — see the immutability note on
 * `makeEnvelope`.
 */
function freezeEnvelope<E extends ValueEnvelope<unknown>>(envelope: E): E {
  Object.freeze(envelope.evidenceIds);
  return Object.freeze(envelope);
}

type BuildInit<T> = EnvelopeFieldsInit & {
  version: number;
  supersedesId: string | null;
} & ({ value: T; unavailableReason?: never } | { value: null; unavailableReason: string });

function build<T>(fields: BuildInit<T>): ValueEnvelope<T> {
  const shared: ValueEnvelopeBase = {
    id: fields.id,
    version: fields.version,
    supersedesId: fields.supersedesId,
    // Always derived — a caller can neither supply nor contradict it.
    trustClassification: trustFromProvenance(fields.provenance),
    provenance: fields.provenance,
    sourceMode: fields.sourceMode,
    freshness: fields.freshness,
    formulaVersion: fields.formulaVersion,
    evidenceIds: [...(fields.evidenceIds ?? [])],
    asOf: fields.asOf,
    capturedAt: fields.capturedAt ?? null,
    producedAt: fields.producedAt,
    createdByEventId: fields.createdByEventId,
  };

  if (fields.value === null) {
    const unavailable: UnavailableValueEnvelope = {
      ...shared,
      status: "unavailable",
      value: null,
      unavailableReason: requireReason(fields.unavailableReason as string),
    };
    return freezeEnvelope(unavailable);
  }

  const available: AvailableValueEnvelope<T> = {
    ...shared,
    status: "available",
    value: fields.value,
  };
  return freezeEnvelope(available);
}

/**
 * Create the first version of a value envelope (`version = 1`,
 * `supersedesId = null`). Pure; no calculation is performed.
 *
 * Immutability guarantee: the returned envelope object is frozen and
 * `evidenceIds` is defensively copied and frozen. The payload `value` is stored
 * by reference — it is neither cloned, deep-frozen nor mutated, so a mutable
 * object payload remains caller-owned and caller-mutable. Deep immutability of
 * `T` is not claimed.
 */
export function makeEnvelope<T>(init: MakeEnvelopeInit<T>): ValueEnvelope<T> {
  return build<T>({ ...init, version: 1, supersedesId: null } as BuildInit<T>);
}

/**
 * Produce the NEXT version of a value: a new envelope with a new caller-supplied
 * `id`, `version + 1`, and `supersedesId` pointing at `prev.id`.
 *
 * `prev` is returned untouched and stays byte-for-byte referenceable; no
 * modified copy of it is produced, so history can never diverge. Unspecified
 * axes carry forward from `prev`; `trustClassification` is re-derived from the
 * effective `provenance`.
 */
export function supersede<T>(
  prev: ValueEnvelope<T>,
  next: SupersedeInit<T>,
): ValueEnvelope<T> {
  return build<T>({
    id: next.id,
    version: prev.version + 1,
    supersedesId: prev.id,
    provenance: next.provenance ?? prev.provenance,
    sourceMode: next.sourceMode ?? prev.sourceMode,
    freshness: next.freshness ?? prev.freshness,
    formulaVersion: next.formulaVersion ?? prev.formulaVersion,
    evidenceIds: next.evidenceIds ?? prev.evidenceIds,
    asOf: next.asOf ?? prev.asOf,
    capturedAt: next.capturedAt !== undefined ? next.capturedAt : prev.capturedAt,
    producedAt: next.producedAt,
    createdByEventId: next.createdByEventId,
    value: next.value,
    unavailableReason: next.unavailableReason,
  } as BuildInit<T>);
}

/**
 * Produce the next version as explicitly unavailable: `value = null` with a
 * non-empty `reason`. Missing evidence is a first-class state, never `0`.
 */
export function markUnavailable<T>(
  prev: ValueEnvelope<T>,
  reason: string,
  options: MarkUnavailableOptions,
): ValueEnvelope<T> {
  return supersede<T>(prev, {
    id: options.id,
    createdByEventId: options.createdByEventId,
    producedAt: options.producedAt,
    freshness: options.freshness,
    asOf: options.asOf,
    capturedAt: options.capturedAt,
    value: null,
    unavailableReason: requireReason(reason),
  });
}

/** Type guard narrowing to a present value — the only safe way to read `value`. */
export function isAvailable<T>(
  envelope: ValueEnvelope<T>,
): envelope is AvailableValueEnvelope<T> {
  return envelope.status === "available";
}
