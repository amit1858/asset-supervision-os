import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Voice UI must use semantic design tokens only — no hard-coded colours — so it
 * themes correctly in light and dark.
 */
const FILES = [
  "src/components/voice/VoiceBriefingPanel.tsx",
  "src/components/voice/VoiceLauncher.tsx",
  "src/components/brief/MyBrief.tsx",
];

describe("voice UI token compliance", () => {
  for (const rel of FILES) {
    it(`${rel} has no hard-coded colours`, () => {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      // No hex colours.
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
      // No non-semantic Tailwind palette utilities (bg-red-500, text-slate-700, …).
      expect(src).not.toMatch(/\b(bg|text|border)-(red|amber|yellow|green|blue|slate|gray|zinc|indigo|violet)-[0-9]/);
    });
  }
});
