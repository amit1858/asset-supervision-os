// Smoke test a DEPLOYED preview (not localhost). Provide the base URL via the
// QA_BASE_URL env var (or as the first CLI argument). No credentials, tokens,
// or deployment-specific data are embedded here — the target URL is supplied at
// run time, e.g.:  QA_BASE_URL="https://<preview>.vercel.app" node scripts/qa-preview-smoke.mjs
import { chromium } from "playwright";
const BASE = process.env.QA_BASE_URL || process.argv[2];
if (!BASE) {
  console.error("Set QA_BASE_URL or pass the preview base URL as the first argument.");
  process.exit(1);
}

const results = [];
const ok = (n, c, d = "") => results.push({ n, pass: !!c, d });

// Hosts owned by the Vercel platform (not our application). These are injected
// by Vercel itself on preview/protected deployments (e.g. vercel.live = the
// preview comment/feedback toolbar) and do not exist on production or
// self-hosted builds. The intended coverage of the "no external hosts" check is
// to prove OUR app makes no third-party API calls (NVIDIA, Snowflake, speech,
// model, etc.); platform infra hosts are therefore allow-listed so a genuine
// third-party host still fails the assertion.
const isPlatformHost = (h) =>
  h.endsWith(".vercel.app") ||
  h === "vercel.live" ||
  h.endsWith(".vercel.live") ||
  h === "vercel.com" ||
  h.endsWith(".vercel-scripts.com") ||
  h.includes("localhost");
const recordHost = (url) => {
  try {
    const h = new URL(url).host;
    if (!isPlatformHost(h)) externalHosts.add(h);
  } catch {}
};

const PAGES = [
  ["plant_manager", "/plant-overview", "Plant Executive Overview"],
  ["shift_supervisor", "/shift", "Shift Command"],
  ["reliability_manager", "/reliability", "Reliability Command Center"],
  ["reliability_engineer", "/watchlist", "Asset Watchlist"],
  ["maintenance_planner", "/planning", "Planning Workbench"],
  ["materials_coordinator", "/materials", "Material Exceptions"],
  ["turnaround_manager", "/turnaround", "Turnaround Control Tower"],
  ["ai_admin", "/agent-control", "Agent Control Tower"],
  ["reliability_engineer", "/assets/K-201", "Hydrogen recycle compressor"],
  ["reliability_manager", "/oee", "OEE Loss Intelligence"],
];

const browser = await chromium.launch();
const externalHosts = new Set();
const allConsole = [];

// Per-route load + console/overflow across themes and viewports.
for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }]) {
  for (const theme of ["light", "dark"]) {
    for (const [persona, route, expect] of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await ctx.addCookies([{ name: "aso-persona", value: persona, url: BASE }]);
      await ctx.addInitScript((t) => { try { localStorage.setItem("aso-theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      const errs = [];
      page.on("console", (m) => { if (m.type() === "error") { errs.push(m.text()); allConsole.push(`${route} ${m.text()}`);} if (m.type()==="warning" && /hydrat/i.test(m.text())) errs.push("HYDRATION:"+m.text()); });
      page.on("pageerror", (e) => errs.push("PAGEERR:"+String(e)));
      page.on("request", (r) => recordHost(r.url()));
      const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
      const status = resp?.status() ?? 0;
      const hasContent = await page.getByText(expect, { exact: false }).first().isVisible().catch(() => false);
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      const tag = `${route} ${vp.w} ${theme}`;
      ok(`${tag} loads 200 + content`, status === 200 && hasContent, `status=${status} content=${hasContent}`);
      ok(`${tag} no console/hydration errors`, errs.length === 0, errs.slice(0, 1).join(""));
      ok(`${tag} no horizontal overflow`, overflow <= 0, `of=${overflow}`);
      await ctx.close();
    }
  }
}

// Deep-route refresh + persona switch + voice UI + proposed action (1440 light).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "aso-persona", value: "reliability_manager", url: BASE }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("request", (r) => recordHost(r.url()));

  // deep-route refresh
  await page.goto(BASE + "/assets/K-201", { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  ok("deep-route refresh /assets/K-201 ok", await page.getByText("Hydrogen recycle compressor").first().isVisible());

  // Chief of Staff brief present
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  ok("Chief of Staff brief renders", await page.getByText("Reliability Daily Brief").first().isVisible());
  ok("Discuss brief launcher present", await page.getByRole("button", { name: /Discuss brief/ }).first().isVisible());

  // persona switch changes nav/landing
  await page.getByRole("button", { name: /Viewing as/ }).click();
  await page.getByRole("option", { name: /Plant Manager/ }).click();
  await page.waitForURL(/plant-overview/, { timeout: 10000 }).catch(() => {});
  ok("persona switch routes to Plant Overview", /plant-overview/.test(page.url()));

  // voice: header launcher → text question → grounded response uses same-app API
  await page.goto(BASE + "/reliability", { waitUntil: "networkidle" });
  let voiceApiHost = null;
  page.on("request", (r) => { if (r.url().includes("/api/voice/brief-conversation")) { try { voiceApiHost = new URL(r.url()).host; } catch {} } });
  await page.getByRole("button", { name: "Ask Asset Supervision OS" }).click();
  await page.waitForTimeout(300);
  const q = page.getByRole("dialog").getByRole("textbox", { name: "Type your question" });
  await q.fill("Why is K-201 urgent?");
  await q.press("Enter");
  await page.waitForTimeout(1800);
  ok("voice grounded response visible", await page.getByRole("dialog").getByText(/urgent|risk|approval/i).first().isVisible());
  ok("voice used same-app API host", voiceApiHost === new URL(BASE).host, `host=${voiceApiHost}`);
  // mic honesty
  await page.getByRole("dialog").getByRole("button", { name: /Voice capture/ }).click();
  ok("mock mic shows honest not-connected notice", await page.getByText(/not connected in this demonstration/i).first().isVisible());
  // proposed action requires confirmation, not executed
  const input = page.getByRole("dialog").getByRole("textbox", { name: "Type your question" });
  await input.fill("Approve the K-201 decision"); await input.press("Enter");
  await page.waitForTimeout(1500);
  ok("proposed action shown", await page.getByText(/Proposed action/i).first().isVisible());
  ok("Review and confirm CTA present", await page.getByRole("link", { name: /Review and confirm/ }).first().isVisible());
  const dtext = await page.getByRole("dialog").innerText();
  ok("no execute/approve control inside panel", !/\bExecute\b|Confirm now/.test(dtext));
  // escape closes + focus returns
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("Escape closes panel", (await page.getByRole("dialog").count()) === 0);
  await ctx.close();
}

await browser.close();

ok("no third-party (non-Vercel-platform) network hosts", externalHosts.size === 0, [...externalHosts].join(","));

const failed = results.filter((r) => !r.pass);
console.log(`\n=== PREVIEW SMOKE (${BASE}) ===`);
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const f of failed) console.log(`  FAIL ${f.n} — ${f.d}`);
console.log(`external hosts contacted: ${externalHosts.size ? [...externalHosts].join(", ") : "none"}`);
console.log(`console errors total: ${allConsole.length}`);
