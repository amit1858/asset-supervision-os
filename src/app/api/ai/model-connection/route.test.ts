import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAuthSession } = vi.hoisted(() => ({
  mockGetAuthSession: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  getAuthSession: mockGetAuthSession,
}));

import { GET, POST } from "./route";

const representativeSecret = "nvapi-representative-secret-value";
const fetchMock = vi.fn();

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ai/model-connection", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  mockGetAuthSession.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/ai/model-connection", () => {
  it("does not expose provider configuration to a guest", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "authentication_required" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns only public NVIDIA endpoint and model information to an authenticated user", async () => {
    mockGetAuthSession.mockResolvedValue({ user: { name: "Reliability Lead" } });
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.provider).toBe("nvidia");
    expect(json.endpoint).toBe("https://integrate.api.nvidia.com/v1");
    expect(json.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(JSON.stringify(json)).not.toContain("apiKey");
  });

  it("tests a real server-side provider connection without returning the key", async () => {
    mockGetAuthSession.mockResolvedValue({ user: { name: "Reliability Lead" } });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://integrate.api.nvidia.com/v1/models",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [{ id: "nvidia/nemotron-3.5-lightning-30b-a3b" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        headers: new Headers({
          "content-type": "application/json",
          "nvcf-reqid": "safe-request-id",
        }),
        json: async () => ({
          choices: [{ message: { content: '{"connected":true}' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      });
    const res = await POST(
      request({ "x-aso-nvidia-api-key": representativeSecret }),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("connection_test_succeeded");
    expect(text).not.toContain(representativeSecret);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(text).toContain("nvidia/nemotron-3.5-lightning-30b-a3b");
  });

  it("returns a sanitized failure without upstream details or credentials", async () => {
    mockGetAuthSession.mockResolvedValue({ user: { name: "Reliability Lead" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      url: "https://integrate.api.nvidia.com/v1/models",
      headers: new Headers({
        "content-type": "application/problem+json",
        "nvcf-reqid": "safe-request-id",
      }),
    });
    const res = await POST(
      request({ "x-aso-nvidia-api-key": representativeSecret }),
    );
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      error: "provider_connection_failed",
      diagnostics: {
        origin: "https://integrate.api.nvidia.com",
        pathname: "/v1/models",
        status: 403,
        requestId: "safe-request-id",
        category: "permission_denied",
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        contentType: "application/problem+json",
        stage: "request",
      },
    });
    expect(text).not.toContain(representativeSecret);
    expect(text).not.toContain("provider rejected");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized and unauthenticated credential requests", async () => {
    mockGetAuthSession.mockResolvedValue({ user: { name: "Reliability Lead" } });
    expect(
      (
        await POST(
          request({
            "x-aso-nvidia-api-key": "short",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            "content-length": "2048",
            "x-aso-nvidia-api-key": representativeSecret,
          }),
        )
      ).status,
    ).toBe(413);

    mockGetAuthSession.mockResolvedValueOnce(null);
    const guest = await POST(
      request({ "x-aso-nvidia-api-key": representativeSecret }),
    );
    expect(guest.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the server-selected OpenAI Responses and Anthropic Messages contracts", async () => {
    mockGetAuthSession.mockResolvedValue({ user: { name: "Reliability Lead" } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://api.openai.com/v1/responses",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ output_text: '{"connected":true}' }),
    });
    const openAi = await POST(request({
      "x-aso-ai-provider": "openai",
      "x-aso-ai-model": "gpt-4.1-mini",
      "x-aso-openai-api-key": "openai-representative-key",
    }));
    expect(openAi.status).toBe(200);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toBe("https://api.openai.com/v1/responses");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://api.anthropic.com/v1/messages",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ content: [{ type: "text", text: '{"connected":true}' }] }),
    });
    const anthropic = await POST(request({
      "x-aso-ai-provider": "anthropic",
      "x-aso-ai-model": "claude-haiku-4-5-20251001",
      "x-aso-anthropic-api-key": "anthropic-representative-key",
    }));
    expect(anthropic.status).toBe(200);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toBe("https://api.anthropic.com/v1/messages");
  });
});
