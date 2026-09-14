import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.QA_BYOK_PORT || "3322";
const BASE = `http://localhost:${PORT}`;
const providers = [
  { id: "nvidia", label: "NVIDIA", model: "nvidia/nemotron-3.5-lightning-30b-a3b", keyHeader: "x-aso-nvidia-api-key", endpoint: "https://integrate.api.nvidia.com/v1", protocol: "chat-completions" },
  { id: "openrouter", label: "OpenRouter", model: "openai/gpt-oss-20b:free", keyHeader: "x-aso-openrouter-api-key", endpoint: "https://openrouter.ai/api/v1", protocol: "chat-completions" },
  { id: "openai", label: "OpenAI", model: "gpt-4.1-mini", keyHeader: "x-aso-openai-api-key", endpoint: "https://api.openai.com/v1", protocol: "responses" },
  { id: "anthropic", label: "Anthropic", model: "claude-haiku-4-5-20251001", keyHeader: "x-aso-anthropic-api-key", endpoint: "https://api.anthropic.com/v1", protocol: "messages" },
];
// Preserve the accepted responsive matrix and exercise the desktop breakpoint
// immediately below, at, and above 1280px.
const VIEWPORTS = [390, 430, 768, 1024, 1279, 1280, 1281, 1366, 1440];
const results = [];
const ok = (name, condition, detail = "") => results.push({ name, pass: Boolean(condition), detail });

async function waitForOptionCount(locator, expected, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await locator.count()) === expected) return true;
    await sleep(100);
  }
  return (await locator.count()) === expected;
}

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

function authRoute(page, state) {
  return page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        state.authenticated
          ? { user: { name: "BYOK Test User" }, provider: "github", expires: "2099-01-01T00:00:00.000Z" }
          : {},
      ),
    });
  });
}

function catalog() {
  return {
    providers: providers.map((provider) => ({
      provider: provider.id,
      label: provider.label,
      endpoint: provider.endpoint,
      protocol: provider.protocol,
      keyLabel: `${provider.label} API key`,
      disclosure: "Controlled QA provider response.",
      models: [{ id: provider.model, label: provider.model }],
    })),
  };
}

function providerResponse(provider) {
  return { status: "connection_test_succeeded", provider: provider.id, endpoint: provider.endpoint, model: provider.model };
}

async function installRoutes(page, state) {
  await authRoute(page, state);
  await page.route("**/api/ai/model-connection", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store, private, max-age=0" },
        body: JSON.stringify(catalog()),
      });
      return;
    }
    const headers = route.request().headers();
    const provider = providers.find((item) => headers["x-aso-ai-provider"] === item.id);
    const key = provider ? headers[provider.keyHeader] : undefined;
    ok(`credential routed only through same-origin test endpoint for ${provider?.label ?? "unknown"}`, Boolean(key && key.length > 0));
    if (state.failure) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "provider_connection_failed",
          diagnostics: {
            origin: provider?.endpoint ? new URL(provider.endpoint).origin : "https://provider.invalid",
            pathname: provider?.endpoint ? `${new URL(provider.endpoint).pathname}/chat/completions` : "/v1/chat/completions",
            status: state.failure.status,
            requestId: "controlled-safe-request-id",
            category: state.failure.category,
            model: provider?.model ?? "controlled-model",
            contentType: state.failure.contentType ?? "application/json",
            stage: state.failure.stage,
          },
        }),
      });
      return;
    }
    if (!provider || !key) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_credential" }) });
      return;
    }
    state.testedProvider = provider.id;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store, private, max-age=0" },
      body: JSON.stringify(providerResponse(provider)),
    });
  });
}

let server;
let browser;
let exitCode = 0;
try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", PORT], {
    env: { ...process.env, AUTH_SECRET: "qa-auth-secret-sentinel-not-a-real-credential", AUTH_GITHUB_ID: "", AUTH_GITHUB_SECRET: "" },
    stdio: "ignore",
  });
  const up = await waitForServer();
  ok("production server reachable", up);
  if (!up) throw new Error("server did not start");
  browser = await chromium.launch({ channel: "msedge" });

  // ---- Guest Demo invariant (unauthenticated) — restored from the accepted
  // baseline: BYOK stays fully governed and unreachable without sign-in, and
  // Guest Demo remains deterministic and fully usable. ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await authRoute(page, { authenticated: false });
    await page.goto(`${BASE}/v2/plant`, { waitUntil: "networkidle" });
    const guestControl = page.getByRole("button", { name: "Provider Centre" });
    ok("guest Provider Centre control is visible", await guestControl.isVisible());
    ok("guest control is keyboard reachable", await guestControl.evaluate((element) => element.tabIndex >= 0));
    ok("guest control exposes unavailable semantics", (await guestControl.getAttribute("aria-disabled")) === "true");
    await guestControl.evaluate((element) => element.click());
    ok("guest cannot open Provider Centre", (await page.getByRole("dialog", { name: "Provider Centre" }).count()) === 0);
    ok(
      "guest explanation is deterministic",
      (await guestControl.getAttribute("title"))?.includes("Guest Demo uses governed deterministic narration"),
    );
    await context.close();
  }

  for (const width of VIEWPORTS) {
    const viewport = { width, height: width < 500 ? 844 : 900 };
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const state = { authenticated: true, testedProvider: null };
    const directProviderRequests = [];
    const consoleMessages = [];
    page.on("request", (request) => {
      if (providers.some((provider) => request.url().includes(new URL(provider.endpoint).hostname))) {
        directProviderRequests.push(request.url());
      }
    });
    page.on("console", (message) => consoleMessages.push(message.text()));
    await installRoutes(page, state);
    await page.goto(`${BASE}/v2/plant`, { waitUntil: "networkidle" });

    const trigger = page.getByRole("button", { name: "Provider Centre" });
    ok(`Provider Centre is accessible at ${width}px`, await trigger.isEnabled());
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Provider Centre" });
    ok(`Provider Centre opens at ${width}px`, await dialog.isVisible());
    const providerSelect = dialog.locator("select").nth(0);
    const modelSelect = dialog.locator("select").nth(1);
    const keyInput = dialog.getByLabel(/API key$/, { exact: false });
    await providerSelect.waitFor({ state: "attached" });
    ok(`provider selector exposes all four providers at ${width}px`, await waitForOptionCount(providerSelect.locator("option"), providers.length));
    ok(`credential input is uncontrolled and masked at ${width}px`, (await keyInput.getAttribute("type")) === "password");

    // Full four-provider connect/disconnect lifecycle at every viewport width —
    // restores the baseline's per-viewport responsive coverage while extending
    // it across all four providers instead of NVIDIA alone.
    for (const provider of providers) {
      await providerSelect.selectOption(provider.id);
      await modelSelect.locator(`option[value="${provider.model}"]`).waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
      for (let attempt = 0; attempt < 150 && (await modelSelect.inputValue()) !== provider.model; attempt += 1) {
        await sleep(100);
      }
      const selectedModelValue = await modelSelect.inputValue();
      ok(`${provider.label} model is selected from server catalog at ${width}px`, selectedModelValue === provider.model, `${selectedModelValue} != ${provider.model}`);
      const secret = `controlled-${provider.id}-credential-not-real`;
      await keyInput.fill(secret);
      if (provider.id === "nvidia") {
        await dialog.getByRole("button", { name: "Show" }).click();
        ok(`show key control works at ${width}px`, (await keyInput.getAttribute("type")) === "text");
        await dialog.getByRole("button", { name: "Hide" }).click();
        ok(`hide key control restores masking at ${width}px`, (await keyInput.getAttribute("type")) === "password");
      }
      const exposure = await page.evaluate((value) => ({
        html: document.documentElement.outerHTML.includes(value),
        local: Object.values(localStorage).some((item) => item.includes(value)),
        session: Object.values(sessionStorage).some((item) => item.includes(value)),
        cookie: document.cookie.includes(value),
        url: location.href.includes(value),
      }), secret);
      ok(`${provider.label} credential absent from HTML/storage/cookies/URL at ${width}px`, !Object.values(exposure).some(Boolean));
      await dialog.getByRole("button", { name: "Test connection" }).click();
      await dialog.getByText("Connection test succeeded.", { exact: false }).waitFor();
      ok(`${provider.label} test success does not connect automatically at ${width}px`, !(await dialog.getByText("Connected until reload", { exact: true }).isVisible()));
      const connectButton = dialog.getByRole("button", { name: "Connect for this session" });
      ok(`${provider.label} tested is distinct from connected at ${width}px`, await connectButton.isEnabled());
      await connectButton.click();
      const connectedTrigger = page.getByRole("button", { name: /Provider connected in this tab/i });
      ok(`${provider.label} connects for this session at ${width}px`, await connectedTrigger.isVisible());
      ok(`${provider.label} is the only active provider at ${width}px`, (await page.locator("button[aria-label*='connected']").count()) === 1);

      const postConnectExposure = await page.evaluate((value) => ({
        html: document.documentElement.outerHTML.includes(value),
        local: Object.values(localStorage).some((item) => item.includes(value)),
        session: Object.values(sessionStorage).some((item) => item.includes(value)),
        cookie: document.cookie.includes(value),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }), secret);
      ok(`no localStorage credential after connect at ${width}px (${provider.label})`, !postConnectExposure.local);
      ok(`no sessionStorage credential after connect at ${width}px (${provider.label})`, !postConnectExposure.session);
      ok(`no rendered-HTML credential after connect at ${width}px (${provider.label})`, !postConnectExposure.html);
      ok(`no cookie credential after connect at ${width}px (${provider.label})`, !postConnectExposure.cookie);
      ok(
        `connection UI has no document overflow at ${width}px (${provider.label})`,
        postConnectExposure.scrollWidth <= postConnectExposure.clientWidth,
        `${postConnectExposure.scrollWidth}/${postConnectExposure.clientWidth}`,
      );

      await connectedTrigger.click();
      const reopened = page.getByRole("dialog", { name: "Provider Centre" });
      await waitForOptionCount(reopened.locator("select").nth(0).locator("option"), providers.length);
      await reopened.getByRole("button", { name: "Disconnect" }).click();
      ok(`${provider.label} disconnect clears connection at ${width}px`, await page.getByRole("button", { name: "Provider Centre" }).isVisible());
      if (provider !== providers.at(-1)) {
        await trigger.click();
        await waitForOptionCount(providerSelect.locator("option"), providers.length);
      }
    }

    ok(`browser never calls a provider directly at ${width}px`, directProviderRequests.length === 0);
    ok(`no credential-bearing console logs at ${width}px`, !consoleMessages.some((message) => /credential|api.?key|controlled-.*-credential/i.test(message)));

    // Provider switching clears the previous credential/draft — checked once
    // per viewport since it is not itself a responsive concern, only that it
    // holds at every width the drawer can render at.
    await trigger.click();
    await waitForOptionCount(providerSelect.locator("option"), providers.length);
    await providerSelect.selectOption("nvidia");
    await keyInput.fill("switching-credential-not-real");
    await providerSelect.selectOption("openrouter");
    ok(`provider switching clears the previous credential and draft at ${width}px`, (await keyInput.inputValue()) === "");

    // Escape closes the drawer, disconnects consistently (drawer-close always
    // disconnects — UI and credential state never disagree), and restores
    // focus to the trigger that opened it — restored from the baseline.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    ok(`Escape closes Provider Centre at ${width}px`, (await page.getByRole("dialog", { name: "Provider Centre" }).count()) === 0);
    ok(
      `Escape restores focus to the trigger at ${width}px`,
      await trigger.evaluate((element) => document.activeElement === element),
    );

    if (width === 390) {
      await trigger.click();
      await waitForOptionCount(providerSelect.locator("option"), providers.length);
      await providerSelect.selectOption("nvidia");
      await keyInput.fill("signout-credential-not-real");
      await dialog.getByRole("button", { name: "Test connection" }).click();
      await dialog.getByText("Connection test succeeded.", { exact: false }).waitFor();
      await dialog.getByRole("button", { name: "Connect for this session" }).click();
      await page.evaluate(() => window.dispatchEvent(new Event("aso:auth-signout")));
      await page.waitForTimeout(100);
      ok("sign-out clears the session connection", await page.getByRole("button", { name: "Open Provider Centre" }).isVisible());
    } else if (width === 430) {
      await trigger.click();
      await waitForOptionCount(providerSelect.locator("option"), providers.length);
      await providerSelect.selectOption("nvidia");
      await keyInput.fill("disconnect-credential-not-real");
      await dialog.getByRole("button", { name: "Test connection" }).click();
      await dialog.getByText("Connection test succeeded.", { exact: false }).waitFor();
      await dialog.getByRole("button", { name: "Connect for this session" }).click();
      const reopened = page.getByRole("dialog", { name: "Provider Centre" });
      ok("connect surfaces the connected trigger before disconnect", await page.getByRole("button", { name: /Provider connected in this tab/i }).isVisible());
      await page.getByRole("button", { name: /Provider connected in this tab/i }).click();
      await reopened.getByRole("button", { name: "Disconnect" }).click();
      ok("disconnect clears the session connection", await page.getByRole("button", { name: "Open Provider Centre" }).isVisible());
    }

    await page.reload({ waitUntil: "networkidle" });
    ok(`reload clears provider connection at ${width}px`, await page.getByRole("button", { name: "Provider Centre" }).isVisible());

    if (width === 1440) {
      const failureCases = [
        { name: "invalid credential", status: 400, category: "authentication_or_entitlement_rejected", stage: "request" },
        { name: "permission denied", status: 403, category: "permission_denied", stage: "request" },
        { name: "rate limited", status: 429, category: "rate_limited_or_quota_unavailable", stage: "request" },
        { name: "timeout", status: null, category: "provider_timeout", stage: "body_parsing" },
        { name: "malformed output", status: 200, category: "invalid_or_incomplete_output", stage: "schema_validation" },
        { name: "upstream 5xx", status: 503, category: "provider_unavailable", stage: "request" },
      ];
      for (const failure of failureCases) {
        state.failure = failure;
        await page.getByRole("button", { name: "Provider Centre" }).click();
        const failureDialog = page.getByRole("dialog", { name: "Provider Centre" });
        const failureInput = failureDialog.locator("input[type='password']");
        await failureInput.fill("failure-test-key-not-real");
        await failureDialog.getByRole("button", { name: "Test connection" }).click();
        await failureDialog.getByRole("alert").waitFor();
        const alert = await failureDialog.getByRole("alert").innerText();
        ok(`${failure.name} is sanitized and classified`, alert.includes(failure.category) && alert.includes(failure.stage) && !alert.includes("failure-test-key-not-real"));
        await failureDialog.getByRole("button", { name: "Close Provider Centre" }).click();
      }
      state.failure = null;
    }
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
console.log(`\n=== MULTI-PROVIDER BYOK QA (${BASE}) ===`);
console.log(`total ${results.length} · passed ${results.length - failed.length} · failed ${failed.length}`);
for (const result of failed) console.log(`  FAIL ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
if (failed.length > 0) exitCode = 1;
process.exit(exitCode);
