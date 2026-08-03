import { describe, it, expect } from "vitest";
import {
  freezeInputSnapshot,
  isCalculationInputReference,
  isCalculationInputSnapshot,
  isJsonValue,
  makeFullInputSnapshot,
  makeReferencedOnlyInputSnapshot,
  type CalculationInputReference,
} from "./inputs";

const REF: CalculationInputReference = {
  kind: "asset",
  id: "asset-k201",
  description: "K-201 compressor master record",
};

describe("input references", () => {
  it("accepts a well-formed reference", () => {
    expect(isCalculationInputReference(REF)).toBe(true);
  });

  it("rejects an unknown kind, blank id or blank description", () => {
    expect(isCalculationInputReference({ ...REF, kind: "spreadsheet" })).toBe(false);
    expect(isCalculationInputReference({ ...REF, id: "  " })).toBe(false);
    expect(isCalculationInputReference({ ...REF, description: "" })).toBe(false);
    expect(isCalculationInputReference(null)).toBe(false);
  });
});

describe("JSON safety", () => {
  it("accepts finite primitives, arrays and plain objects", () => {
    expect(isJsonValue({ a: 1, b: "x", c: false, d: null, e: [1, { f: 2 }] })).toBe(true);
  });

  it("rejects undefined, NaN and Infinity rather than coercing them", () => {
    expect(isJsonValue({ a: undefined })).toBe(false);
    expect(isJsonValue({ a: Number.NaN })).toBe(false);
    expect(isJsonValue({ a: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("rejects functions, symbols, dates, maps and class instances", () => {
    expect(isJsonValue({ a: () => 1 })).toBe(false);
    expect(isJsonValue({ [Symbol("s")]: 1, a: 1 })).toBe(false);
    expect(isJsonValue({ a: new Date(0) })).toBe(false);
    expect(isJsonValue({ a: new Map() })).toBe(false);
    expect(isJsonValue(new (class Thing {})())).toBe(false);
  });

  it("rejects a cyclic structure instead of throwing", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
  });

  it("permits the same object appearing twice in a tree", () => {
    const shared = { a: 1 };
    expect(isJsonValue({ x: shared, y: shared })).toBe(true);
  });
});

describe("full input snapshot", () => {
  it("claims full reproducibility and stores the data", () => {
    const snapshot = makeFullInputSnapshot({
      snapshot: { riskScore: 68, healthScore: 52 },
      references: [REF],
    });
    expect(snapshot.reproducibility).toBe("full");
    if (snapshot.reproducibility !== "full") throw new Error("unreachable");
    expect(snapshot.snapshot).toEqual({ riskScore: 68, healthScore: 52 });
  });

  it("defensively copies, so later caller mutation cannot rewrite it", () => {
    const source: Record<string, unknown> = { nested: { value: 1 } };
    const snapshot = makeFullInputSnapshot({
      snapshot: source as never,
      references: [REF],
    });
    (source.nested as Record<string, unknown>).value = 999;
    if (snapshot.reproducibility !== "full") throw new Error("unreachable");
    expect(snapshot.snapshot).toEqual({ nested: { value: 1 } });
  });

  it("is deeply frozen", () => {
    const snapshot = makeFullInputSnapshot({
      snapshot: { nested: { value: 1 } },
      references: [REF],
    });
    if (snapshot.reproducibility !== "full") throw new Error("unreachable");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.snapshot.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.references)).toBe(true);
    expect(Object.isFrozen(snapshot.references[0])).toBe(true);
  });

  it("refuses an unenforceable claim over non-JSON-safe data", () => {
    expect(() =>
      makeFullInputSnapshot({ snapshot: { a: undefined } as never, references: [REF] }),
    ).toThrow(TypeError);
  });

  it("refuses invalid references", () => {
    expect(() =>
      makeFullInputSnapshot({ snapshot: {}, references: [{ ...REF, id: "" }] }),
    ).toThrow(TypeError);
  });
});

describe("referenced-only input snapshot", () => {
  it("states the limitation instead of claiming reproducibility", () => {
    const snapshot = makeReferencedOnlyInputSnapshot({
      limitation: "The 270 sensor readings are referenced, not retained.",
      reproductionRequires: "The seeded dataset at the same anchor.",
      references: [REF],
    });
    expect(snapshot.reproducibility).toBe("referenced_only");
    if (snapshot.reproducibility !== "referenced_only") throw new Error("unreachable");
    expect(snapshot.limitation).not.toBe("");
    expect(snapshot.reproductionRequires).not.toBe("");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("refuses an empty limitation or an empty reproduction requirement", () => {
    expect(() =>
      makeReferencedOnlyInputSnapshot({
        limitation: "  ",
        reproductionRequires: "x",
        references: [REF],
      }),
    ).toThrow(TypeError);
    expect(() =>
      makeReferencedOnlyInputSnapshot({
        limitation: "x",
        reproductionRequires: "",
        references: [REF],
      }),
    ).toThrow(TypeError);
  });
});

describe("snapshot validation and re-freezing", () => {
  it("rejects a snapshot with no reproducibility discriminant", () => {
    expect(isCalculationInputSnapshot({ references: [REF] })).toBe(false);
    expect(isCalculationInputSnapshot({ reproducibility: "partial", references: [REF] })).toBe(
      false,
    );
    expect(isCalculationInputSnapshot(null)).toBe(false);
  });

  it("rejects a full snapshot whose data is an array or non-JSON-safe", () => {
    expect(
      isCalculationInputSnapshot({ reproducibility: "full", snapshot: [], references: [REF] }),
    ).toBe(false);
    expect(
      isCalculationInputSnapshot({
        reproducibility: "full",
        snapshot: { a: Number.NaN },
        references: [REF],
      }),
    ).toBe(false);
  });

  it("re-freezes and copies both snapshot variants", () => {
    const mutableRef = { ...REF };
    const full = freezeInputSnapshot({
      reproducibility: "full",
      snapshot: { a: { b: 1 } },
      references: [mutableRef],
    });
    mutableRef.id = "tampered";
    expect(full.references[0]?.id).toBe("asset-k201");
    expect(Object.isFrozen(full)).toBe(true);

    const referenced = freezeInputSnapshot({
      reproducibility: "referenced_only",
      limitation: "l",
      reproductionRequires: "r",
      references: [REF],
    });
    expect(Object.isFrozen(referenced)).toBe(true);
    expect(referenced.reproducibility).toBe("referenced_only");
  });
});
