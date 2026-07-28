// Playwright UX QA for the voice polish: state lifecycle, docked/overlay modes,
// accessible proposed action, honest mic, business labels, focus behavior.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "qa/voice-polish";
const PORT = process.argv[2] || "3000";
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (n, c, d = "") => results.push({ n, pass: !!c, d });
const errors = [];

async function ctxFor(browser, w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "aso-persona", value: "reliability_manager", url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
  return ctx;
}

const browser = await chromium.launch();

// ---------- 1024 overlay ----------
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1024, 768, theme);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`1024/${theme}: ${m.text()}`);
    if (m.type() === "warning" && /hydrat|ResizeObserver loop/i.test(m.text())) errors.push(`1024/${theme} warn: ${m.text()}`);
  });
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const launcher = page.locator('button[aria-label="Ask Asset Supervision OS"]');
  await launcher.focus();
  await launcher.click();
  await page.waitForTimeout(150);
  const dialog = page.locator('[role="dialog"]');
  ok(`1024/${theme} overlay is modal`, (await dialog.getAttribute("aria-modal")) === "true");
  ok(`1024/${theme} scrim present`, await page.locator("[data-voice-scrim]").count() === 1);
  ok(`1024/${theme} business label (no internal shorthand)`, /Gulf Coast Refinery/.test(await dialog.innerText()) && !/Plant: gc|Range: 30d|mock provider/.test(await dialog.innerText()));
  await page.screenshot({ path: path.join(OUT, `voice-ready-1024-${theme}.png`) });

  // Ask a suggestion → response ends in Ready (not Responding).
  await dialog.locator("button", { hasText: "Which decision requires my approval?" }).first().click();
  await page.waitForTimeout(700);
  const dtxt = await dialog.innerText();
  ok(`1024/${theme} ends in Ready state (not Responding)`, dtxt.includes("Ready") && !dtxt.includes("Responding"));
  await page.screenshot({ path: path.join(OUT, `voice-response-ready-1024-${theme}.png`) });

  // Honest mic: notice, focus to input, no fabricated turn.
  const turnsBefore = await dialog.locator("p.text-sm").count();
  await dialog.locator('button[aria-label="Voice capture (demo — not connected)"]').click();
  await page.waitForTimeout(150);
  ok(`1024/${theme} mic shows not-connected notice`, /not connected in this demonstration/i.test(await dialog.innerText()));
  ok(`1024/${theme} mic adds no transcript`, (await dialog.locator("p.text-sm").count()) === turnsBefore);
  ok(`1024/${theme} focus returns to text input`, await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Type your question"));
  await page.screenshot({ path: path.join(OUT, `mic-notice-1024-${theme}.png`) });

  // Proposed action: fully visible, above composer, CTA reachable, not executed.
  const input = dialog.locator('input[aria-label="Type your question"]');
  await input.fill("Approve the K-201 decision");
  await input.press("Enter");
  await page.waitForTimeout(700);
  ok(`1024/${theme} proposed action shown`, /Proposed action/i.test(await dialog.innerText()));
  const cta = dialog.getByRole("link", { name: /Review and confirm/ });
  ok(`1024/${theme} CTA visible`, await cta.isVisible());
  const ctaBox = await cta.boundingBox();
  const compBox = await input.boundingBox();
  const panelBox = await dialog.boundingBox();
  ok(`1024/${theme} CTA above composer`, ctaBox && compBox && ctaBox.y + ctaBox.height <= compBox.y + 2, `cta=${ctaBox?.y} comp=${compBox?.y}`);
  await cta.focus();
  const ctaFocused = await page.evaluate(() => (document.activeElement?.textContent || "").includes("Review and confirm"));
  ok(`1024/${theme} CTA focusable + within panel`, ctaFocused && ctaBox && panelBox && ctaBox.y >= panelBox.y && ctaBox.y + ctaBox.height <= panelBox.y + panelBox.height);
  ok(`1024/${theme} no approve/execute control in panel`, !/^Approve$|Execute|Confirm now/.test(await dialog.innerText()));
  await page.screenshot({ path: path.join(OUT, `proposed-action-1024-${theme}.png`) });
  await page.screenshot({ path: path.join(OUT, `proposed-cta-focused-1024-${theme}.png`) });

  // Focus trap in overlay.
  await dialog.locator('button[aria-label="Send"]').focus();
  await page.keyboard.press("Tab");
  ok(`1024/${theme} focus trapped in overlay`, await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));

  // Escape closes + focus returns to launcher.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  ok(`1024/${theme} Escape closes`, (await dialog.count()) === 0);
  ok(`1024/${theme} focus returns to launcher`, await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Ask Asset Supervision OS"));
  await page.screenshot({ path: path.join(OUT, `closed-after-escape-1024-${theme}.png`), clip: { x: 0, y: 0, width: 1024, height: 120 } });

  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  ok(`1024/${theme} no horizontal overflow`, overflow <= 0);
  await ctx.close();
}

// ---------- 1440 docked ----------
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1440, 900, theme);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`1440/${theme}: ${m.text()}`); });
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `assistant-closed-1440-${theme}.png`) });

  await page.locator('button[aria-label="Ask Asset Supervision OS"]').click();
  await page.waitForTimeout(250);
  const dialog = page.locator('[role="dialog"]');
  ok(`1440/${theme} docked (non-modal)`, (await dialog.getAttribute("aria-modal")) === "false");
  ok(`1440/${theme} no scrim when docked`, (await page.locator("[data-voice-scrim]").count()) === 0);

  const panelBox = await dialog.boundingBox();
  const decision = page.getByText("Reduce operating speed now and complete bearing inspection within 48 hours").first();
  const blocker = page.getByText("Key blocker").first();
  const decBox = await decision.boundingBox();
  const blkBox = await blocker.boundingBox();
  ok(`1440/${theme} decision visible beside panel (not covered)`, decBox && panelBox && decBox.x + decBox.width <= panelBox.x + 2, `decRight=${decBox && Math.round(decBox.x + decBox.width)} panelLeft=${panelBox && Math.round(panelBox.x)}`);
  ok(`1440/${theme} blocker visible beside panel`, blkBox && panelBox && blkBox.x + blkBox.width <= panelBox.x + 2);
  await page.screenshot({ path: path.join(OUT, `docked-open-1440-${theme}.png`) });

  await dialog.locator("button", { hasText: "Why is K-201 urgent?" }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `docked-response-1440-${theme}.png`) });
  const input = dialog.locator('input[aria-label="Type your question"]');
  await input.fill("Approve the K-201 decision"); await input.press("Enter"); await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `docked-proposed-1440-${theme}.png`) });

  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  ok(`1440/${theme} no horizontal overflow`, overflow <= 0);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log("\n=== VOICE POLISH QA ===");
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const f of failed) console.log(`  FAIL ${f.n} — ${f.d}`);
console.log(`console errors/warnings: ${errors.length}`);
for (const e of errors.slice(0, 4)) console.log("  " + e);
console.log("screenshots in " + OUT);
