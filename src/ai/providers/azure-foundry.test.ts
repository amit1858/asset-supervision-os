import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AzureFoundryProvider } from "./azure-foundry";
import type { AiGenerationRequest } from "../types";

const REQUEST: AiGenerationRequest = {
  useCase: "k201-case-investigator",
  promptKey: "k201-case-investigator",
  promptVersion: "2026-09-10.v1",
  system: "system",
  user: "user",
  evidence: [],
  maxOutputTokens: 200,
};

function makeProvider(overrides: Partial<ConstructorParameters<typeof AzureFoundryProvider>[0]> = {}) {
  return new AzureFoundryProvider({
    endpoint: "https://example.openai.azure.com/",
    apiKey: "secret-key",
    deployment: "gpt-4o-case",
    apiVersion: "2024-10-21",
    timeoutMs: 50,
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

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AzureFoundryProvider availability", () => {
  it("is unavailable and throws without full configuration", async () => {
    const p = makeProvider({ apiKey: "" });
    expect(p.isAvailable()).toBe(false);
    await expect(p.generate(REQUEST)).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is available with full configuration", () => {
    expect(makeProvider().isAvailable()).toBe(true);
  });
});

describe("AzureFoundryProvider request shape", () => {
  it("calls the deployments URL with the api-key header", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"situationSummary":"ok","claims":[]}'));
    const result = await makeProvider().generate(REQUEST);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/openai/deployments/gpt-4o-case/chat/completions");
    expect(url).toContain("api-version=2024-10-21");
    expect(url).not.toContain(".azure.com//"); // trailing slash trimmed
    expect((init as RequestInit).headers).toMatchObject({ "api-key": "secret-key" });
    expect(result.model).toBe("gpt-4o-case");
    expect(result.provider).toBe("azure");
    expect(result.text).toContain("situationSummary");
  });
});

describe("AzureFoundryProvider reliability contract", () => {
  it("does NOT retry a non-transient 401", async () => {
    fetchMock.mockResolvedValue(errorResponse(401));
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient 503 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await makeProvider().generate(REQUEST);
    expect(result.text).toContain("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry when the transient failure persists", async () => {
    fetchMock.mockResolvedValue(errorResponse(500));
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await makeProvider().generate(REQUEST);
    expect(result.text).toContain("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws (no retry) when the response has no content", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(""));
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/no content/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws (no retry) when the response body is not valid JSON", async () => {
    const malformed = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
      text: async () => "<html>gateway</html>",
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(malformed);
    await expect(makeProvider().generate(REQUEST)).rejects.toThrow(/valid JSON/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("AzureFoundryProvider request-body contract (JSON mode)", () => {
  it("sends the deployment identity, JSON-mode response_format and role messages", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"situationSummary":"ok","claims":[]}'));
    await makeProvider().generate({ ...REQUEST, maxOutputTokens: 321 });

    const [, init] = fetchMock.mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string);
    // Deployment is the request identity, in the body AND (asserted elsewhere) the URL.
    expect(sent.model).toBe("gpt-4o-case");
    // JSON mode — explicitly NOT strict json_schema.
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.response_format.type).not.toBe("json_schema");
    expect(sent.max_tokens).toBe(321);
    expect(sent.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" },
    ]);
  });

  it("builds the canonical deployment-scoped Azure OpenAI URL", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));
    await makeProvider().generate(REQUEST);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://example.openai.azure.com/openai/deployments/gpt-4o-case/chat/completions?api-version=2024-10-21",
    );
  });
});

describe("AzureFoundryProvider secret hygiene", () => {
  it("never leaks the api-key in a thrown error message", async () => {
    fetchMock.mockResolvedValue(errorResponse(401));
    let message = "";
    try {
      await makeProvider({ apiKey: "super-secret-value" }).generate(REQUEST);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toContain("super-secret-value");
  });

  it("never places the api-key in the request body", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));
    await makeProvider({ apiKey: "super-secret-value" }).generate(REQUEST);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body as string).not.toContain("super-secret-value");
  });
});
