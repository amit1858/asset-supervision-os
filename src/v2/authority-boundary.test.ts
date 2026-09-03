import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Slice 2.2 — authority boundary invariants.
 *
 * Proves the unavoidable authority seam cannot be reached from client code, the
 * internal gated append is imported only by the governed case, the server-only
 * command orchestration never enters a browser bundle, the client-reachable
 * domain barrel exposes no state-changing entry point, and the V2 authority
 * modules never reach the protected V1 brief/voice/app layers.
 *
 * Every invariant here is a DURABLE source/dependency invariant — it inspects
 * the committed source graph and remains meaningful after this slice is
 * committed. (An earlier version compared the working tree to HEAD via
 * `git diff`, which is vacuous once the work is committed: HEAD then already
 * contains the changes, so the diff is empty and the test can never fail.)
 *
 * Mirrors the Slice 2.1c `calculations-boundary.test.ts` graph walker.
 */

const SRC = path.join(process.cwd(), "src");

function toRepositoryPath(value: string): string {
  return value.split(path.sep).join("/");
}

function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const candidate of [
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /(?:from\s+|import\s+)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) specs.push(match[1]!);
  return specs;
}

function graph(entryRel: string) {
  const visited = new Set<string>();
  const externals = new Set<string>();
  const stack = [path.join(SRC, entryRel)];
  while (stack.length) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const spec of importsOf(file)) {
      const resolved = resolveSpec(spec, file);
      if (resolved) stack.push(resolved);
      else externals.add(spec);
    }
  }
  return { visited, externals };
}

/** Every `.ts`/`.tsx` file under `src`, repo-relative (POSIX) paths. */
function allSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      files.push(toRepositoryPath(path.relative(SRC, full)));
    }
  };
  walk(SRC);
  return files;
}

/** Named bindings pulled in by `import { a, b as c } from "spec"` (type-stripped). */
function namedImportsOf(relFile: string): { spec: string; names: string[] }[] {
  const source = readFileSync(path.join(SRC, relFile), "utf8");
  const out: { spec: string; names: string[] }[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const names = match[1]!
      .split(",")
      .map((n) => n.replace(/\btype\b/, "").trim().split(/\s+as\s+/)[0]!.trim())
      .filter((n) => n.length > 0);
    out.push({ spec: match[2]!, names });
  }
  return out;
}

/** Value exports (`export const|function|class Name`) declared in a file. */
function valueExportsOf(relFile: string): string[] {
  const source = readFileSync(path.join(SRC, relFile), "utf8");
  const names: string[] = [];
  const re = /export\s+(?:async\s+)?(?:const|function|class)\s+([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) names.push(match[1]!);
  return names;
}

describe("the domain barrel never reaches the server command seam", () => {
  const FORBIDDEN = [
    "v2/server/authority/command-orchestrator.ts",
    "v2/server/authority/capability-resolver.ts",
  ].map((f) => path.join(SRC, f));

  it("v2/domain/index.ts imports no server orchestration and no server-only", () => {
    const { visited, externals } = graph("v2/domain/index.ts");
    for (const forbidden of FORBIDDEN) {
      expect(
        visited.has(forbidden),
        `index.ts → ${toRepositoryPath(path.relative(SRC, forbidden))}`,
      ).toBe(false);
    }
    expect(externals.has("server-only"), "index.ts imports server-only").toBe(false);
  });

  it("the governed case never imports server-only", () => {
    const { externals } = graph("v2/domain/governed-case.ts");
    expect(externals.has("server-only")).toBe(false);
  });
});

describe("the internal gated append seam is unavoidable", () => {
  const SEAM = "appendGovernedDecisionEvent";

  it("is imported only by the governed case (never by client-reachable code)", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        const rel = toRepositoryPath(path.relative(SRC, full));
        // The seam is defined in event-log.ts, consumed by governed-case.ts, and
        // exercised by tests. Any OTHER importer would be a bypass.
        if (rel === "v2/domain/event-log.ts") continue;
        if (rel === "v2/domain/governed-case.ts") continue;
        if (rel.endsWith(".test.ts")) continue;
        const source = readFileSync(full, "utf8");
        if (source.includes(SEAM)) offenders.push(rel);
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  it("is not re-exported from the domain barrel", () => {
    const barrel = readFileSync(path.join(SRC, "v2/domain/index.ts"), "utf8");
    expect(barrel.includes(SEAM)).toBe(false);
  });
});

describe("server-only command orchestration", () => {
  for (const entry of [
    "v2/server/authority/command-orchestrator.ts",
    "v2/server/authority/capability-resolver.ts",
  ]) {
    it(`${entry} declares server-only`, () => {
      const { externals } = graph(entry);
      expect(externals.has("server-only")).toBe(true);
    });
  }

  it("orchestration is not imported outside src/v2/server", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        if (full.startsWith(path.join(SRC, "v2", "server"))) continue;
        if (importsOf(full).some((spec) => spec.includes("authority/command-orchestrator"))) {
          offenders.push(toRepositoryPath(path.relative(SRC, full)));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

describe("the domain barrel exposes no state-changing entry point", () => {
  // The `@/v2/domain` barrel is client-reachable. It must re-export read-only
  // types and accessors ONLY. If any of these mutation / state-minting entry
  // points reappear in a barrel `export { ... }`, a browser module could import
  // them and drive the governed boundary with a fabricated context.
  const MUTATIONS = [
    "recordGovernedDecision",
    "recordGovernedFact",
    "openCase",
    "replayCase",
    "appendGovernedDecisionEvent",
  ];

  it("v2/domain/index.ts re-exports no mutation function", () => {
    const barrel = readFileSync(path.join(SRC, "v2/domain/index.ts"), "utf8");
    const exportBlocks = barrel.match(/export\s*\{[^}]*\}\s*from\s*["'][^"']+["']/g) ?? [];
    const reExported = new Set<string>();
    for (const block of exportBlocks) {
      const inner = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
      for (const raw of inner.split(",")) {
        const name = raw.replace(/\btype\b/, "").trim().split(/\s+as\s+/)[0]!.trim();
        if (name) reExported.add(name);
      }
    }
    const leaked = MUTATIONS.filter((m) => reExported.has(m));
    expect(leaked, `barrel re-exports mutation entry points: ${leaked.join(", ")}`).toEqual([]);
  });

  it("only the server orchestrator imports the mutation entry points", () => {
    // The functions are defined in governed-case.ts; the ONLY approved caller is
    // the server-only command orchestrator. Anything else (client-reachable or
    // otherwise) importing them is a bypass of the trusted-context boundary.
    const APPROVED = new Set([
      "v2/domain/governed-case.ts", // definition site
      "v2/server/authority/command-orchestrator.ts", // approved server caller
    ]);
    const CALLERS = ["recordGovernedDecision", "recordGovernedFact"];
    const offenders: string[] = [];
    for (const rel of allSourceFiles()) {
      if (APPROVED.has(rel)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      const imported = namedImportsOf(rel).flatMap((i) => i.names);
      if (CALLERS.some((c) => imported.includes(c))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the server authority package is unreachable from client code", () => {
  it("no non-server, non-test module imports src/v2/server/authority/**", () => {
    const offenders: string[] = [];
    for (const rel of allSourceFiles()) {
      if (rel.startsWith("v2/server/")) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      const bad = importsOf(path.join(SRC, rel)).filter((spec) =>
        spec.includes("v2/server/authority"),
      );
      if (bad.length) offenders.push(`${rel} → ${bad.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("V2 authority and domain modules never reach V1 brief/voice/app", () => {
  const ENTRIES = [
    "v2/domain/index.ts",
    "v2/domain/governed-case.ts",
    "v2/domain/authority.ts",
    "v2/domain/authority-policy.ts",
    "v2/domain/audit.ts",
    "v2/domain/event-log.ts",
    "v2/domain/event-log-core.ts",
    "v2/server/authority/command-orchestrator.ts",
    "v2/server/authority/capability-resolver.ts",
  ];
  const FORBIDDEN_PREFIXES = ["brief/", "voice/", "app/"];
  const FORBIDDEN_SPECS = ["@/brief", "@/voice", "@/app"];

  for (const entry of ENTRIES) {
    it(`${entry} imports no brief/voice/app module`, () => {
      const { visited, externals } = graph(entry);
      const reachedFiles = [...visited]
        .map((f) => toRepositoryPath(path.relative(SRC, f)))
        .filter((rel) => FORBIDDEN_PREFIXES.some((p) => rel.startsWith(p)));
      const reachedSpecs = [...externals].filter((spec) =>
        FORBIDDEN_SPECS.some((p) => spec === p || spec.startsWith(p + "/")),
      );
      expect(reachedFiles, `reaches V1 files: ${reachedFiles.join(", ")}`).toEqual([]);
      expect(reachedSpecs, `imports V1 specs: ${reachedSpecs.join(", ")}`).toEqual([]);
    });
  }
});

describe("event-log-core exports only read-only validators", () => {
  it("declares no append, mint, brand or other state-changing operation", () => {
    const exports = valueExportsOf("v2/domain/event-log-core.ts");
    const ALLOWED = new Set([
      "CANONICAL_UTC",
      "isCanonicalInstant",
      "isNonEmpty",
      "deepFreeze",
    ]);
    const unexpected = exports.filter((name) => !ALLOWED.has(name));
    expect(unexpected, `unexpected value exports: ${unexpected.join(", ")}`).toEqual([]);
    const STATE_CHANGING = /append|mint|create|brand|record|commit|aggregate|open/i;
    const leaks = exports.filter((name) => STATE_CHANGING.test(name));
    expect(leaks, `state-changing export names: ${leaks.join(", ")}`).toEqual([]);
  });
});
