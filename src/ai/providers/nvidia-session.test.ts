import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
  vi.resetModules();
  return import("./nvidia-session");
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.NVIDIA_API_BASE_URL;
  delete process.env.NVIDIA_MODEL;
  vi.unstubAllGlobals();
  vi.resetModules();
});

function modelsResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    url: "https://integrate.api.nvidia.com/v1/models",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      object: "list",
      data: ids.map((id) => ({ id })),
    }),
  } as unknown as Response;
}

describe("NVIDIA request-scoped provider configuration", () => {
  it("uses the governed NVIDIA endpoint and current catalog model", async () => {
    const mod = await loadModule();
    expect(mod.getNvidiaSessionConfiguration()).toEqual({
      provider: "nvidia",
      endpoint: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    });
    expect(mod.NVIDIA_SESSION_COMPLETION_TIMEOUT_MS).toBe(45_000);
  });

  it("cannot be redirected by the operator environment to another host", async () => {
    process.env.NVIDIA_API_BASE_URL = "http://internal.example.test/v1";
    const mod = await loadModule();
    expect(mod.getNvidiaSessionConfiguration().endpoint).toBe(
      "https://integrate.api.nvidia.com/v1",
    );
  });

  it("validates bounded single-line credentials without transforming them", async () => {
    const mod = await loadModule();
    const representative = "nvapi-representative-secret-value";
    expect(mod.validateSessionApiKey(representative)).toBe(representative);
    expect(mod.validateSessionApiKey("short")).toBeNull();
    expect(mod.validateSessionApiKey(`${representative}\nleak`)).toBeNull();
    expect(mod.validateSessionApiKey("x".repeat(513))).toBeNull();
  });

  it("resolves the configured model through the exact /v1/models endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(modelsResponse(["nvidia/nemotron-3.5-lightning-30b-a3b"]));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();
    await expect(mod.resolveNvidiaSessionModel("secret-key")).resolves.toBe(
      "nvidia/nemotron-3.5-lightning-30b-a3b",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/models");
    expect(url).not.toContain("/v1/v1/");
    const headers = init.headers as Record<string, string>;
    const authorization = headers.Authorization;
    expect(authorization).toBe(`Bearer ${"secret-key"}`);
    expect(authorization?.match(/Bearer/g)).toHaveLength(1);
    expect(headers.Accept).toBe("application/json");
  });

  it("does not let operator configuration select a retired BYOK model", async () => {
    process.env.NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        modelsResponse(["nvidia/nemotron-3.5-lightning-30b-a3b"]),
      ),
    );
    const mod = await loadModule();
    expect(mod.getNvidiaSessionConfiguration().model).toBe(
      "nvidia/nemotron-3.5-lightning-30b-a3b",
    );
    await expect(mod.resolveNvidiaSessionModel("secret-key")).resolves.toBe(
      "nvidia/nemotron-3.5-lightning-30b-a3b",
    );
  });

  it("allows governed narration to exceed the obsolete 15-second bound", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  url: "https://integrate.api.nvidia.com/v1/chat/completions",
                  headers: new Headers({ "content-type": "application/json" }),
                  json: async () => ({
                    choices: [{ message: { content: '{"accepted":true}' } }],
                  }),
                } as Response),
              20_000,
            );
          }),
      ),
    );
    const mod = await loadModule();
    const pending = mod.createNvidiaSessionProvider("secret-key").generate({
      useCase: "k201-case-investigator",
      promptKey: "test",
      promptVersion: "test",
      system: "Return JSON.",
      user: "Narrate governed evidence.",
      evidence: [],
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toMatchObject({
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      text: '{"accepted":true}',
    });
  });

  it("reports a safe model-unavailable diagnostic when no governed model exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse(["other/model"])));
    const mod = await loadModule();
    const error = await mod
      .resolveNvidiaSessionModel("secret-key")
      .catch((reason) => reason);
    expect(error.diagnostics).toEqual({
      origin: "https://integrate.api.nvidia.com",
      pathname: "/v1/models",
      status: 200,
      requestId: null,
      category: "endpoint_or_model_unavailable",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      contentType: "application/json",
      stage: "schema_validation",
    });
  });
});
