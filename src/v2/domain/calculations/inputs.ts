/**
 * Slice 2.1c — calculation inputs and an HONEST reproducibility claim.
 *
 * A ledger that stores an output without its inputs is not auditable, but a
 * ledger that claims reproducibility it cannot deliver is worse: it invites a
 * reviewer to trust a replay that would silently use different data. So the
 * input snapshot is a discriminated union, and the discriminant IS the claim.
 *
 * - `full` asserts that the stored `snapshot` alone is sufficient to reproduce
 *   the output deterministically. It is JSON-safe, defensively copied and
 *   deeply frozen on acceptance.
 * - `referenced_only` asserts the opposite explicitly, and must say what is
 *   missing (`limitation`) and what a reproduction would additionally require
 *   (`reproductionRequires`).
 *
 * The seeded K-201 assessment consumes 270 sensor readings, 90 production runs
 * and the downtime log. Those are NOT retained in the record, so every
 * adapter-backed calculation is `referenced_only`. Stamping such a record
 * `full` would be a false audit claim.
 *
 * Nothing here reads a clock, and `undefined`, `NaN`, `Infinity`, functions,
 * symbols and cycles are all rejected rather than silently coerced by
 * `JSON.stringify`.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type CalculationInputKind =
  | "asset"
  | "production_line"
  | "recommendation"
  | "work_order"
  | "turnaround_scope"
  | "outcome"
  | "portfolio"
  | "sensor_reading_window"
  | "production_run_window"
  | "downtime_event_window"
  | "dataset"
  | "constant";

export interface CalculationInputReference {
  readonly kind: CalculationInputKind;
  /** Identity of the referenced input in its own system. */
  readonly id: string;
  /** Human-readable description of what was consumed. */
  readonly description: string;
}

export type CalculationInputSnapshot =
  | {
      readonly reproducibility: "full";
      readonly snapshot: Readonly<JsonObject>;
      readonly references: readonly CalculationInputReference[];
    }
  | {
      readonly reproducibility: "referenced_only";
      readonly limitation: string;
      readonly reproductionRequires: string;
      readonly references: readonly CalculationInputReference[];
      /**
       * Governed cardinality-policy version this record was produced under, when
       * the calculation's reproduction contract depends on one (work readiness
       * and the required-spare rule). A future policy change is a governed
       * formula-set upgrade, so this value both discloses the assumption and,
       * because it is part of the frozen reproduction contract, prevents a
       * record produced under a different policy from being byte-identical.
       */
      readonly cardinalityPolicyVersion?: string;
    };

const INPUT_KINDS: readonly CalculationInputKind[] = Object.freeze([
  "asset",
  "production_line",
  "recommendation",
  "work_order",
  "turnaround_scope",
  "outcome",
  "portfolio",
  "sensor_reading_window",
  "production_run_window",
  "downtime_event_window",
  "dataset",
  "constant",
] as const);

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isCalculationInputReference(
  value: unknown,
): value is CalculationInputReference {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kind === "string" &&
    INPUT_KINDS.includes(candidate.kind as CalculationInputKind) &&
    isNonEmpty(candidate.id) &&
    isNonEmpty(candidate.description)
  );
}

/**
 * Strict JSON-safety: only plain objects, arrays and finite primitives. A cycle
 * is rejected rather than throwing deep inside a clone, and `NaN`/`Infinity`
 * are rejected rather than becoming `null` in serialisation.
 */
export function isJsonValue(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value === null) return true;
  const type = typeof value;
  if (type === "string" || type === "boolean") return true;
  if (type === "number") return Number.isFinite(value as number);
  if (type !== "object") return false;

  const object = value as object;
  if (seen.has(object)) return false;
  seen.add(object);

  try {
    if (Array.isArray(object)) {
      return object.every((entry) => isJsonValue(entry, seen));
    }
    if (Object.getPrototypeOf(object) !== Object.prototype) return false;
    for (const key of Object.getOwnPropertyNames(object)) {
      const entry = (object as Record<string, unknown>)[key];
      if (entry === undefined) return false;
      if (!isJsonValue(entry, seen)) return false;
    }
    if (Object.getOwnPropertySymbols(object).length > 0) return false;
    return true;
  } finally {
    seen.delete(object);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJson(entry as JsonValue)) as unknown as T;
  }
  const out: Record<string, JsonValue> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    out[key] = cloneJson((value as Record<string, JsonValue>)[key] as JsonValue);
  }
  return out as unknown as T;
}

function freezeReferences(
  references: readonly CalculationInputReference[],
): readonly CalculationInputReference[] {
  return Object.freeze(references.map((r) => Object.freeze({ ...r })));
}

/**
 * A snapshot whose stored data alone reproduces the output. Throws when the
 * data is not JSON-safe, because an unenforceable claim must never be stored.
 */
export function makeFullInputSnapshot(init: {
  readonly snapshot: JsonObject;
  readonly references: readonly CalculationInputReference[];
}): CalculationInputSnapshot {
  if (!isJsonValue(init?.snapshot)) {
    throw new TypeError(
      "A full input snapshot requires JSON-safe data (no undefined, NaN, Infinity, functions, symbols or cycles).",
    );
  }
  if (!Array.isArray(init.references) || !init.references.every(isCalculationInputReference)) {
    throw new TypeError("A calculation input snapshot requires valid input references.");
  }
  return deepFreeze({
    reproducibility: "full" as const,
    snapshot: cloneJson(init.snapshot),
    references: freezeReferences(init.references),
  });
}

/**
 * A snapshot that explicitly does NOT claim reproducibility, and says why.
 */
export function makeReferencedOnlyInputSnapshot(init: {
  readonly limitation: string;
  readonly reproductionRequires: string;
  readonly references: readonly CalculationInputReference[];
  readonly cardinalityPolicyVersion?: string;
}): CalculationInputSnapshot {
  if (!isNonEmpty(init?.limitation)) {
    throw new TypeError(
      "A referenced-only input snapshot requires a non-empty limitation.",
    );
  }
  if (!isNonEmpty(init.reproductionRequires)) {
    throw new TypeError(
      "A referenced-only input snapshot requires a non-empty reproductionRequires.",
    );
  }
  if (!Array.isArray(init.references) || !init.references.every(isCalculationInputReference)) {
    throw new TypeError("A calculation input snapshot requires valid input references.");
  }
  if (init.cardinalityPolicyVersion !== undefined && !isNonEmpty(init.cardinalityPolicyVersion)) {
    throw new TypeError(
      "A referenced-only input snapshot cardinalityPolicyVersion, when present, must be a non-empty string.",
    );
  }
  const references = freezeReferences(init.references);
  if (init.cardinalityPolicyVersion === undefined) {
    return deepFreeze({
      reproducibility: "referenced_only" as const,
      limitation: init.limitation,
      reproductionRequires: init.reproductionRequires,
      references,
    });
  }
  return deepFreeze({
    reproducibility: "referenced_only" as const,
    limitation: init.limitation,
    reproductionRequires: init.reproductionRequires,
    references,
    cardinalityPolicyVersion: init.cardinalityPolicyVersion,
  });
}

/** Runtime validation for a snapshot arriving from persistence or a caller. */
export function isCalculationInputSnapshot(
  value: unknown,
): value is CalculationInputSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.references)) return false;
  if (!candidate.references.every(isCalculationInputReference)) return false;

  if (candidate.reproducibility === "full") {
    const snapshot = candidate.snapshot;
    if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
      return false;
    }
    return isJsonValue(snapshot);
  }
  if (candidate.reproducibility === "referenced_only") {
    if (
      candidate.cardinalityPolicyVersion !== undefined &&
      !isNonEmpty(candidate.cardinalityPolicyVersion)
    ) {
      return false;
    }
    return isNonEmpty(candidate.limitation) && isNonEmpty(candidate.reproductionRequires);
  }
  return false;
}

/** Defensive copy + deep freeze for storage inside an accepted record. */
export function freezeInputSnapshot(
  snapshot: CalculationInputSnapshot,
): CalculationInputSnapshot {
  if (snapshot.reproducibility === "full") {
    return deepFreeze({
      reproducibility: "full" as const,
      snapshot: cloneJson(snapshot.snapshot),
      references: freezeReferences(snapshot.references),
    });
  }
  if (snapshot.cardinalityPolicyVersion === undefined) {
    return deepFreeze({
      reproducibility: "referenced_only" as const,
      limitation: snapshot.limitation,
      reproductionRequires: snapshot.reproductionRequires,
      references: freezeReferences(snapshot.references),
    });
  }
  return deepFreeze({
    reproducibility: "referenced_only" as const,
    limitation: snapshot.limitation,
    reproductionRequires: snapshot.reproductionRequires,
    references: freezeReferences(snapshot.references),
    cardinalityPolicyVersion: snapshot.cardinalityPolicyVersion,
  });
}
