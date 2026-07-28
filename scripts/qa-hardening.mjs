// Phase-2A hardening QA: shell first-paint stability (CLS + gap), voice-over-API,
// and required screenshots. Assertions printed as PASS/FAIL.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "qa/hardening";
const PORT = process.argv[2] || "3000";
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (n, c, d = "") => results.push({ n, pass: !!c, d });

async function ctxFor(browser, w, h, theme, persona) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "aso-persona", value: persona, url: BASE }]);
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("aso-theme", t); } catch {}
    // Accumulate layout-shift score from first paint.
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  }, theme);
  return ctx;
}

async function gap(page) {
  return page.evaluate(() => {
    const h = document.querySelector("header")?.getBoundingClientRect();
    const a = document.querySelector("aside")?.getBoundingClientRect();
    return {
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      gap: h && a ? Math.round(a.top - h.bottom) : null,
    };
  });
}

const browser = await chromium.launch();

// ---- 1024 first-paint stability + voice-over-API ----
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1024, 768, theme, "reliability_manager");
  const page = await ctx.newPage();
  const consoleIssues = [];
  const apiCalls = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error") consoleIssues.push("error: " + m.text());
    if (t === "warning" && /hydrat|ResizeObserver loop/i.test(m.text())) consoleIssues.push("warn: " + m.text());
  });
  page.on("request", (r) => { if (r.url().includes("/api/voice/brief-conversation")) apiCalls.push(r.method()); });

  // Immediately after DOMContentLoaded (before observer settles) — CSS fallback in effect.
  await page.goto(BASE + "/reliability", { waitUntil: "domcontentloaded" });
  const early = await gap(page);
  ok(`1024/${theme} first-paint gap ≤2px (CSS fallback)`, early.gap !== null && Math.abs(early.gap) <= 2, `gap=${early.gap}`);
  await page.screenshot({ path: path.join(OUT, `shell-load-1024-${theme}.png`) });

  // After settle (measured value).
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const settled = await gap(page);
  ok(`1024/${theme} settled gap ≤2px (measured)`, settled.gap !== null && Math.abs(settled.gap) <= 2, `gap=${settled.gap}`);
  ok(`1024/${theme} no horizontal overflow`, settled.overflow <= 0, `overflow=${settled.overflow}`);
  const cls = await page.evaluate(() => window.__cls || 0);
  ok(`1024/${theme} CLS < 0.05`, cls < 0.05, `cls=${cls.toFixed(4)}`);
  await page.screenshot({ path: path.join(OUT, `shell-settled-1024-${theme}.png`) });

  // Resize 1440 -> 1024 -> 1440, gap flush each time.
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(250);
  const at1440 = await gap(page);
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(250);
  const back1024 = await gap(page);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(250);
  const again1440 = await gap(page);
  ok(`resize gap flush 1440/1024/1440 (${theme})`, [at1440.gap, back1024.gap, again1440.gap].every((g) => g !== null && Math.abs(g) <= 2), `${at1440.gap},${back1024.gap},${again1440.gap}`);
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(200);

  // Search expanded.
  await page.locator('button[aria-label="Open search"]').click(); await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `search-expanded-1024-${theme}.png`), clip: { x: 0, y: 0, width: 1024, height: 110 } });
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);

  // Voice over API: open, ready, ask suggestion, response, proposed action.
  await page.locator('button[aria-label="Ask Asset Supervision OS"]').click(); await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `voice-ready-1024-${theme}.png`) });
  await page.locator('[role="dialog"] button', { hasText: "Which decision requires my approval?" }).first().click();
  await page.waitForTimeout(700);
  ok(`voice uses the server API (${theme})`, apiCalls.includes("POST"), `calls=${apiCalls.join(",")}`);
  ok(`voice renders grounded response (${theme})`, await page.locator('[role="dialog"]').getByText(/approval/i).first().isVisible());
  await page.screenshot({ path: path.join(OUT, `voice-response-1024-${theme}.png`) });
  const input = page.locator('[role="dialog"] input[aria-label="Type your question"]');
  await input.fill("Approve the K-201 decision"); await input.press("Enter"); await page.waitForTimeout(700);
  ok(`voice proposes action awaiting confirmation (${theme})`, await page.locator('[role="dialog"]').getByText(/Proposed action/i).first().isVisible());
  await page.screenshot({ path: path.join(OUT, `voice-proposed-1024-${theme}.png`) });

  ok(`1024/${theme} no console errors / hydration / RO-loop warnings`, consoleIssues.length === 0, consoleIssues.slice(0, 2).join(" | "));
  await ctx.close();
}

// ---- 1440 approved layout: voice closed + open ----
for (const theme of ["light", "dark"]) {
  const ctx = await ctxFor(browser, 1440, 900, theme, "reliability_manager");
  const page = await ctx.newPage();
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const g = await gap(page);
  ok(`1440/${theme} gap ≤2px + no overflow`, g.gap !== null && Math.abs(g.gap) <= 2 && g.overflow <= 0, `gap=${g.gap} of=${g.overflow}`);
  await page.screenshot({ path: path.join(OUT, `reliability-1440-${theme}.png`) });
  await page.locator('button[aria-label="Ask Asset Supervision OS"]').click(); await page.waitForTimeout(150);
  await page.locator('[role="dialog"] button', { hasText: "Why is K-201 urgent?" }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `reliability-voice-1440-${theme}.png`) });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log("\n=== HARDENING QA ===");
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const f of failed) console.log(`  FAIL ${f.n} — ${f.d}`);
console.log("screenshots in " + OUT);
