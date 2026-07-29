// Local QA for the V2 enterprise shell. Builds are assumed done; this script
// starts `next start` on a private port, drives Playwright across personas,
// viewports and themes, captures screenshots to qa/v2-phase1/ (gitignored), and
// asserts: 200 + expected content, no console/hydration errors, no horizontal
// overflow at 1024px, and NO third-party network hosts (the governed truth
// boundary stays same-origin). No credentials or deployment data are embedded.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.QA_PORT || "3319";
const BASE = `http://localhost:${PORT}`;
const OUT = "qa/v2-phase1";
mkdirSync(OUT, { recursive: true });

const CTX = JSON.stringify({
  plantId: "plant-gc",
  unitId: "line-hds2",
  assetTag: "K-201",
  timeRange: "30d",
  shift: null,
});

const isLocal = (h) => h.includes("localhost") || h.startsWith("127.0.0.1");
const results = [];
const ok = (n, c, d = "") => results.push({ n, pass: !!c, d });

// Persona · v2 route · expected on-page text.
const PAGES = [
  ["plant_manager", "/v2/plant", "Plant Executive Overview"],
  ["shift_supervisor", "/v2/shift", "Shift Command"],
  ["reliability_manager", "/v2/reliability", "Reliability Command Center"],
  ["reliability_engineer", "/v2/watchlist", "Asset Watchlist"],
  ["maintenance_planner", "/v2/planning", "Planning Workbench"],
  ["materials_coordinator", "/v2/materials", "Material Exceptions"],
  ["turnaround_manager", "/v2/turnaround", "Turnaround Control Tower"],
  ["ai_admin", "/v2/agent-control", "AI Control Tower"],
  ["reliability_engineer", "/v2/assets/K-201", "Operational thread"],
  ["reliability_manager", "/v2/oee", "OEE & Loss Intelligence"],
  // Restricted case: materials coordinator cannot reach OEE.
  ["materials_coordinator", "/v2/oee", "not available for the current persona"],
];

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/v2/plant");
      if (r.status < 500) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

const server = spawn("npm", ["run", "start", "--", "-p", PORT], {
  shell: true,
  stdio: "ignore",
});

let exitCode = 0;
try {
  const up = await waitForServer();
  ok("next start is reachable", up, BASE);
  if (!up) throw new Error("server did not start");

  const browser = await chromium.launch();
  const externalHosts = new Set();

  for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }]) {
    for (const theme of ["light", "dark"]) {
      for (const [persona, route, expect] of PAGES) {
        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        await ctx.addCookies([
          { name: "aso-persona", value: persona, url: BASE },
          { name: "aso-ctx", value: encodeURIComponent(CTX), url: BASE },
        ]);
        await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
        const page = await ctx.newPage();
        const errs = [];
        page.on("console", (m) => {
          if (m.type() === "error") errs.push(m.text());
          if (m.type() === "warning" && /hydrat/i.test(m.text())) errs.push("HYDRATION:" + m.text());
        });
        page.on("pageerror", (e) => errs.push("PAGEERR:" + String(e)));
        page.on("request", (r) => { try { const h = new URL(r.url()).host; if (!isLocal(h)) externalHosts.add(h); } catch {} });

        const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
        const status = resp?.status() ?? 0;
        const hasContent = await page.getByText(expect, { exact: false }).first().isVisible().catch(() => false);
        const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
        const tag = `${route}[${persona}] ${vp.w} ${theme}`;
        ok(`${tag} loads 200 + content`, status === 200 && hasContent, `status=${status} content=${hasContent}`);
        ok(`${tag} no console/hydration errors`, errs.length === 0, errs.slice(0, 1).join(""));
        ok(`${tag} no horizontal overflow`, overflow <= 0, `of=${overflow}`);

        // Capture a representative screenshot set (1440 light + 1024 for a11y proof).
        const capture =
          (vp.w === 1440 && theme === "light") || (vp.w === 1024 && theme === "light");
        if (capture) {
          const slug = route.replace(/\//g, "_").replace(/^_/, "") + `_${persona}_${vp.w}_${theme}`;
          await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }

  // Assistant open + persona selector open (1440 light, reliability manager).
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([
      { name: "aso-persona", value: "reliability_manager", url: BASE },
      { name: "aso-ctx", value: encodeURIComponent(CTX), url: BASE },
    ]);
    const page = await ctx.newPage();
    page.on("request", (r) => { try { const h = new URL(r.url()).host; if (!isLocal(h)) externalHosts.add(h); } catch {} });
    await page.goto(BASE + "/v2/reliability", { waitUntil: "networkidle" });

    ok("Chief of Staff brief renders in v2", await page.getByText(/Daily Brief/).first().isVisible().catch(() => false));
    ok("operational thread renders in v2", await page.getByText("Operational thread").first().isVisible().catch(() => false));

    await page.getByRole("button", { name: "Ask Asset Supervision OS" }).click().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/assistant-open_reliability_1440.png`, fullPage: false });
    await page.keyboard.press("Escape").catch(() => {});

    await page.getByRole("button", { name: /Viewing as/ }).click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/persona-selector-open_1440.png`, fullPage: false });
    await ctx.close();
  }

  await browser.close();
  ok("no third-party network hosts", externalHosts.size === 0, [...externalHosts].join(","));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== V2 SHELL QA (${BASE}) ===`);
  console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
  for (const f of failed) console.log(`  FAIL ${f.n} — ${f.d}`);
  console.log(`screenshots: ${OUT}/`);
  exitCode = failed.length === 0 ? 0 : 1;
} catch (e) {
  console.error("QA error:", e);
  exitCode = 1;
} finally {
  try { server.kill("SIGTERM"); } catch {}
}
process.exit(exitCode);
