// Playwright QA + automated shell/voice interaction checks.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "qa/voice";
const PORT = process.argv[2] || "3000";
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = "") => results.push({ name, pass: !!cond, detail });

async function ctxFor(browser, w, h, theme, persona) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "aso-persona", value: persona, url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
  return ctx;
}

const browser = await chromium.launch();
const errors = [];

async function gapAndOverflow(page, label) {
  const m = await page.evaluate(() => {
    const header = document.querySelector("header");
    const aside = document.querySelector("aside");
    const hb = header ? header.getBoundingClientRect() : null;
    const ab = aside ? aside.getBoundingClientRect() : null;
    return {
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      headerBottom: hb ? Math.round(hb.bottom) : null,
      asideTop: ab ? Math.round(ab.top) : null,
    };
  });
  ok(`${label}: no horizontal overflow`, m.overflow <= 0, `overflow=${m.overflow}`);
  if (m.asideTop !== null) {
    ok(`${label}: sidebar flush with header (no gap/overlap)`, Math.abs(m.asideTop - m.headerBottom) <= 2, `asideTop=${m.asideTop} headerBottom=${m.headerBottom}`);
  }
}

// ---- Landing screenshots (1024 + 1440) ----
const LANDINGS_1024 = [
  ["plant", "plant_manager", "/plant-overview"],
  ["reliability", "reliability_manager", "/reliability"],
  ["planner", "maintenance_planner", "/planning"],
  ["ai-admin", "ai_admin", "/agent-control"],
];
for (const theme of ["light", "dark"]) {
  for (const [label, persona, route] of LANDINGS_1024) {
    const ctx = await ctxFor(browser, 1024, 768, theme, persona);
    const page = await ctx.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`${label}-1024-${theme}: ${msg.text()}`); });
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await gapAndOverflow(page, `${label}-1024-${theme}`);
    // scrolled gap check
    await page.mouse.wheel(0, 500); await page.waitForTimeout(200);
    await gapAndOverflow(page, `${label}-1024-${theme} (scrolled)`);
    await page.mouse.wheel(0, -500); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `${label}-1024-${theme}.png`) });
    await ctx.close();
  }
  // 1440 reliability (confirm unchanged)
  const ctx = await ctxFor(browser, 1440, 900, theme, "reliability_manager");
  const page = await ctx.newPage();
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await gapAndOverflow(page, `reliability-1440-${theme}`);
  await page.screenshot({ path: path.join(OUT, `reliability-1440-${theme}.png`) });
  await ctx.close();
}

// ---- Search collapse/expand/Escape/focus (1024) ----
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1024, 768, theme, "reliability_manager");
  const page = await ctx.newPage();
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const inlineVisible = await page.locator('form[role="search"] input[type="search"]').first().isVisible().catch(() => false);
  const trigger = page.locator('button[aria-label="Open search"]');
  ok(`search collapsed at 1024 (${theme})`, (await trigger.isVisible()) && !inlineVisible);
  await page.screenshot({ path: path.join(OUT, `search-collapsed-1024-${theme}.png`), clip: { x: 0, y: 0, width: 1024, height: 110 } });
  await trigger.click();
  await page.waitForTimeout(150);
  const overlayInput = page.locator('div[role="search"] input[type="search"]');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("type") === "search");
  ok(`search expands and focuses input (${theme})`, (await overlayInput.isVisible()) && focused);
  await page.screenshot({ path: path.join(OUT, `search-expanded-1024-${theme}.png`), clip: { x: 0, y: 0, width: 1024, height: 110 } });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const overlayGone = !(await overlayInput.isVisible().catch(() => false));
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open search");
  ok(`search Escape dismisses + returns focus (${theme})`, overlayGone && focusBack);
  await ctx.close();
}

// ---- Voice panel: ready / responding / proposed-action + focus return (1024) ----
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1024, 768, theme, "reliability_manager");
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`voice-${theme}: ${m.text()}`); });
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const askBtn = page.locator('button[aria-label="Ask Asset Supervision OS"]');
  await askBtn.focus();
  await askBtn.click();
  await page.waitForTimeout(150);
  const dialog = page.locator('[role="dialog"]');
  ok(`voice panel opens (${theme})`, await dialog.isVisible());
  await page.screenshot({ path: path.join(OUT, `voice-ready-1024-${theme}.png`) });
  // responding: click a suggestion
  await page.locator('[role="dialog"] button', { hasText: "Which decision requires my approval?" }).first().click();
  await page.waitForTimeout(500);
  ok(`voice responds with grounded answer (${theme})`, await page.locator('[role="dialog"]').getByText(/approval/i).first().isVisible());
  await page.screenshot({ path: path.join(OUT, `voice-responding-1024-${theme}.png`) });
  // proposed action
  const input = page.locator('[role="dialog"] input[aria-label="Type your question"]');
  await input.fill("Approve the K-201 decision");
  await input.press("Enter");
  await page.waitForTimeout(500);
  ok(`voice proposes action (not executes) (${theme})`, await page.locator('[role="dialog"]').getByText(/Proposed action/i).first().isVisible());
  await page.screenshot({ path: path.join(OUT, `voice-proposed-1024-${theme}.png`) });
  // focus return on close
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const dialogGone = !(await dialog.isVisible().catch(() => false));
  const focusReturned = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Ask Asset Supervision OS");
  ok(`voice Escape closes + returns focus (${theme})`, dialogGone && focusReturned);
  // no authorization-context mutation
  const personaCookie = (await ctx.cookies()).find((c) => c.name === "aso-persona")?.value;
  ok(`persona/authorization context unchanged after voice+search (${theme})`, personaCookie === "reliability_manager", `cookie=${personaCookie}`);
  // persona name accessible even if truncated
  const aria = await page.locator('button[aria-haspopup="listbox"]').getAttribute("aria-label");
  ok(`persona accessible name preserved (${theme})`, /Reliability Manager/.test(aria || ""), aria || "");
  await ctx.close();
}

// ---- 1440 voice screenshot ----
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1440, 900, theme, "reliability_manager");
  const page = await ctx.newPage();
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="Ask Asset Supervision OS"]').click();
  await page.waitForTimeout(150);
  await page.locator('[role="dialog"] button', { hasText: "Why is K-201 urgent?" }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `voice-1440-${theme}.png`) });
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log("\n=== SHELL/VOICE QA ASSERTIONS ===");
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  " + e);
console.log("screenshots in " + OUT);
