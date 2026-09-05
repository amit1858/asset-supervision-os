import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * September 8 Maintenance & Materials experience — durable source/dependency
 * invariants.
 *
 * These prove, from the committed source graph (never from `git diff`, which is
 * vacuous after commit), that:
 *   - the Materials presentation components compute no governed value and import
 *     no server, engine, ledger or authority-mutation module;
 *   - the client-safe materials view-model module reaches no server-only code;
 *   - the materials server read model declares `server-only` and never touches
 *     V1 brief/voice/app;
 *   - the materials read model is reachable only from the approved server screen
 *     and tests, so no browser bundle can import it.
 *
 * Mirrors `reliability-boundary.test.ts`.
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

function namedImportsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const names: string[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']+["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    for (const raw of match[1]!.split(",")) {
      const name = raw.replace(/\btype\b/, "").trim().split(/\s+as\s+/)[0]!.trim();
      if (name) names.push(name);
    }
  }
  return names;
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

function filesUnder(relDir: string): string[] {
  const root = path.join(SRC, relDir);
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      files.push(full);
    }
  };
  walk(root);
  return files;
}

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

const MATERIALS_READ_MODEL = "v2/server/materials/maintenance-materials-view.ts";

describe("Materials presentation components compute no governed value", () => {
  const FORBIDDEN_SPEC = [
    "v2/server/",
    "engine-adapter",
    "@/data",
    "command-orchestrator",
    "capability-resolver",
    "domain/reducer",
    "domain/policy",
    "domain/ledger",
    "governed-case",
  ];
  const FORBIDDEN_NAMED = ["ApprovalControl", "executeRecompute", "createLedger"];

  for (const file of filesUnder("components/v2/materials")) {
    const rel = toRepositoryPath(path.relative(SRC, file));
    it(`${rel} imports no server/engine/mutation module`, () => {
      const specs = importsOf(file);
      const badSpecs = specs.filter((s) => FORBIDDEN_SPEC.some((f) => s.includes(f)));
      expect(badSpecs, `forbidden import specs: ${badSpecs.join(", ")}`).toEqual([]);
      const named = namedImportsOf(file);
      const badNamed = named.filter((n) => FORBIDDEN_NAMED.includes(n));
      expect(badNamed, `forbidden named imports: ${badNamed.join(", ")}`).toEqual([]);
    });
  }
});

describe("the client-safe materials view-model reaches no server-only code", () => {
  it("v2/materials/view-types.ts imports no server-only and no engine adapter", () => {
    const { visited, externals } = graph("v2/materials/view-types.ts");
    expect(externals.has("server-only")).toBe(false);
    const reachedEngine = [...visited].some((f) => f.includes("engine-adapter"));
    expect(reachedEngine, "view-types reaches the engine adapter").toBe(false);
    const reachedServer = [...visited].some((f) =>
      toRepositoryPath(f).includes("/v2/server/"),
    );
    expect(reachedServer, "view-types reaches a server-only module").toBe(false);
  });
});

describe("the Materials server read model is server-only and V1-safe", () => {
  it(`${MATERIALS_READ_MODEL} declares server-only`, () => {
    const { externals } = graph(MATERIALS_READ_MODEL);
    expect(externals.has("server-only")).toBe(true);
  });

  it(`${MATERIALS_READ_MODEL} imports no brief/voice/app module`, () => {
    const { visited, externals } = graph(MATERIALS_READ_MODEL);
    const reachedFiles = [...visited]
      .map((f) => toRepositoryPath(path.relative(SRC, f)))
      .filter((rel) => ["brief/", "voice/", "app/"].some((p) => rel.startsWith(p)));
    const reachedSpecs = [...externals].filter((spec) =>
      ["@/brief", "@/voice", "@/app"].some((p) => spec === p || spec.startsWith(p + "/")),
    );
    expect(reachedFiles, `reaches V1 files: ${reachedFiles.join(", ")}`).toEqual([]);
    expect(reachedSpecs, `imports V1 specs: ${reachedSpecs.join(", ")}`).toEqual([]);
  });

  it(`${MATERIALS_READ_MODEL} imports no authority-mutation seam`, () => {
    const { externals } = graph(MATERIALS_READ_MODEL);
    const mutation = [...externals].filter((spec) =>
      ["command-orchestrator", "governed-case", "domain/reducer", "domain/ledger"].some((p) =>
        spec.includes(p),
      ),
    );
    expect(mutation, `reaches mutation seam: ${mutation.join(", ")}`).toEqual([]);
  });
});

describe("the Materials server read model is unreachable from client code", () => {
  const APPROVED_SCREENS = new Set([
    "components/v2/V2RouteScreen.tsx",
  ]);
  // Server-only, non-screen consumers permitted to import the read model. The
  // governed K-201 case investigator tools read the materials model on the
  // server. Proven client-unreachable by src/agent/agent-boundary.test.ts (the
  // browser panel imports only @/agent/types).
  const APPROVED_SERVER_CONSUMERS = new Set([
    "agent/tools.ts",
  ]);
  const APPROVED_IMPORTERS = new Set([...APPROVED_SCREENS, ...APPROVED_SERVER_CONSUMERS]);

  it("only v2/server, the approved screen/consumers and tests import the materials read model", () => {
    const offenders: string[] = [];
    for (const rel of allSourceFiles()) {
      if (rel.startsWith("v2/server/")) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      const reaches = importsOf(path.join(SRC, rel)).some((s) =>
        s.includes("v2/server/materials"),
      );
      if (reaches && !APPROVED_IMPORTERS.has(rel)) offenders.push(rel);
    }
    expect(offenders, `unexpected importers: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every approved importer is server-only (no 'use client')", () => {
    for (const rel of APPROVED_IMPORTERS) {
      const source = readFileSync(path.join(SRC, rel), "utf8");
      expect(source.includes("use client"), `${rel} must be server-only`).toBe(false);
    }
  });
});
