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
    model: "nvidia/nemotron-3-super-120b-a12b",
    ...overrides,
  });
}

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    text: async () => content,
  } as unknown as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: `status ${status}`,
    json: async () => ({}),
    text: async () => "error body",
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

describe("OpenAiCompatibleProvider — NVIDIA structured-narration contract", () => {
  it("disables reasoning via chat_template_kwargs.enable_thinking=false", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const body = lastRequestBody(fetchMock);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("requests JSON mode via response_format.type=json_object", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const body = lastRequestBody(fetchMock);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retains the caller's narration token budget (800) unchanged", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const body = lastRequestBody(fetchMock);
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0.2);
    expect(body.model).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("authenticates with a Bearer token and posts to /chat/completions", async () => {
    fetchMock.mockResolvedValue(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("https://integrate.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = lastRequestHeaders(fetchMock);
    expect(headers.Authorization).toMatch(/^Bearer /);
  });

  it("returns provider content verbatim so the server-side gate can judge it", async () => {
    // The adapter must NOT strip, repair, or interpret provider output. Schema
    // and citation enforcement live in the orchestrator, which discards the
    // whole draft on any failure.
    const raw = '{"situationSummary":"x","claims":[]}';
    fetchMock.mockResolvedValue(okResponse(raw));
    const result = await makeProvider().generate(REQUEST);
    expect(result.text).toBe(raw);
    expect(result.provider).toBe("nvidia");
    expect(result.model).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("throws on a transient 503 so the orchestrator falls back deterministically", async () => {
    fetchMock.mockResolvedValue(errorResponse(503));
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/request failed: 503/);
  });

  it("throws on a network error so the orchestrator falls back deterministically", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/network down/);
  });
});

describe("OpenAiCompatibleProvider — DGX Spark / local contract is unchanged", () => {
  it("does NOT add NVIDIA-only fields for a dgxspark provider", async () => {
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
    // Core request shape is otherwise identical.
    expect(body.model).toBe("local-model");
    expect(body.max_tokens).toBe(800);
    expect(body.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" },
    ]);
  });
});
