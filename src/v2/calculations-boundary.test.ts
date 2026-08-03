import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Proves the Slice 2.1c CLIENT-reachable calculation surface never drags the
 * server-only engine adapter, the seeded dataset or truth construction into a
 * browser bundle.
 *
 * Mirrors the existing `src/voice/voice-boundary.test.ts` graph walker so the
 * two boundaries are enforced the same way.
 */

const SRC = path.join(process.cwd(), "src");

const CLIENT_ENTRIES = [
  "v2/domain/index.ts",
  "v2/domain/calculations/port.ts",
  "v2/domain/calculations/execute.ts",
  "v2/domain/calculations/ledger.ts",
  "v2/domain/calculations/formula.ts",
];

const FORBIDDEN = [
  "v2/server/calculations/engine-adapter.ts",
  "data/seed.ts",
  "data/generate.ts",
  "data/repository.ts",
  "data/k201-analysis.ts",
  "brief/service.ts",
].map((f) => path.join(SRC, f));

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

describe("slice 2.1c client dependency graph", () => {
  for (const entry of CLIENT_ENTRIES) {
    it(`${entry} reaches no server adapter, engine or seeded dataset`, () => {
      const { visited, externals } = graph(entry);
      for (const forbidden of FORBIDDEN) {
        expect(visited.has(forbidden), `${entry} → ${path.relative(SRC, forbidden)}`).toBe(false);
      }
      expect(externals.has("server-only"), `${entry} imports server-only`).toBe(false);
    });
  }

  it("keeps the pure port free of any transitive runtime dependency", () => {
    const { visited } = graph("v2/domain/calculations/port.ts");
    const files = [...visited].map((f) => path.relative(SRC, f)).sort();
    expect(files).toEqual([
      "context/types.ts",
      "domain/integration.ts",
      "personas/types.ts",
      "v2/domain/calculations/port.ts",
    ]);
  });
});

describe("the server adapter is genuinely server-only", () => {
  const ADAPTER = "v2/server/calculations/engine-adapter.ts";

  it("declares server-only", () => {
    const { externals } = graph(ADAPTER);
    expect(externals.has("server-only")).toBe(true);
  });

  it("reaches the real engines and dataset, proving it is not a stub", () => {
    const { visited } = graph(ADAPTER);
    const files = [...visited].map((f) => path.relative(SRC, f));
    expect(files).toContain("data/k201-analysis.ts");
    expect(files).toContain("data/seed.ts");
    expect(files).toContain("data/constants.ts");
  });

  it("is not imported by any file outside src/v2/server/calculations", () => {
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
        if (full.startsWith(path.join(SRC, "v2", "server", "calculations"))) continue;
        // Import specifiers only — a doc comment naming the adapter is
        // documentation, not a dependency.
        if (importsOf(full).some((spec) => spec.includes("calculations/engine-adapter"))) {
          offenders.push(path.relative(SRC, full));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
