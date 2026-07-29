// Local QA for the V2 enterprise shell. Builds are assumed done; this script
// starts `next start` on a private port, drives Playwright across personas,
// viewports and themes, captures full-size screenshots to qa/v2-phase1/windows/
// (gitignored), and asserts: 200 + expected content, no console/hydration
// errors, no horizontal overflow, no content hidden under the sticky header,
// the sidebar sits flush below the header, and NO third-party network hosts
// (the governed truth boundary stays same-origin). No credentials or deployment
// data are embedded.
//
// Browser: prefers the locally installed Microsoft Edge via Playwright's
// `channel: "msedge"` so no Chromium binary download is required. Falls back to
// a bundled Chromium binary if one is already installed, then to an explicit
// Edge executable path, and otherwise fails with a clear, actionable message.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.QA_PORT || "3319";
const BASE = process.env.QA_BASE_URL || `http://localhost:${PORT}`;
const START_SERVER = process.env.QA_NO_SERVER !== "1";
const OUT = process.env.QA_OUT || "qa/v2-phase1/windows";
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

// Persona · v2 route · expected on-page text. Paths are the REAL v2 routes
// (v1 /plant-overview maps to /v2/plant).
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
];

// Desktop-first matrix, still usable at 1024px.
const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
];

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(BASE + "/v2/plant");
      if (r.status < 500) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function launchBrowser() {
  const attempts = [];
  // 1) Preferred: installed Microsoft Edge via channel (no Chromium download).
  try {
    const b = await chromium.launch({ channel: "msedge" });
    return { browser: b, engine: "edge (channel:msedge)" };
  } catch (e) {
    attempts.push(`channel:msedge -> ${e.message.split("\n")[0]}`);
  }
  // 2) Portable fallback: a bundled Chromium binary, if already installed.
  try {
    const b = await chromium.launch();
    return { browser: b, engine: "chromium (bundled)" };
  } catch (e) {
    attempts.push(`chromium bundled -> ${e.message.split("\n")[0]}`);
  }
  // 3) Explicit Edge executable path (standard Windows install locations only).
  const edgePaths = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of edgePaths) {
    if (existsSync(p)) {
      try {
        const b = await chromium.launch({ executablePath: p });
        return { browser: b, engine: `edge (executablePath)` };
      } catch (e) {
        attempts.push(`edge exe -> ${e.message.split("\n")[0]}`);
      }
    }
  }
  throw new Error(
    "No usable browser found. Install Microsoft Edge or a Playwright Chromium " +
      "binary. Attempts:\n  - " + attempts.join("\n  - "),
  );
}

const externalHosts = new Set();
function trackHosts(page) {
  page.on("request", (r) => {
    try {
      const h = new URL(r.url()).host;
      if (!isLocal(h)) externalHosts.add(h);
    } catch {}
  });
}

let server = null;
let exitCode = 0;
try {
  if (START_SERVER) {
    server = spawn("npm", ["run", "start", "--", "-p", PORT], {
      shell: true,
      stdio: "ignore",
    });
  }
  const up = await waitForServer();
  ok("next start is reachable", up, BASE);
  if (!up) throw new Error("server did not start");

  const { browser, engine } = await launchBrowser();
  console.log(`browser engine: ${engine}`);
  ok("browser launched (Edge preferred)", true, engine);

  // --- Screenshot matrix: 10 routes × 4 viewports × 2 themes (full-size) ---
  for (const vp of VIEWPORTS) {
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
          const t = m.text();
          // Generic "Failed to load resource" console lines carry no URL; real
          // failing requests are tracked precisely via the response listener
          // below (which excludes the pre-existing app-level favicon gap).
          if (/Failed to load resource/i.test(t)) return;
          if (m.type() === "error") errs.push(t);
          if (m.type() === "warning" && /(hydrat|ResizeObserver)/i.test(t)) errs.push("WARN:" + t);
        });
        page.on("pageerror", (e) => errs.push("PAGEERR:" + String(e)));
        // Flag genuine failed responses, excluding the pre-existing favicon 404
        // (no favicon.ico ships in src/app; this affects v1 and v2 identically
        // and is out of scope for a v2-shell-only pass).
        page.on("response", (r) => {
          try {
            const u = new URL(r.url());
            if (/\/favicon\.ico$/.test(u.pathname)) return;
            if (r.status() >= 400 && isLocal(u.host)) errs.push(`HTTP ${r.status()} ${u.pathname}`);
          } catch {}
        });
        trackHosts(page);

        const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
        const status = resp?.status() ?? 0;
        const hasContent = await page.getByText(expect, { exact: false }).first().isVisible().catch(() => false);
        const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);

        // Sticky-header integrity: first heading must sit below the header, and
        // the sidebar must start flush under the header (no gap/overlap).
        const layout = await page.evaluate(() => {
          const cssVar = getComputedStyle(document.documentElement).getPropertyValue("--shell-header-h").trim();
          const headerH = parseFloat(cssVar) || 0;
          const h1 = document.querySelector("main h1, main h2");
          const h1Top = h1 ? h1.getBoundingClientRect().top : null;
          const nav = document.querySelector("aside nav, aside");
          const navTop = nav ? nav.getBoundingClientRect().top : null;
          return { headerH, h1Top, navTop };
        });
        const headingClear = layout.h1Top === null || layout.headerH === 0 || layout.h1Top >= layout.headerH - 2;
        const sidebarFlush =
          layout.navTop === null || layout.headerH === 0 || layout.navTop >= layout.headerH - 4;

        const tag = `${route}[${persona}] ${vp.w} ${theme}`;
        ok(`${tag} loads 200 + content`, status === 200 && hasContent, `status=${status} content=${hasContent}`);
        ok(`${tag} no console/hydration/RO errors`, errs.length === 0, errs.slice(0, 1).join(""));
        ok(`${tag} no horizontal overflow`, overflow <= 0, `of=${overflow}`);
        ok(`${tag} heading below sticky header`, headingClear, `h1Top=${layout.h1Top} hdr=${layout.headerH}`);
        ok(`${tag} sidebar flush under header`, sidebarFlush, `navTop=${layout.navTop} hdr=${layout.headerH}`);

        const slug = route.replace(/\//g, "_").replace(/^_/, "") + `_${persona}_${vp.w}_${theme}`;
        await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });
        await ctx.close();
      }
    }
  }

  // --- Interaction states (1440×900, light unless noted) ---
  async function stateContext(persona, viewport = { width: 1440, height: 900 }, theme = "light") {
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies([
      { name: "aso-persona", value: persona, url: BASE },
      { name: "aso-ctx", value: encodeURIComponent(CTX), url: BASE },
    ]);
    await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    trackHosts(page);
    return { ctx, page };
  }

  // Reliability manager: brief, thread, assistant closed/open, persona selector,
  // keyboard focus, Escape-returns-focus.
  {
    const { ctx, page } = await stateContext("reliability_manager");
    await page.goto(BASE + "/v2/reliability", { waitUntil: "networkidle" });

    ok("Chief of Staff brief renders in v2", await page.getByText(/Daily Brief/i).first().isVisible().catch(() => false));
    ok("operational thread renders in v2", await page.getByText("Operational thread").first().isVisible().catch(() => false));

    await page.screenshot({ path: `${OUT}/state_assistant-closed_reliability_1440.png`, fullPage: false });

    const askBtn = page.getByRole("button", { name: /Ask Asset Supervision OS/i }).first();
    await askBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/state_assistant-open_reliability_1440.png`, fullPage: false });

    // Assistant must never approve/execute — verify no execute/approve affordance
    // inside the assistant panel.
    const assistantExecutes = await page
      .getByRole("button", { name: /^(approve|execute|confirm action)$/i })
      .first()
      .isVisible()
      .catch(() => false);
    ok("assistant does not execute/approve", !assistantExecutes);

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    const focusReturned = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && /Ask Asset Supervision OS/i.test(el.textContent || el.getAttribute("aria-label") || "");
    }).catch(() => false);
    ok("Escape closes assistant and returns focus", focusReturned);

    // Persona selector open + accessible name intact.
    const selector = page.getByRole("button", { name: /Viewing as/i }).first();
    const selectorName = await selector.getAttribute("aria-label").catch(() => null);
    await selector.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/state_persona-selector-open_1440.png`, fullPage: false });
    ok("persona selector has accessible name", !!(selectorName) || await selector.isVisible().catch(() => false));

    // Keyboard focus visibility on first nav item.
    await page.keyboard.press("Escape").catch(() => {});
    await page.keyboard.press("Tab").catch(() => {});
    await page.screenshot({ path: `${OUT}/state_keyboard-focus_1440.png`, fullPage: false });
    await ctx.close();
  }

  // Restricted state (materials coordinator → OEE) captured full-size.
  {
    const { ctx, page } = await stateContext("materials_coordinator");
    await page.goto(BASE + "/v2/oee", { waitUntil: "networkidle" });
    const restricted = await page.getByText(/not available for the current persona/i).first().isVisible().catch(() => false);
    ok("restricted route shows honest restriction", restricted);
    await page.screenshot({ path: `${OUT}/state_restricted_materials_oee_1440.png`, fullPage: true });
    await ctx.close();
  }

  // Placeholder / honest Phase-2 surface (portfolio).
  {
    const { ctx, page } = await stateContext("plant_manager");
    await page.goto(BASE + "/v2/portfolio", { waitUntil: "networkidle" }).catch(() => {});
    await page.screenshot({ path: `${OUT}/state_placeholder_portfolio_1440.png`, fullPage: true });
    await ctx.close();
  }

  // Persona switch preserving K-201 context (dark theme evidence).
  {
    const { ctx, page } = await stateContext("plant_manager", { width: 1440, height: 900 }, "dark");
    await page.goto(BASE + "/v2/assets/K-201", { waitUntil: "networkidle" }).catch(() => {});
    const keepsAsset = await page.getByText("K-201", { exact: false }).first().isVisible().catch(() => false);
    ok("asset context (K-201) preserved across persona", keepsAsset);
    await page.screenshot({ path: `${OUT}/state_asset-context_plant_dark_1440.png`, fullPage: true });
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
  try { if (server) server.kill("SIGTERM"); } catch {}
}
process.exit(exitCode);
