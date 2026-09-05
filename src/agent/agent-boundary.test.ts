import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Governed K-201 agent — durable source/dependency invariants, proven from the
 * committed source graph (never from `git diff`).
 *
 * Proves that:
 *   - the client case panel imports ONLY the client-safe contract and pure
 *     presentation helpers — no server module, read model, provider or
 *     authority-mutation seam, and reaches no `server-only` module transitively;
 *   - the client-safe contract (`agent/types.ts`) reaches no server-only code,
 *     no read model and no engine;
 *   - every server-only agent module declares `server-only`;
 *   - no agent module reaches an authority-mutation / ledger seam.
 *
 * Mirrors `v2/server/v2-workspaces-boundary.test.ts`.
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

const CLIENT_PANEL = "components/v2/agent/K201CasePanel.tsx";
const CLIENT_CONTRACT = "agent/types.ts";
const SERVER_AGENT_MODULES = [
  "agent/tools.ts",
  "agent/plan.ts",
  "agent/deterministic.ts",
  "agent/citation-validation.ts",
  "agent/prompts.ts",
  "agent/orchestrator.ts",
];

const FORBIDDEN_CLIENT_SPEC = [
  "v2/server/",
  "engine-adapter",
  "@/data",
  "command-orchestrator",
  "capability-resolver",
  "domain/reducer",
  "domain/policy",
  "domain/ledger",
  "governed-case",
  "@/agent/tools",
  "@/agent/orchestrator",
  "@/agent/deterministic",
  "@/agent/prompts",
  "@/agent/plan",
  "@/agent/citation-validation",
];

const MUTATION_SPECS = [
  "server/authority/command-orchestrator",
];

describe("the K-201 client case panel is browser-safe", () => {
  it("imports no server/engine/mutation/server-agent module directly", () => {
    const specs = importsOf(path.join(SRC, CLIENT_PANEL));
    const bad = specs.filter((s) => FORBIDDEN_CLIENT_SPEC.some((f) => s.includes(f)));
    expect(bad, `forbidden imports: ${bad.join(", ")}`).toEqual([]);
  });

  it("reaches no server-only module transitively", () => {
    const { visited, externals } = graph(CLIENT_PANEL);
    expect(externals.has("server-only")).toBe(false);
    const reachedServer = [...visited].some((f) =>
      toRepositoryPath(f).includes("/v2/server/"),
    );
    expect(reachedServer, "panel reaches a /v2/server/ module").toBe(false);
  });
});

describe("the client-safe agent contract reaches no server code", () => {
  it("agent/types.ts imports no server-only, read model or engine", () => {
    const { visited, externals } = graph(CLIENT_CONTRACT);
    expect(externals.has("server-only")).toBe(false);
    const reached = [...visited].map((f) => toRepositoryPath(f));
    expect(reached.some((f) => f.includes("/v2/server/"))).toBe(false);
    expect(reached.some((f) => f.includes("engine-adapter"))).toBe(false);
  });
});

describe("every server-only agent module is guarded and mutation-free", () => {
  for (const rel of SERVER_AGENT_MODULES) {
    it(`${rel} declares server-only`, () => {
      const { externals } = graph(rel);
      expect(externals.has("server-only")).toBe(true);
    });

    it(`${rel} reaches no authority-mutation / ledger seam`, () => {
      const { visited, externals } = graph(rel);
      const specHit = [...externals].filter((s) => MUTATION_SPECS.some((m) => s.includes(m)));
      const fileHit = [...visited]
        .map((f) => toRepositoryPath(f))
        .filter((f) => MUTATION_SPECS.some((m) => f.includes(m)));
      expect(specHit, `mutation specs: ${specHit.join(", ")}`).toEqual([]);
      expect(fileHit, `mutation files: ${fileHit.join(", ")}`).toEqual([]);
    });
  }
});
