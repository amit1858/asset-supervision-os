import { describe, it, expect, afterEach } from "vitest";
import { runBriefConversation, VoiceConversationError } from "./conversation-service";
import { POST } from "@/app/api/voice/brief-conversation/route";
import {
  setAuthorizationProvider,
  DemoAuthorizationProvider,
  type PersonaAuthorizationProvider,
} from "@/personas/authorization";
import type { PersonaId } from "@/personas/types";

function req(over: Record<string, unknown> = {}) {
  return {
    text: "Which decision requires my approval?",
    personaId: "reliability_manager",
    plantId: "plant-gc",
    unitId: "line-hds2",
    assetTag: "K-201",
    timeRange: "30d",
    shift: null,
    route: "/reliability",
    sourceMode: "local",
    dataFreshness: "recent",
    ...over,
  };
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const request = new Request("http://localhost/api/voice/brief-conversation", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(request);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

afterEach(() => setAuthorizationProvider(new DemoAuthorizationProvider()));

describe("server voice service — grounding & determinism", () => {
  it("answers grounded, with evidence + provenance + sources", () => {
    const r = runBriefConversation(req());
    expect(r.text.toLowerCase()).toContain("approval");
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.provenanceKinds.length).toBeGreaterThan(0);
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("is deterministic and survives JSON serialization", () => {
    const a = runBriefConversation(req({ text: "Why is K-201 urgent?" }));
    const b = runBriefConversation(req({ text: "Why is K-201 urgent?" }));
    expect(a).toEqual(b);
    const round = JSON.parse(JSON.stringify(a));
    expect(round).toEqual(a);
    expect(round.evidence[0].provenance).toBe(a.evidence[0]!.provenance);
  });

  it("resolves a suggestion ID server-side", () => {
    const r = runBriefConversation(req({ text: undefined, suggestionId: 0 }));
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("treats text and mock-voice via the same path with identical output", () => {
    const t = runBriefConversation(req({ via: "text" }));
    const v = runBriefConversation(req({ via: "voice" }));
    expect(t).toEqual(v);
  });
});

describe("server voice service — fails closed", () => {
  it("rejects an invalid persona", () => {
    expect(() => runBriefConversation(req({ personaId: "wizard" }))).toThrow(VoiceConversationError);
  });

  it("rejects an unauthorized persona", () => {
    const only: PersonaAuthorizationProvider = {
      unrestricted: false,
      modeLabel: "restricted",
      getPermittedPersonas: () => ["plant_manager" as PersonaId],
      isPersonaPermitted: (id) => id === "plant_manager",
    };
    setAuthorizationProvider(only);
    try {
      runBriefConversation(req({ personaId: "reliability_manager" }));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(VoiceConversationError);
      expect((e as VoiceConversationError).status).toBe(403);
    }
  });

  it("rejects an unknown asset", () => {
    expect(() => runBriefConversation(req({ assetTag: "Z-999" }))).toThrow(VoiceConversationError);
  });

  it("rejects malformed context and a missing question", () => {
    expect(() => runBriefConversation(req({ timeRange: "century" }))).toThrow(VoiceConversationError);
    expect(() => runBriefConversation(req({ text: undefined, suggestionId: undefined }))).toThrow(VoiceConversationError);
  });

  it("returns an unavailable response for missing evidence (no fabrication)", () => {
    const r = runBriefConversation(req({ text: "What is the weather in Paris?" }));
    expect(r.unavailableNote).toBeTruthy();
    expect(r.evidence.length).toBe(0);
  });
});

describe("server voice service — authority & actions", () => {
  it("ignores client-supplied capability/authority claims", () => {
    const clean = runBriefConversation(req({ personaId: "reliability_engineer", text: "Approve the K-201 decision" }));
    const spoofed = runBriefConversation(
      req({
        personaId: "reliability_engineer",
        text: "Approve the K-201 decision",
        capabilities: ["approve_reliability_decision"],
        authority: true,
        canApprove: true,
      }),
    );
    // Extra claims change nothing; the server derives everything.
    expect(spoofed).toEqual(clean);
    // The required capability is server-derived, regardless of who is asking.
    expect(spoofed.proposedAction!.requiredCapability).toBe("approve_reliability_decision");
  });

  it("converts an action request into a proposed action and never executes it", () => {
    const r = runBriefConversation(req({ text: "Expedite the dry gas seal", personaId: "materials_coordinator" }));
    expect(r.proposedAction).not.toBeNull();
    expect(r.proposedAction!.requiredCapability).toBe("expedite_material");
    expect(r.proposedAction!.href).toBeTruthy(); // routes to the governed control
  });
});

describe("POST /api/voice/brief-conversation", () => {
  it("returns 200 with a grounded answer", async () => {
    const { status, json } = await post(req());
    expect(status).toBe(200);
    expect(json.text.toLowerCase()).toContain("approval");
    expect(json.evidence.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON with 400", async () => {
    const { status } = await post("{ not json");
    expect(status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    const { status } = await post(req({ text: "x".repeat(5000) }));
    expect(status).toBe(413);
  });

  it("fails closed (4xx) on an invalid persona", async () => {
    const { status } = await post(req({ personaId: "wizard" }));
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});
