import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.QA_BYOK_PORT || "3322";
const BASE = `http://localhost:${PORT}`;
const TEST_KEY = "test-provider-key-not-a-real-credential";
const results = [];
const ok = (name, condition, detail = "") =>
  results.push({ name, pass: Boolean(condition), detail });

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/v2/plant`);
      if (response.status < 500) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

function installAuthenticatedSession(page, state) {
  return page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        state.authenticated
          ? {
              user: { name: "BYOK Test User" },
              provider: "github",
              expires: "2099-01-01T00:00:00.000Z",
            }
          : {},
      ),
    });
  });
}

let server;
let browser;
let exitCode = 0;
try {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", PORT],
    {
    env: {
      ...process.env,
      AUTH_SECRET: "qa-auth-secret-sentinel-not-a-real-credential",
      AUTH_GITHUB_ID: "",
      AUTH_GITHUB_SECRET: "",
    },
    stdio: "ignore",
    },
  );
  const up = await waitForServer();
  ok("production server reachable", up);
  if (!up) throw new Error("server did not start");

  browser = await chromium.launch({ channel: "msedge" });

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/v2/plant`, { waitUntil: "networkidle" });
    const guestControl = page.locator(
      'button[aria-label*="model connection unavailable in Guest Demo"]',
    );
    ok("guest model control is visible", await guestControl.isVisible());
    ok(
      "guest control is keyboard reachable",
      await guestControl.evaluate((element) => element.tabIndex >= 0),
    );
    ok(
      "guest control exposes unavailable semantics",
      (await guestControl.getAttribute("aria-disabled")) === "true",
    );
    await guestControl.evaluate((element) => element.click());
    ok(
      "guest cannot connect a provider",
      (await page.getByRole("dialog", { name: "Connect your model" }).count()) === 0,
    );
    ok(
      "guest explanation is deterministic",
      (await guestControl.getAttribute("title"))?.includes(
        "Guest Demo uses governed deterministic narration",
      ),
    );
    await context.close();
  }

  for (const width of [390, 430, 768, 1024, 1280, 1366, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 900 },
    });
    const page = await context.newPage();
    const authState = { authenticated: true };
    await installAuthenticatedSession(page, authState);
    let directNvidiaRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("integrate.api.nvidia.com")) {
        directNvidiaRequests += 1;
      }
    });
    await page.route("**/api/ai/model-connection", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Cache-Control": "no-store, private, max-age=0" },
          body: JSON.stringify({
            provider: "nvidia",
            endpoint: "https://integrate.api.nvidia.com/v1",
            model: "nvidia/nemotron-3.5-lightning-30b-a3b",
          }),
        });
        return;
      }
      ok(
        `credential sent only to server test endpoint at ${width}px`,
        route.request().headers()["x-aso-nvidia-api-key"] === TEST_KEY,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store, private, max-age=0" },
        body: JSON.stringify({
          status: "connection_test_succeeded",
          provider: "nvidia",
          endpoint: "https://integrate.api.nvidia.com/v1",
          model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        }),
      });
    });

    await page.goto(`${BASE}/v2/plant`, { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Connect your model" });
    ok(`authenticated connection trigger available at ${width}px`, await trigger.isEnabled());
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Connect your model" });
    ok(`connection dialog opens at ${width}px`, await dialog.isVisible());
    const input = page.getByLabel("NVIDIA API key", { exact: true });
    ok(`credential is masked at ${width}px`, (await input.getAttribute("type")) === "password");
    await input.fill(TEST_KEY);
    ok(
      `credential is not reflected into rendered HTML at ${width}px`,
      !(await page.locator("html").evaluate(
        (element, secret) => element.outerHTML.includes(secret),
        TEST_KEY,
      )),
    );
    await page.getByRole("button", { name: "Show NVIDIA API key" }).click();
    ok(`show key control works at ${width}px`, (await input.getAttribute("type")) === "text");
    await page.getByRole("button", { name: "Hide NVIDIA API key" }).click();
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByText("Connection test succeeded.", { exact: false }).waitFor();
    const connect = page.getByRole("button", {
      name: "Connect for this session",
    });
    ok(`tested is distinct from connected at ${width}px`, await connect.isEnabled());
    await connect.click();
    ok(
      `connected state shown at ${width}px`,
      await page.getByText("Connected until reload", { exact: true }).isVisible(),
    );

    const persistence = await page.evaluate((secret) => ({
      local: Object.values(localStorage).some((value) => value.includes(secret)),
      session: Object.values(sessionStorage).some((value) => value.includes(secret)),
      html: document.documentElement.outerHTML.includes(secret),
      cookie: document.cookie.includes(secret),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }), TEST_KEY);
    ok(`no localStorage credential at ${width}px`, !persistence.local);
    ok(`no sessionStorage credential at ${width}px`, !persistence.session);
    ok(`no rendered-HTML credential at ${width}px`, !persistence.html);
    ok(`no cookie credential at ${width}px`, !persistence.cookie);
    ok(
      `connection UI has no document overflow at ${width}px`,
      persistence.scrollWidth <= persistence.clientWidth,
      `${persistence.scrollWidth}/${persistence.clientWidth}`,
    );
    ok(`browser never calls NVIDIA directly at ${width}px`, directNvidiaRequests === 0);

    if (width === 390) {
      await page.evaluate(() =>
        window.dispatchEvent(new Event("aso:auth-signout")),
      );
      await page.waitForTimeout(100);
      ok(
        "sign-out clears the session connection",
        await page
          .locator('button[aria-label="Connect your model"]')
          .isVisible(),
      );
    } else if (width === 430) {
      await page.getByRole("button", { name: "Disconnect" }).click();
      ok(
        "disconnect clears the session connection",
        await page.getByText("Disconnected", { exact: true }).isVisible(),
      );
    }

    await page.keyboard.press("Escape");
    const restoredTrigger = page.locator(
      'button[aria-label="Connect your model"], button[aria-label^="NVIDIA connected"]',
    );
    ok(
      `Escape closes and restores focus at ${width}px`,
      await restoredTrigger.first().evaluate(
        (element) => document.activeElement === element,
      ),
    );
    await page.reload({ waitUntil: "networkidle" });
    ok(
      `reload clears connection at ${width}px`,
      await page.getByRole("button", { name: "Connect your model" }).isVisible(),
    );
    await context.close();
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}

const failed = results.filter((result) => !result.pass);
console.log(`\n=== SESSION BYOK QA (${BASE}) ===`);
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const result of failed) {
  console.log(`  FAIL ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}
if (failed.length > 0) exitCode = 1;
process.exit(exitCode);
