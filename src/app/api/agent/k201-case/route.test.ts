import { beforeEach, describe, it, expect, vi } from "vitest";

const { mockGetAuthSession, mockGenerate } = vi.hoisted(() => ({
  mockGetAuthSession: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@/lib/auth-server", () => ({
  getAuthSession: mockGetAuthSession,
}));

vi.mock("@/ai/providers/nvidia-session", () => ({
  validateSessionApiKey: (value: string | null) =>
    value && value.length >= 8 ? value : null,
  resolveNvidiaSessionModel: async () => "nvidia/nemotron-3.5-lightning-30b-a3b",
  createNvidiaSessionProvider: () => ({
    id: "nvidia",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    isAvailable: () => true,
    generate: mockGenerate,
  }),
}));

import { POST } from "./route";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/agent/k201-case", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("POST /api/agent/k201-case", () => {
  const representativeSecret = "nvapi-representative-secret-value";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(null);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await POST(post("{ not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown question id with 400", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "drop_tables" })));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized declared payload with 413", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "why_action_now" }), {
      "content-length": "999999",
    }));
    expect(res.status).toBe(413);
  });

  it("answers a valid governed question with a schema-shaped K-201 response", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "why_action_now" })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.subject as { assetTag: string }).assetTag).toBe("K-201");
    expect(json.generationStatus).toBe("deterministic");
    // persona is resolved on the server (default reliability_manager), never from the body
    expect((json.viewer as { personaId: string }).personaId).toBe("reliability_manager");
  });

  it("ignores a persona supplied in the request body (server-trusted persona only)", async () => {
    const res = await POST(
      post(JSON.stringify({ questionId: "why_action_now", viewerId: "plant_manager" })),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.viewer as { personaId: string }).personaId).toBe("reliability_manager");
  });

  it("rejects a guest attempt to invoke NVIDIA without echoing the credential", async () => {
    mockGetAuthSession.mockResolvedValueOnce(null);
    const res = await POST(
      post(JSON.stringify({ questionId: "why_action_now" }), {
        "x-aso-ai-provider": "nvidia",
        "x-aso-nvidia-api-key": representativeSecret,
      }),
    );
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(text).toContain("authentication_required");
    expect(text).not.toContain(representativeSecret);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("invokes a request-scoped NVIDIA provider for an authenticated request", async () => {
    mockGetAuthSession.mockResolvedValueOnce({ user: { name: "Reliability Lead" } });
    mockGenerate.mockResolvedValueOnce({
      text: JSON.stringify({
        situationSummary: "K-201 remains under governed review.",
        claims: [
          {
            id: "nvidia-claim",
            text: "The governed assessment scores K-201 health at 52.",
            kind: "reliability",
            citationIds: ["get_reliability_assessment:health"],
          },
        ],
      }),
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 5,
    });

    const res = await POST(
      post(JSON.stringify({ questionId: "why_action_now" }), {
        "x-aso-ai-provider": "nvidia",
        "x-aso-nvidia-api-key": representativeSecret,
      }),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(json.generationStatus).toBe("provider_grounded");
    expect(json.provider).toBe("nvidia");
    expect(JSON.stringify(json)).not.toContain(representativeSecret);
  });

  it("falls back deterministically on provider failure without changing governed values", async () => {
    mockGetAuthSession.mockResolvedValueOnce({ user: { name: "Reliability Lead" } });
    mockGenerate.mockRejectedValueOnce(
      new Error(`network failure for ${representativeSecret}`),
    );

    const res = await POST(
      post(JSON.stringify({ questionId: "why_action_now" }), {
        "x-aso-ai-provider": "nvidia",
        "x-aso-nvidia-api-key": representativeSecret,
      }),
    );
    const json = (await res.json()) as {
      generationStatus: string;
      deterministicFallback: boolean;
      citations: Array<{ id: string; value: string }>;
    };
    expect(res.status).toBe(200);
    expect(json.generationStatus).toBe("provider_rejected_fallback");
    expect(json.deterministicFallback).toBe(true);
    expect(
      json.citations.find(
        (citation) => citation.id === "get_reliability_assessment:risk",
      )?.value,
    ).toBe("68");
    expect(JSON.stringify(json)).not.toContain(representativeSecret);
  });
});
