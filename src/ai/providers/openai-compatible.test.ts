import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { AiGenerationRequest } from "../types";

const REQUEST: AiGenerationRequest = {
  useCase: "k201-case-investigator",
  promptKey: "k201-case-investigator",
  promptVersion: "2026-09-10.v1",
  system: "system",
  user: "user",
  evidence: [],
  maxOutputTokens: 800,
};

function makeProvider(
  overrides: Partial<ConstructorParameters<typeof OpenAiCompatibleProvider>[0]> = {},
) {
  return new OpenAiCompatibleProvider({
    id: "nvidia",
    baseUrl: "https://integrate.example.com/v1/",
    apiKey: "secret-key",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    ...overrides,
  });
}

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    url: "https://integrate.example.com/v1/chat/completions",
    headers: new Headers({
      "content-type": "application/json",
      "nvcf-reqid": "safe-request-id",
    }),
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
  } as unknown as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: `status ${status}`,
    url: "https://integrate.example.com/v1/chat/completions",
    headers: new Headers({
      "content-type": "application/problem+json",
      "nvcf-reqid": "safe-request-id",
    }),
  } as unknown as Response;
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.at(-1);
  const init = call?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function lastRequestHeaders(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.at(-1);
  const init = call?.[1] as RequestInit;
  return init.headers as Record<string, string>;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleProvider availability", () => {
  it("is unavailable and throws when configuration is incomplete", async () => {
    const provider = makeProvider({ apiKey: "" });
    expect(provider.isAvailable()).toBe(false);
    await expect(provider.generate(REQUEST)).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is available with base URL, key and model", () => {
    expect(makeProvider().isAvailable()).toBe(true);
  });
});

describe("OpenAiCompatibleProvider NVIDIA request contract", () => {
  it("posts once to the exact non-duplicated chat-completions URL", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("https://integrate.example.com/v1/chat/completions");
    expect(url).not.toContain("/v1/v1/");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
  });

  it("creates one Bearer authorization value and JSON content type", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const headers = lastRequestHeaders(fetchMock);
    const authorization = headers.Authorization;
    expect(authorization).toBe(`Bearer ${"secret-key"}`);
    expect(authorization?.match(/Bearer/g)).toHaveLength(1);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses the current non-streaming NVIDIA chat request schema", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const body = lastRequestBody(fetchMock);
    expect(body).toEqual({
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 800,
      stream: false,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(body).not.toHaveProperty("response_format");
  });

  it("returns provider content and provenance for server-side validation", async () => {
    const raw = '{"situationSummary":"x","claims":[]}';
    fetchMock.mockResolvedValue(okResponse(raw));
    const result = await makeProvider().generate(REQUEST);
    expect(result.text).toBe(raw);
    expect(result.provider).toBe("nvidia");
    expect(result.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
  });
});

describe("OpenAiCompatibleProvider safe failure diagnostics", () => {
  it.each([
    [401, "authentication_or_entitlement_rejected"],
    [403, "authentication_or_entitlement_rejected"],
    [404, "endpoint_or_model_unavailable"],
    [429, "rate_limited_or_quota_unavailable"],
    [422, "request_schema_rejected"],
    [500, "nvidia_service_failure"],
    [503, "nvidia_service_failure"],
  ])("maps upstream %i to %s", async (status, category) => {
    fetchMock.mockResolvedValue(errorResponse(status));
    const error = await makeProvider().generate(REQUEST).catch((reason) => reason);
    expect(error.diagnostics).toEqual({
      origin: "https://integrate.example.com",
      pathname: "/v1/chat/completions",
      status,
      requestId: "safe-request-id",
      category,
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      contentType: "application/problem+json",
      stage: "request",
    });
  });

  it("maps a network exception without leaking its message", async () => {
    fetchMock.mockRejectedValue(new Error("network down for secret-key"));
    const error = await makeProvider().generate(REQUEST).catch((reason) => reason);
    expect(error.diagnostics.category).toBe("network_tls_or_dns_failure");
    expect(String(error)).not.toMatch(/network down|secret-key/);
  });

  it("maps a request timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("secret-key");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const pending = makeProvider({ timeoutMs: 25 }).generate(REQUEST);
    const rejection = expect(pending).rejects.toMatchObject({
      diagnostics: { category: "provider_timeout", stage: "request" },
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("keeps the timeout active while parsing the response body", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init: RequestInit) =>
      Promise.resolve({
        ...okResponse(""),
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const error = new Error("secret-key");
              error.name = "AbortError";
              reject(error);
            });
          }),
      } as Response),
    );
    const pending = makeProvider({ timeoutMs: 25 }).generate(REQUEST);
    const rejection = expect(pending).rejects.toMatchObject({
      diagnostics: { category: "provider_timeout", stage: "body_parsing" },
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("maps a 2xx JSON parse failure without exposing the body", async () => {
    fetchMock.mockResolvedValue({
      ...okResponse(""),
      json: async () => {
        throw new SyntaxError("raw upstream secret");
      },
    });
    const error = await makeProvider().generate(REQUEST).catch((reason) => reason);
    expect(error.diagnostics).toMatchObject({
      status: 200,
      category: "response_schema_mismatch",
      stage: "body_parsing",
    });
    expect(String(error)).not.toContain("raw upstream secret");
  });

  it("maps a 2xx completion-schema mismatch", async () => {
    fetchMock.mockResolvedValue({
      ...okResponse(""),
      json: async () => ({ choices: [] }),
    });
    const error = await makeProvider().generate(REQUEST).catch((reason) => reason);
    expect(error.diagnostics).toMatchObject({
      status: 200,
      category: "response_schema_mismatch",
      stage: "schema_validation",
    });
  });
});

describe("OpenAiCompatibleProvider DGX Spark contract", () => {
  it("does not add NVIDIA-only fields for a DGX Spark provider", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    const provider = makeProvider({
      id: "dgxspark",
      baseUrl: "https://dgx-spark.example.internal/v1",
      model: "local-model",
    });
    await provider.generate(REQUEST);
    const body = lastRequestBody(fetchMock);
    expect(body).not.toHaveProperty("chat_template_kwargs");
    expect(body).not.toHaveProperty("response_format");
    expect(body.stream).toBe(false);
  });
});
