// Keyboard-focus visibility check: tab into the header and screenshot.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = "qa/focus";
const port = process.argv[2] || "3000";
const BASE = `http://localhost:${port}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "aso-persona", value: "reliability_manager", url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  // Tab into the header controls (search is the first focusable after brand link).
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `focus-header-${theme}.png`), clip: { x: 0, y: 0, width: 1440, height: 120 } });
  // Tab further into the sidebar/body to check a body focus ring.
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `focus-body-${theme}.png`), clip: { x: 0, y: 100, width: 400, height: 300 } });
  await ctx.close();
}
await browser.close();
console.log("focus shots done");
