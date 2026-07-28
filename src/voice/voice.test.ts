import { describe, it, expect } from "vitest";
import { MockBriefConversationProvider } from "./mock-conversation";
import { MockSpeechInputProvider, MockSpeechOutputProvider } from "./providers/mock-speech";
import { resolveInitialMicState, micStateFromPermission } from "./session";
import { getVoiceSuggestions, PERSONA_VOICE_SUGGESTIONS } from "./suggestions";
import type { SpeechInputProvider, VoiceScope } from "./types";
import { PERSONA_ORDER } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";

function scopeFor(personaId: PersonaId, assetTag: string | null = "K-201"): VoiceScope {
  return {
    personaId,
    plantId: "plant-gc",
    unitId: "line-hds2",
    assetTag,
    timeRange: "30d",
    shift: null,
    route: "/reliability",
    sourceMode: "local",
    dataFreshness: "recent",
  };
}

const provider = new MockBriefConversationProvider();

describe("voice — persona-aware suggestions", () => {
  it("provides suggestions for every persona, derived from the registry", () => {
    for (const id of PERSONA_ORDER) {
      expect(getVoiceSuggestions(id).length).toBeGreaterThan(0);
    }
  });
  it("gives different personas different suggestions", () => {
    expect(PERSONA_VOICE_SUGGESTIONS.plant_manager).not.toEqual(PERSONA_VOICE_SUGGESTIONS.reliability_manager);
    expect(PERSONA_VOICE_SUGGESTIONS.materials_coordinator).not.toEqual(PERSONA_VOICE_SUGGESTIONS.shift_supervisor);
  });
});

describe("voice — grounded, deterministic answers", () => {
  it("is deterministic for the same query and scope", () => {
    const a = provider.answer({ text: "Why is K-201 urgent?", via: "text" }, scopeFor("reliability_manager"));
    const b = provider.answer({ text: "Why is K-201 urgent?", via: "text" }, scopeFor("reliability_manager"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("grounds topic answers in brief evidence with source freshness", () => {
    const a = provider.answer({ text: "Why is K-201 urgent?", via: "text" }, scopeFor("reliability_manager"));
    expect(a.role).toBe("assistant");
    expect(a.evidence.length).toBeGreaterThan(0);
    expect(a.sources.length).toBeGreaterThan(0);
    for (const e of a.evidence) expect(e.provenance).toBeTruthy();
    expect(a.provenanceKinds.length).toBeGreaterThan(0);
  });

  it("inherits asset scope in the answer", () => {
    const a = provider.answer({ text: "Where is the greatest value at stake?", via: "text" }, scopeFor("plant_manager", "K-201"));
    expect(a.text).toContain("K-201");
    expect(a.evidence.length).toBeGreaterThan(0);
  });

  it("prioritises the same K-201 facts differently per persona", () => {
    const mgr = provider.answer({ text: "Which decision requires my approval?", via: "text" }, scopeFor("reliability_manager"));
    const eng = provider.answer({ text: "Which decision requires my approval?", via: "text" }, scopeFor("reliability_engineer"));
    // Manager has a decision to approve; engineer does not.
    expect(mgr.text.toLowerCase()).toContain("approval");
    expect(eng.unavailableNote).toBeTruthy();
  });

  it("says information is unavailable rather than fabricating it", () => {
    const a = provider.answer({ text: "What is the weather in Paris?", via: "text" }, scopeFor("reliability_manager"));
    expect(a.unavailableNote).toBeTruthy();
    expect(a.evidence.length).toBe(0);
    expect(a.text.toLowerCase()).toContain("available");
  });

  it("treats text and voice input as equivalent", () => {
    const t = provider.answer({ text: "What is blocking the intervention?", via: "text" }, scopeFor("reliability_manager"));
    const v = provider.answer({ text: "What is blocking the intervention?", via: "voice" }, scopeFor("reliability_manager"));
    expect(JSON.stringify(t)).toBe(JSON.stringify(v));
  });
});

describe("voice — never executes operational actions", () => {
  it("converts an action request into a proposed action requiring authority", () => {
    const a = provider.answer({ text: "Approve the K-201 decision", via: "text" }, scopeFor("reliability_manager"));
    expect(a.proposedAction).not.toBeNull();
    expect(a.proposedAction!.requiredCapability).toBe("approve_reliability_decision");
    expect(a.proposedAction!.href).toBeTruthy(); // routes to the governed control
    expect(a.proposedAction!.consequence.length).toBeGreaterThan(0);
    expect(a.text.toLowerCase()).toMatch(/can't|cannot/);
  });

  it("proposes expedite/instruction/prepare/scope changes with the correct authority", () => {
    expect(provider.answer({ text: "Expedite the dry gas seal", via: "text" }, scopeFor("materials_coordinator")).proposedAction!.requiredCapability).toBe("expedite_material");
    expect(provider.answer({ text: "Reduce operating speed now", via: "text" }, scopeFor("shift_supervisor")).proposedAction!.requiredCapability).toBe("issue_operating_instruction");
    expect(provider.answer({ text: "Prepare a work order", via: "text" }, scopeFor("maintenance_planner")).proposedAction!.requiredCapability).toBe("prepare_work_order");
    expect(provider.answer({ text: "Modify the turnaround scope", via: "text" }, scopeFor("turnaround_manager")).proposedAction!.requiredCapability).toBe("modify_turnaround_scope");
  });

  it("does not treat a question about scope as an action", () => {
    const a = provider.answer({ text: "Should K-201 remain in turnaround scope?", via: "text" }, scopeFor("turnaround_manager"));
    expect(a.proposedAction).toBeNull();
  });
});

describe("voice — microphone lifecycle & states", () => {
  it("does not request permission on construction or initial-state resolution", () => {
    let requests = 0;
    const spy: SpeechInputProvider = {
      id: "spy",
      isAvailable: () => true,
      requestPermission: async () => {
        requests += 1;
        return "granted";
      },
    };
    resolveInitialMicState(spy, true);
    expect(requests).toBe(0); // permission requested only on explicit start
  });

  it("resolves initial mic state from availability and connectivity", () => {
    const ok = new MockSpeechInputProvider({ available: true });
    const gone = new MockSpeechInputProvider({ available: false });
    expect(resolveInitialMicState(ok, true)).toBe("ready");
    expect(resolveInitialMicState(ok, false)).toBe("offline");
    expect(resolveInitialMicState(gone, true)).toBe("unavailable");
  });

  it("maps permission results to states", () => {
    expect(micStateFromPermission("granted")).toBe("listening");
    expect(micStateFromPermission("denied")).toBe("permission_denied");
    expect(micStateFromPermission("unavailable")).toBe("unavailable");
  });

  it("mock output does not retain audio and is a safe no-op", () => {
    const out = new MockSpeechOutputProvider();
    expect(() => { out.speak("hello"); out.stop(); }).not.toThrow();
  });
});
