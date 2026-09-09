import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_ENV = ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const;

function clearAuthEnvironment() {
  for (const key of AUTH_ENV) delete process.env[key];
}

async function loadAvailability() {
  vi.resetModules();
  return import("./auth-route-availability");
}

afterEach(() => {
  clearAuthEnvironment();
  vi.resetModules();
});

describe("unconfigured Auth.js endpoint policy", () => {
  it("keeps guest-safe session and provider reads available", async () => {
    clearAuthEnvironment();
    const policy = await loadAvailability();

    expect(policy.isGuestSafeAuthAction("session")).toBe(true);
    expect(policy.isGuestSafeAuthAction("providers")).toBe(true);
    expect(policy.isGuestSafeAuthAction("signin")).toBe(false);
    expect(policy.isGuestSafeAuthAction("callback")).toBe(false);
  });

  it("returns only missing variable names, never secret values", async () => {
    process.env.AUTH_SECRET = "unit-auth-secret";
    const policy = await loadAvailability();

    const payload = policy.unconfiguredAuthPayload();
    const serialized = JSON.stringify(payload);

    expect(payload.error).toBe("authentication_not_configured");
    expect(payload.message).toContain("Guest Demo remains available");
    expect(payload.missing).toEqual(["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"]);
    expect(serialized).not.toContain("unit-auth-secret");
  });
});
