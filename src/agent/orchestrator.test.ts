import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AiProvider, AiGenerationRequest, AiGenerationResult } from "@/ai/types";

vi.mock("@/ai", () => ({ getAiProvider: vi.fn() }));

import { getAiProvider } from "@/ai";
import { investigateK201Case } from "./orchestrator";

const mockedGetProvider = vi.mocked(getAiProvider);

function provider(
  id: AiProvider["id"],
  overrides: Partial<AiProvider> & { generateText?: string } = {},
): AiProvider {
  const { generateText, ...rest } = overrides;
  return {
    id,
    model: `${id}-model`,
    isAvailable: () => true,
    generate: async (_req: AiGenerationRequest): Promise<AiGenerationResult> => ({
      text: generateText ?? "{}",
      provider: id,
      model: `${id}-model`,
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
    }),
    ...rest,
  };
}

const NOW = new Date("2026-09-10T06:00:00.000Z");

function investigate() {
  return investigateK201Case({
    viewerId: "plant_manager",
    questionId: "why_action_now",
    question: "Why does K-201 require action now?",
    requestId: "req-1",
    now: NOW,
  });
}

beforeEach(() => {
  mockedGetProvider.mockReset();
});

describe("orchestrator — provider selection and grounding", () => {
  it("returns the deterministic answer when the provider is the offline mock", async () => {
    mockedGetProvider.mockReturnValue(provider("mock"));
    const r = await investigate();
    expect(r.generationStatus).toBe("deterministic");
    expect(r.provider).toBe("mock");
  });

  it("returns the deterministic answer when a real provider is unavailable", async () => {
    mockedGetProvider.mockReturnValue(provider("azure", { isAvailable: () => false }));
    const r = await investigate();
    expect(r.generationStatus).toBe("deterministic");
  });

  it("accepts a valid provider narration and marks it provider_grounded", async () => {
    const validDraft = JSON.stringify({
      situationSummary: "K-201 is under a governed reliability review.",
      claims: [
        {
          id: "c1",
          text: "The governed assessment scores K-201 health at 52.",
          kind: "reliability",
          citationIds: ["get_reliability_assessment:health"],
        },
      ],
    });
    mockedGetProvider.mockReturnValue(provider("azure", { generateText: validDraft }));
    const r = await investigate();
    expect(r.generationStatus).toBe("provider_grounded");
    expect(r.provider).toBe("azure");
    expect(r.providerDisplay).toBe("Azure AI Foundry");
    expect(r.claims).toHaveLength(1);
    expect(r.situationSummary).toContain("governed reliability review");
  });

  it("discards a self-action narration and falls back to deterministic", async () => {
    const badDraft = JSON.stringify({
      situationSummary: "I approved the K-201 work order.",
      claims: [
        {
          id: "c1",
          text: "Health is 52.",
          kind: "reliability",
          citationIds: ["get_reliability_assessment:health"],
        },
      ],
    });
    mockedGetProvider.mockReturnValue(provider("azure", { generateText: badDraft }));
    const r = await investigate();
    expect(r.generationStatus).toBe("provider_rejected_fallback");
    expect(r.provider).toBe("mock");
    expect(r.deterministicFallback).toBe(true);
    // deterministic claims are restored
    expect(r.claims.some((c) => c.id === "c-exposure")).toBe(true);
  });

  it("discards an ungrounded-number narration and falls back", async () => {
    const badDraft = JSON.stringify({
      situationSummary: "K-201 review.",
      claims: [
        {
          id: "c1",
          text: "Exposure is $42,000,000.",
          kind: "reliability",
          citationIds: ["get_reliability_assessment:exposure"],
        },
      ],
    });
    mockedGetProvider.mockReturnValue(provider("azure", { generateText: badDraft }));
    const r = await investigate();
    expect(r.generationStatus).toBe("provider_rejected_fallback");
  });

  it("discards non-JSON provider output and falls back", async () => {
    mockedGetProvider.mockReturnValue(
      provider("azure", { generateText: "I am not JSON at all." }),
    );
    const r = await investigate();
    expect(r.generationStatus).toBe("provider_rejected_fallback");
  });

  it("falls back when the provider throws", async () => {
    mockedGetProvider.mockReturnValue(
      provider("azure", {
        generate: async () => {
          throw new Error("network down");
        },
      }),
    );
    const r = await investigate();
    expect(r.generationStatus).toBe("provider_rejected_fallback");
  });
});
