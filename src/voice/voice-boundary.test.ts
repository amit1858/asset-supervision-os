import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Proves the CLIENT voice dependency graph never reaches server-only truth
 * construction or the seeded dataset — grounding happens only over the API.
 */
const SRC = path.join(process.cwd(), "src");

const CLIENT_ENTRIES = [
  "voice/VoiceContext.tsx",
  "voice/index.ts",
  "components/voice/VoiceBriefingPanel.tsx",
  "components/voice/VoiceLauncher.tsx",
];

const FORBIDDEN = [
  "brief/service.ts",
  "data/seed.ts",
  "data/generate.ts",
  "data/repository.ts",
  "voice/mock-conversation.ts",
  "voice/server/conversation-service.ts",
].map((f) => path.join(SRC, f));

function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // external module (react, next/*, zod, server-only, …)
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /(?:from\s+|import\s+)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) specs.push(m[1]!);
  return specs;
}

function graph(entryRel: string) {
  const visited = new Set<string>();
  const externals = new Set<string>();
  const stack = [path.join(SRC, entryRel)];
  while (stack.length) {
    const f = stack.pop()!;
    if (visited.has(f)) continue;
    visited.add(f);
    for (const spec of importsOf(f)) {
      const resolved = resolveSpec(spec, f);
      if (resolved) stack.push(resolved);
      else externals.add(spec);
    }
  }
  return { visited, externals };
}

describe("voice client dependency graph", () => {
  for (const entry of CLIENT_ENTRIES) {
    it(`${entry} does not reach truth-construction or seeded data`, () => {
      const { visited, externals } = graph(entry);
      for (const forbidden of FORBIDDEN) {
        expect(visited.has(forbidden), `${entry} → ${path.relative(SRC, forbidden)}`).toBe(false);
      }
      // A client-reachable file importing `server-only` would itself be the leak.
      expect(externals.has("server-only"), `${entry} imports server-only`).toBe(false);
    });
  }
});
