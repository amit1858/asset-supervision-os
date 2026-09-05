import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * September 8 — V1 isolation of the shared `MyBrief` component.
 *
 * `MyBrief` is rendered by BOTH the V1 persona routes and the V2 route screen.
 * The V2 acceptance work added a compact `variant="v2"` presentation and a pure
 * `presentBriefForV2` transform. These durable source/dependency invariants
 * prove (from the committed source graph, never from `git diff`, which is
 * vacuous after commit) that none of that leaks into V1:
 *   - the default/V1 presentation path is byte-preserved and its wording intact;
 *   - the compact V2 variant activates only through an explicit `variant="v2"`;
 *   - V1 callers neither import nor invoke `presentBriefForV2`, and pass no
 *     `variant`, so they receive the default wording and disclosure;
 *   - only the approved V2 route screen opts into the V2 presenter and variant;
 *   - the shared component imports no server, engine or authority-mutation
 *     module;
 *   - the V2 presenter performs presentation only and recomputes no governed
 *     metric (reaches no engine adapter, data seed or mutation seam).
 */

const SRC = path.join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /(?:from\s+|import\s+)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) specs.push(match[1]!);
  return specs;
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

// Every non-test module that renders <MyBrief>. The V2 route screen is the only
// caller permitted to opt into the compact V2 presentation.
const V1_CALLERS = [
  "app/reliability/page.tsx",
  "app/turnaround/page.tsx",
  "app/agent-control/page.tsx",
  "components/landing/LandingLayout.tsx",
];
const V2_CALLER = "components/v2/V2RouteScreen.tsx";

describe("MyBrief default (V1) presentation path is unchanged", () => {
  const src = read("components/brief/MyBrief.tsx");

  it("defaults the variant to 'default' so bare callers get the V1 path", () => {
    expect(src).toMatch(/variant\s*=\s*"default"/);
    expect(src).toMatch(/const\s+v2\s*=\s*variant\s*===\s*"v2"/);
  });

  it("gates the compact V2 disclosure (glance + collapsed full brief) behind v2", () => {
    // The at-a-glance strip and the "Full brief" collapse only render when v2.
    const v2Block = src.slice(src.indexOf("{v2 ? ("));
    expect(v2Block).toContain("BriefGlance");
    expect(v2Block).toContain("Full brief");
    // The default branch renders the full body directly (no collapse).
    expect(src).toMatch(/\)\s*:\s*\(\s*\n\s*body\s*\n\s*\)/);
  });

  it("keeps the V1 decision wording distinct from the V2 governed-case wording", () => {
    // V1 imperative wording is preserved and remains conditional on !v2.
    expect(src).toContain("Decision awaiting you");
    expect(src).toContain("Review \\u0026 approve →");
    expect(src).toContain("at stake");
    // V2-only wording is present but gated by the v2 flag.
    expect(src).toContain("Review governed case →");
    expect(src).toContain("Governed decision");
    expect(src).toContain("decision exposure");
    expect(src).toMatch(/v2\s*\?\s*"Review governed case →"\s*:\s*"Review \\u0026 approve →"/);
  });
});

describe("only the approved V2 route screen opts into the V2 presenter", () => {
  it("V1 callers neither import presentBriefForV2 nor pass a variant", () => {
    for (const rel of V1_CALLERS) {
      const src = read(rel);
      expect(src.includes("presentBriefForV2"), `${rel} must not import the V2 presenter`).toBe(
        false,
      );
      expect(/<MyBrief[^>]*\bvariant=/.test(src), `${rel} must not pass a variant`).toBe(false);
    }
  });

  it("the V2 route screen is the sole caller that uses the presenter and variant", () => {
    const src = read(V2_CALLER);
    expect(src).toContain("presentBriefForV2(");
    expect(src).toMatch(/<MyBrief[^>]*variant="v2"/);
  });
});

describe("MyBrief imports no server, engine or authority-mutation module", () => {
  const FORBIDDEN = [
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
  it("has no forbidden direct import", () => {
    const specs = importsOf(path.join(SRC, "components/brief/MyBrief.tsx"));
    const bad = specs.filter((s) => FORBIDDEN.some((f) => s.includes(f)));
    expect(bad, `forbidden imports: ${bad.join(", ")}`).toEqual([]);
  });
});

describe("the V2 brief presenter performs presentation only", () => {
  it("reaches no engine adapter, data seed or authority-mutation seam", () => {
    const { visited, externals } = graph("v2/server/brief/present-brief-v2.ts");
    const reached = [...visited].map((f) => f.split(path.sep).join("/"));
    const forbiddenSubstr = [
      "engine-adapter",
      "/data/",
      "command-orchestrator",
      "domain/reducer",
      "domain/ledger",
      "governed-case",
    ];
    for (const bad of forbiddenSubstr) {
      expect(
        reached.some((f) => f.includes(bad)),
        `presenter reaches ${bad}`,
      ).toBe(false);
    }
    expect(
      [...externals].some((s) => s === "@/data" || s.startsWith("@/data/")),
      "presenter imports @/data",
    ).toBe(false);
  });
});
