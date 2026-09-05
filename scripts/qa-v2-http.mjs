// Headless HTTP smoke for the V2 shell — a browserless fallback used when
// Playwright browser binaries cannot be downloaded in this environment. It starts
// `next start`, requests each /v2 route with a persona cookie, and asserts the
// server-rendered HTML returns 200 with the expected content and correct access
// gating. It also asserts the markup embeds no third-party (non-local) hosts.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.QA_PORT || "3321";
const BASE = `http://localhost:${PORT}`;
const CTX = encodeURIComponent(
  JSON.stringify({ plantId: "plant-gc", unitId: "line-hds2", assetTag: "K-201", timeRange: "30d", shift: null }),
);

const results = [];
const ok = (n, c, d = "") => results.push({ n, pass: !!c, d });

// persona · route · expected substring · expected final status
const CASES = [
  ["plant_manager", "/v2/plant", "Plant Executive Overview", 200],
  ["shift_supervisor", "/v2/shift", "Shift Command", 200],
  ["reliability_manager", "/v2/reliability", "Reliability Command Center", 200],
  ["reliability_engineer", "/v2/watchlist", "Asset Watchlist", 200],
  ["maintenance_planner", "/v2/planning", "Planning Workbench", 200],
  ["materials_coordinator", "/v2/materials", "Material Exceptions", 200],
  ["turnaround_manager", "/v2/turnaround", "Turnaround Control Tower", 200],
  ["ai_admin", "/v2/agent-control", "AI Control Tower", 200],
  ["reliability_manager", "/v2/oee", "OEE &amp; loss intelligence", 200],
  ["plant_manager", "/v2/value-realisation", "Value Realisation", 200],
  ["reliability_engineer", "/v2/assets/K-201", "Operational thread", 200],
  // Maintenance & Materials workspace content anchors (added Sept 8 slice)
  ["materials_coordinator", "/v2/materials", "Maintenance &amp; materials", 200],
  ["materials_coordinator", "/v2/materials", "Materials readiness vs inventory health", 200],
  ["materials_coordinator", "/v2/materials", "Inventory position bridge", 200],
  ["materials_coordinator", "/v2/materials", "Who owns the next decision", 200],
  ["materials_coordinator", "/v2/materials", "WO-48231", 200],
  // Turnaround Control workspace anchors (added Sept 9 slice)
  ["turnaround_manager", "/v2/turnaround", "A fit is not a licence to wait", 200],
  ["turnaround_manager", "/v2/turnaround", "Immediate work vs turnaround-held work", 200],
  ["turnaround_manager", "/v2/turnaround", "wp-k201", 200],
  ["turnaround_manager", "/v2/turnaround", "WO-48102", 200],
  // OEE & Loss Intelligence workspace anchors (added Sept 9 slice)
  ["reliability_manager", "/v2/oee", "Governed OEE", 200],
  ["reliability_manager", "/v2/oee", "Where the lost production went", 200],
  ["reliability_manager", "/v2/oee", "Line-level, not per-asset", 200],
  // Value Realisation workspace anchors (added Sept 9 slice)
  ["plant_manager", "/v2/value-realisation", "Four distinct value concepts", 200],
  ["plant_manager", "/v2/value-realisation", "Not yet available", 200],
  ["plant_manager", "/v2/value-realisation", "Projected value enabled", 200],
  ["plant_manager", "/v2/value-realisation", "Sourced record", 200],
  // access gating (renders restricted state, still 200)
  ["materials_coordinator", "/v2/oee", "not available for the current persona", 200],
  ["reliability_engineer", "/v2/agent-control", "not available for the current persona", 200],
  ["ai_admin", "/v2/assets/K-201", "not available for the current persona", 200],
  // redirect: /v2 → persona landing
  ["reliability_manager", "/v2", "Reliability Command Center", 200],
];

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + "/v2/plant", { headers: cookie("plant_manager") }); if (r.status < 500) return true; } catch {}
    await sleep(1000);
  }
  return false;
}

function cookie(persona) {
  return { cookie: `aso-persona=${persona}; aso-ctx=${CTX}` };
}

const server = spawn("npm", ["run", "start", "--", "-p", PORT], { shell: true, stdio: "ignore" });
let exitCode = 0;
try {
  const up = await waitForServer();
  ok("next start reachable", up, BASE);
  if (!up) throw new Error("server did not start");

  const externalHosts = new Set();
  for (const [persona, route, expect, expStatus] of CASES) {
    const resp = await fetch(BASE + route, { headers: cookie(persona), redirect: "follow" });
    const html = await resp.text();
    ok(`${route}[${persona}] status ${expStatus}`, resp.status === expStatus, `got ${resp.status}`);
    ok(`${route}[${persona}] content present`, html.includes(expect), `missing: ${expect}`);
    for (const m of html.matchAll(/https?:\/\/([^\/"'\s]+)/g)) {
      const h = m[1];
      if (!h.includes("localhost") && !h.startsWith("127.0.0.1") && h !== "www.w3.org") externalHosts.add(h);
    }
  }
  ok("no third-party hosts in server-rendered markup", externalHosts.size === 0, [...externalHosts].join(","));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== V2 HTTP SMOKE (${BASE}) ===`);
  console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
  for (const f of failed) console.log(`  FAIL ${f.n} — ${f.d}`);
  exitCode = failed.length === 0 ? 0 : 1;
} catch (e) {
  console.error("smoke error:", e);
  exitCode = 1;
} finally {
  try { server.kill("SIGTERM"); } catch {}
}
process.exit(exitCode);
