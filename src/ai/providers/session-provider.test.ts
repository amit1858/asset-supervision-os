import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_PROVIDER_REGISTRY,
  createSessionProvider,
  getPublicSessionProviderConfigurations,
  getSessionProviderConfig,
  validateSessionCredential,
} from "./session-provider";

afterEach(() => vi.unstubAllGlobals());

describe("session provider registry", () => {
  it("pins four providers and rejects arbitrary models", () => {
    expect(SESSION_PROVIDER_REGISTRY.map((item) => item.id)).toEqual([
      "nvidia",
      "openrouter",
      "openai",
      "anthropic",
    ]);
    expect(getSessionProviderConfig("openai", "https://evil.test")).toBeNull();
    expect(getPublicSessionProviderConfigurations().every((item) => item.endpoint.startsWith("https://"))).toBe(true);
  });

  it("validates bounded credentials without storing or transforming them", () => {
    expect(validateSessionCredential("representative-session-key")).toBe("representative-session-key");
    expect(validateSessionCredential("short")).toBeNull();
    expect(validateSessionCredential("line\nbreak")).toBeNull();
    expect(validateSessionCredential("x".repeat(513))).toBeNull();
  });
});

describe("protocol-specific session adapters", () => {
  it.each([
    ["nvidia", "nvidia/nemotron-3.5-lightning-30b-a3b", { choices: [{ message: { content: '{"ok":true}' } }] }],
    ["openrouter", "openai/gpt-oss-20b:free", { choices: [{ message: { content: '{"ok":true}' } }] }],
    ["openai", "gpt-4.1-mini", { output_text: '{"ok":true}' }],
    ["anthropic", "claude-haiku-4-5-20251001", { content: [{ type: "text", text: '{"ok":true}' }] }],
  ] as const)("parses the %s response contract", async (provider, model, body) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createSessionProvider(provider, model, "representative-session-key");
    const result = await adapter!.generate({
      useCase: "test",
      promptKey: "test",
      promptVersion: "test",
      system: "Return JSON.",
      user: "Return exactly {\"ok\":true}.",
      evidence: [],
      maxOutputTokens: 32,
    });
    expect(result.text).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      provider === "openai"
        ? "https://api.openai.com/v1/responses"
        : provider === "anthropic"
          ? "https://api.anthropic.com/v1/messages"
          : provider === "openrouter"
            ? "https://openrouter.ai/api/v1/chat/completions"
            : "https://integrate.api.nvidia.com/v1/chat/completions",
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization?.match(/Bearer/g)?.length ?? 0).toBe(provider === "anthropic" ? 0 : 1);
    expect(JSON.stringify(init.body)).not.toContain("representative-session-key");
  });
});
