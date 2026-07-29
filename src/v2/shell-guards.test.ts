import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";

/**
 * Structural guards for the V2 shell. These enforce the architectural decisions
 * that keep the shell data-driven and self-contained: no hard-coded persona
 * identities in shared components, and no external network hosts baked into
 * client shell code (the governed truth boundary stays server-side).
 */

const V2_DIR = join(process.cwd(), "src", "components", "v2");
const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

function v2Sources(): Array<{ file: string; text: string }> {
  return readdirSync(V2_DIR)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => ({ file: f, text: readFileSync(join(V2_DIR, f), "utf8") }));
}

describe("v2 shell guards", () => {
  it("has V2 shell components to check", () => {
    expect(v2Sources().length).toBeGreaterThan(0);
  });

  it("contains no hard-coded persona-id literals (nav/access come from the registry)", () => {
    for (const { file, text } of v2Sources()) {
      for (const id of PERSONA_IDS) {
        expect(
          text.includes(`"${id}"`) || text.includes(`'${id}'`),
          `${file} must not hard-code persona id ${id}`,
        ).toBe(false);
      }
    }
  });

  it("embeds no external network hosts in shell components", () => {
    for (const { file, text } of v2Sources()) {
      expect(/https?:\/\//.test(text), `${file} must not embed external URLs`).toBe(
        false,
      );
    }
  });
});
