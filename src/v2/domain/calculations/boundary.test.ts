import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees about the Slice 2.1c calculation domain that a runtime test
 * cannot give: what these files are ALLOWED to contain and import.
 *
 * Comments are stripped before every scan, because a doc comment legitimately
 * discusses `Date.now()` and the values it forbids — the ban is on executable
 * code, not on explaining the rule.
 */

const DIR = path.join(process.cwd(), "src", "v2", "domain", "calculations");

const SOURCE_FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .sort();

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function code(file: string): string {
  return stripComments(readFileSync(path.join(DIR, file), "utf8"));
}

function importedNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    for (const raw of match[1]!.split(",")) {
      const cleaned = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (cleaned) names.add(cleaned);
    }
  }
  return names;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from\s+|import\s+)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) specs.push(match[1]!);
  return specs;
}

describe("slice 2.1c module inventory", () => {
  it("contains exactly the approved calculation modules", () => {
    expect(SOURCE_FILES).toEqual([
      "execute.ts",
      "failure.ts",
      "formula.ts",
      "identity.ts",
      "inputs.ts",
      "ledger.ts",
      "port.ts",
      "record.ts",
      "selectors.ts",
      "subject.ts",
      "turnaround-fit.ts",
      "work-readiness.ts",
    ]);
  });
});

describe("no clock, no randomness, no ambient identity", () => {
  const BANNED = [
    "Date.now",
    "new Date()",
    "Math.random",
    "crypto.randomUUID",
    "randomUUID",
    "performance.now",
    "process.hrtime",
  ];

  for (const file of SOURCE_FILES) {
    it(`${file} reads no clock and generates no random identity`, () => {
      const source = code(file);
      for (const banned of BANNED) {
        expect(source.includes(banned), `${file} contains ${banned}`).toBe(false);
      }
    });
  }

  it("uses Date.parse only for canonical-instant validation in record.ts", () => {
    for (const file of SOURCE_FILES) {
      const uses = code(file).includes("Date.parse");
      expect(uses && file !== "record.ts", file).toBe(false);
    }
  });
});

describe("no promotion path and no lifecycle mutation", () => {
  const FORBIDDEN_IDENTIFIERS = [
    "CandidateGovernedEvent",
    "confirmPreparedEvent",
    "toGovernedEvent",
    "promoteToEvent",
    "promoteCalculation",
    "assistantPromotion",
  ];

  for (const file of SOURCE_FILES) {
    it(`${file} introduces no promotion path`, () => {
      const source = code(file);
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(source.includes(identifier), `${file} contains ${identifier}`).toBe(false);
      }
    });
  }

  it("imports no append, replay, reducer or snapshot symbol from the event log", () => {
    // The boundary is enforced at SYMBOL level, not module level:
    // `GovernedIntegrityError` is deliberately reused from `../event-log` so the
    // calculation layer fails closed with the SAME error class as Slice 2.1b,
    // rather than inventing a parallel integrity type.
    const FORBIDDEN_SYMBOLS = [
      "appendEvent",
      "replay",
      "toPersistableEvents",
      "reduce",
      "initialSnapshot",
      "LifecycleSnapshot",
      "LifecyclePhase",
    ];
    for (const file of SOURCE_FILES) {
      const names = importedNames(code(file));
      for (const symbol of FORBIDDEN_SYMBOLS) {
        expect(names.has(symbol), `${file} imports ${symbol}`).toBe(false);
      }
    }
  });

  it("imports only GovernedIntegrityError from the event log", () => {
    for (const file of SOURCE_FILES) {
      const source = code(file);
      if (!source.includes('from "../event-log"')) continue;
      const names = importedNames(source);
      const fromEventLog = [...names].filter((n) => n === "GovernedIntegrityError");
      expect(fromEventLog, file).toEqual(["GovernedIntegrityError"]);
    }
  });

  it("reuses the existing ProposedEvent contract", () => {
    const ledger = code("ledger.ts");
    const execute = code("execute.ts");
    expect(ledger.includes("ProposedEvent")).toBe(true);
    expect(execute.includes("ProposedEvent")).toBe(true);
    for (const file of SOURCE_FILES) {
      expect(code(file).includes("interface ProposedEvent"), file).toBe(false);
    }
  });
});

describe("no engine formula is reimplemented", () => {
  it("never derives portfolio or fabricated totals", () => {
    for (const file of SOURCE_FILES) {
      const source = code(file);
      for (const banned of ["1458140", "1_458_140", "1449400", "1_449_400", "0.90", "0.9 *"]) {
        expect(source.includes(banned), `${file} contains ${banned}`).toBe(false);
      }
    }
  });

  it("contains no arithmetic operator applied to an engine value", () => {
    // Ledger sequencing (`records.length + 1`) is structural bookkeeping, not a
    // governed value, so the scan targets the value-bearing modules.
    for (const file of ["execute.ts", "record.ts", "formula.ts", "port.ts"]) {
      const source = code(file);
      expect(/\.value\s*[*+/]/.test(source), `${file} performs arithmetic on a value`).toBe(false);
      expect(/\.value\s+-\s/.test(source), `${file} subtracts from a value`).toBe(false);
      expect(/[*/]\s*\d/.test(source), `${file} multiplies or divides by a literal`).toBe(false);
    }
  });
});

describe("port purity", () => {
  it("imports only pure type modules", () => {
    const specs = importSpecifiers(code("port.ts"));
    expect(specs.sort()).toEqual(["@/context/types", "@/domain/integration"]);
  });

  it("declares no runtime value, only types", () => {
    const source = code("port.ts");
    expect(/export\s+(const|function|class|let|var)\s/.test(source)).toBe(false);
  });

  it("carries no provenance, formula version or value status in its DTOs", () => {
    const source = code("port.ts");
    for (const banned of ["provenance:", "formulaVersion:", "valueStatus:", "trustClassification"]) {
      expect(source.includes(banned), `port.ts declares ${banned}`).toBe(false);
    }
  });
});

describe("no server or data reachability from the calculation domain", () => {
  it("imports no repository, seed, engine, brief or server module", () => {
    const FORBIDDEN_PREFIXES = [
      "@/data/",
      "@/engines/",
      "@/brief/",
      "@/v2/server/",
      "../../server/",
      "server-only",
      "node:fs",
    ];
    for (const file of SOURCE_FILES) {
      for (const spec of importSpecifiers(code(file))) {
        for (const prefix of FORBIDDEN_PREFIXES) {
          expect(spec.startsWith(prefix), `${file} imports ${spec}`).toBe(false);
        }
      }
    }
  });
});

describe("server adapter protection", () => {
  const ADAPTER = path.join(
    process.cwd(),
    "src",
    "v2",
    "server",
    "calculations",
    "engine-adapter.ts",
  );

  it("declares server-only on its first executable line", () => {
    const source = readFileSync(ADAPTER, "utf8");
    const firstStatement = stripComments(source)
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l !== "");
    expect(firstStatement).toBe('import "server-only";');
  });

  it("is never imported by the pure calculation domain", () => {
    for (const file of SOURCE_FILES) {
      expect(code(file).includes("engine-adapter"), file).toBe(false);
    }
  });

  it("is not re-exported from the v2 domain barrel", () => {
    const barrel = stripComments(
      readFileSync(path.join(process.cwd(), "src", "v2", "domain", "index.ts"), "utf8"),
    );
    expect(barrel.includes("server/calculations")).toBe(false);
    expect(barrel.includes("engine-adapter")).toBe(false);
    expect(barrel.includes("SeededEngineAdapter")).toBe(false);
  });
});
