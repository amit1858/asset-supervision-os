// Build labeled visual-review contact sheets from existing final QA screenshots.
// Does NOT modify or regenerate the source screenshots.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "qa/final");
const OUT = path.join(ROOT, "qa/review");
mkdirSync(OUT, { recursive: true });

const META = {
  plant: { route: "/plant-overview", persona: "Plant Manager" },
  shift: { route: "/shift", persona: "Operations Shift Supervisor" },
  reliability: { route: "/reliability", persona: "Reliability Manager" },
  engineer: { route: "/watchlist", persona: "Reliability Engineer" },
  planner: { route: "/planning", persona: "Maintenance Planner" },
  materials: { route: "/materials", persona: "Materials & Spares Coordinator" },
  turnaround: { route: "/turnaround", persona: "Turnaround Manager" },
  "ai-admin": { route: "/agent-control", persona: "AI Control Tower Administrator" },
  asset360: { route: "/assets/K-201", persona: "Asset 360 (Reliability Engineer)" },
  oee: { route: "/oee", persona: "OEE Loss Intelligence (Reliability Manager)" },
};

const VP = { 1440: "1440×900", 1024: "1024×768", 1920: "1920×1080" };

// label, viewport, theme  ->  source file qa/final/<label>-<vw>-<theme>.png
function cell(label, vw, theme, thumbW) {
  const file = path.join(SRC, `${label}-${vw}-${theme}.png`);
  if (!existsSync(file)) throw new Error("missing screenshot: " + file);
  const src = pathToFileURL(file).href;
  const m = META[label];
  const themeLabel = theme[0].toUpperCase() + theme.slice(1);
  return `
    <figure class="cell">
      <figcaption>
        <span class="persona">${m.persona}</span>
        <span class="meta"><code>${m.route}</code> · ${VP[vw]} · ${themeLabel}</span>
      </figcaption>
      <img src="${src}" style="width:${thumbW}px" alt="${m.persona} ${m.route} ${VP[vw]} ${themeLabel}" />
    </figure>`;
}

function sheetHtml(title, cells, thumbW) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{color-scheme:light}
    *{box-sizing:border-box}
    body{margin:0;background:#e6e8ec;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif}
    header{padding:20px 24px 4px;color:#0f1728}
    header h1{margin:0;font-size:20px;font-weight:700}
    header p{margin:2px 0 0;font-size:13px;color:#475467}
    .grid{display:grid;grid-template-columns:repeat(2,${thumbW}px);gap:20px;padding:20px 24px 28px;width:max-content}
    .cell{margin:0;background:#fff;border:1px solid #cbd2dc;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.06)}
    figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e4e7ec}
    .persona{font-size:13px;font-weight:600;color:#101828}
    .meta{font-size:12px;color:#667085;white-space:nowrap}
    code{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#344054}
    img{display:block;height:auto;border-top:0}
  </style></head><body>
    <header><h1>${title}</h1><p>Asset Supervision OS — visual review · thumbnails preserve source aspect ratio · source: qa/final/ (unmodified)</p></header>
    <div class="grid">${cells.join("")}</div>
  </body></html>`;
}

const SHEETS = [
  {
    out: "1440-light-contact-sheet",
    title: "1440×900 · Light — 8 persona landings + Asset 360 + OEE",
    thumbW: 720,
    cells: [
      ["plant", 1440, "light"], ["shift", 1440, "light"], ["reliability", 1440, "light"],
      ["engineer", 1440, "light"], ["planner", 1440, "light"], ["materials", 1440, "light"],
      ["turnaround", 1440, "light"], ["ai-admin", 1440, "light"], ["asset360", 1440, "light"],
      ["oee", 1440, "light"],
    ],
  },
  {
    out: "1440-dark-contact-sheet",
    title: "1440×900 · Dark — 8 persona landings + Asset 360 + OEE",
    thumbW: 720,
    cells: [
      ["plant", 1440, "dark"], ["shift", 1440, "dark"], ["reliability", 1440, "dark"],
      ["engineer", 1440, "dark"], ["planner", 1440, "dark"], ["materials", 1440, "dark"],
      ["turnaround", 1440, "dark"], ["ai-admin", 1440, "dark"], ["asset360", 1440, "dark"],
      ["oee", 1440, "dark"],
    ],
  },
  {
    out: "1024-responsive-contact-sheet",
    title: "1024×768 · Responsive — light & dark mix",
    thumbW: 640,
    cells: [
      ["plant", 1024, "light"], ["shift", 1024, "dark"], ["reliability", 1024, "light"],
      ["planner", 1024, "dark"], ["materials", 1024, "light"], ["turnaround", 1024, "dark"],
      ["asset360", 1024, "light"], ["ai-admin", 1024, "dark"],
    ],
  },
];

const browser = await chromium.launch();
const outputs = [];
for (const s of SHEETS) {
  const cells = s.cells.map(([l, vw, t]) => cell(l, vw, t, s.thumbW));
  const html = sheetHtml(s.title, cells, s.thumbW);
  const htmlPath = path.join(OUT, s.out + ".html");
  writeFileSync(htmlPath, html);
  const width = s.thumbW * 2 + 20 + 48; // 2 cols + gap + page padding
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((i) =>
        i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }),
      ),
    ),
  );
  await page.waitForTimeout(200);
  const outPng = path.join(OUT, s.out + ".png");
  await page.screenshot({ path: outPng, fullPage: true });
  outputs.push(outPng);
  await ctx.close();
}
await browser.close();
console.log("Contact sheets written:");
for (const o of outputs) console.log("  " + o);
