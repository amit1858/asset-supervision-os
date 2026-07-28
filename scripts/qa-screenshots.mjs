// Browser QA screenshot suite for Asset Supervision OS.
// Usage: node scripts/qa-screenshots.mjs <outDir> [port]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "qa/baseline";
const port = process.argv[3] || "3000";
const BASE = `http://localhost:${port}`;
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 1024, h: 768 },
];
const THEMES = ["light", "dark"];
const SCREENS = [
  { label: "plant", persona: "plant_manager", path: "/plant-overview" },
  { label: "shift", persona: "shift_supervisor", path: "/shift" },
  { label: "reliability", persona: "reliability_manager", path: "/reliability" },
  { label: "engineer", persona: "reliability_engineer", path: "/watchlist" },
  { label: "planner", persona: "maintenance_planner", path: "/planning" },
  { label: "materials", persona: "materials_coordinator", path: "/materials" },
  { label: "turnaround", persona: "turnaround_manager", path: "/turnaround" },
  { label: "ai-admin", persona: "ai_admin", path: "/agent-control" },
  { label: "asset360", persona: "reliability_engineer", path: "/assets/K-201" },
  { label: "oee", persona: "reliability_manager", path: "/oee" },
];

const results = [];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const s of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
      });
      await context.addCookies([
        { name: "aso-persona", value: s.persona, url: BASE },
      ]);
      await context.addInitScript((t) => {
        try { localStorage.setItem("aso-theme", t); } catch {}
      }, theme);

      const page = await context.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));

      const label = `${s.label}-${vp.w}-${theme}`;
      try {
        await page.goto(BASE + s.path, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(
          () => document.scrollingElement.scrollWidth - window.innerWidth,
        );
        await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: false });
        results.push({ label, overflow, errors: errors.length, errList: errors.slice(0, 3) });
      } catch (e) {
        results.push({ label, overflow: "ERR", errors: -1, errList: [String(e).slice(0, 120)] });
      }
      await context.close();
    }
  }
}
await browser.close();

console.log("\n=== QA SUMMARY (" + outDir + ") ===");
const overflows = results.filter((r) => typeof r.overflow === "number" && r.overflow > 0);
const withErr = results.filter((r) => r.errors > 0);
console.log(`screens: ${results.length} | horizontal-overflow: ${overflows.length} | with-console-errors: ${withErr.length}`);
if (overflows.length) {
  console.log("\nOVERFLOW (px):");
  for (const r of overflows) console.log(`  ${r.label}: +${r.overflow}px`);
}
if (withErr.length) {
  console.log("\nCONSOLE ERRORS:");
  for (const r of withErr) console.log(`  ${r.label}: ${r.errList.join(" | ")}`);
}
console.log("\nDone.");
