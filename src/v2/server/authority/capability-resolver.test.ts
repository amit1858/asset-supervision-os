import { describe, it, expect } from "vitest";
import { getAuthorizationProvider } from "@/personas/authorization";
import {
  DemonstrationCapabilityResolver,
  getCapabilityResolver,
} from "./capability-resolver";

/**
 * Slice 2.2 — the server capability resolver. It gates persona assumption
 * through the demonstration provider and capability holding through the shared
 * registry, and exposes a visibly-labelled unrestricted authorization
 * descriptor.
 */

describe("DemonstrationCapabilityResolver", () => {
  const resolver = new DemonstrationCapabilityResolver(getAuthorizationProvider());

  it("permits assuming any persona in demonstration mode", () => {
    expect(resolver.canAssume("p-1", "reliability_manager")).toBe(true);
    expect(resolver.canAssume("p-1", "plant_manager")).toBe(true);
  });

  it("answers capability holding from the shared registry", () => {
    expect(resolver.personaHolds("reliability_manager", "approve_reliability_decision")).toBe(true);
    expect(
      resolver.personaHolds("plant_manager", "endorse_high_exposure_reliability_decision"),
    ).toBe(true);
    expect(
      resolver.personaHolds("reliability_manager", "endorse_high_exposure_reliability_decision"),
    ).toBe(false);
  });

  it("emits an unrestricted descriptor, visibly labelled and never claiming production auth", () => {
    const descriptor = resolver.descriptor();
    expect(descriptor.mode).toBe("demonstration_unrestricted");
    expect(descriptor.policy.version).toBe("v2-authority-workflow.v1");
    expect(descriptor.label.toLowerCase()).toContain("demonstration");
  });

  it("is available through the server accessor", () => {
    expect(getCapabilityResolver()).toBeInstanceOf(DemonstrationCapabilityResolver);
  });
});
