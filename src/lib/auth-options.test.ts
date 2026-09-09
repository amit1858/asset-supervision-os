import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_ENV = ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const;

function clearAuthEnvironment() {
  for (const key of AUTH_ENV) delete process.env[key];
}

function setAuthEnvironment(values: Partial<Record<(typeof AUTH_ENV)[number], string>>) {
  clearAuthEnvironment();
  Object.assign(process.env, values);
}

async function loadAuthOptions() {
  vi.resetModules();
  return import("./auth-options");
}

afterEach(() => {
  clearAuthEnvironment();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Auth.js provider configuration", () => {
  it("keeps guest mode available without OAuth variables", async () => {
    setAuthEnvironment({});

    const auth = await loadAuthOptions();

    expect(auth.githubProviderConfigured).toBe(false);
    expect(auth.missingAuthEnvironment).toEqual([
      "AUTH_SECRET",
      "AUTH_GITHUB_ID",
      "AUTH_GITHUB_SECRET",
    ]);
    expect(auth.authOptions.providers).toEqual([]);
    expect(auth.authOptions.session).toEqual({ strategy: "jwt" });
  });

  it("keeps GitHub sign-in disabled until every required variable is configured", async () => {
    setAuthEnvironment({
      AUTH_GITHUB_ID: "unit-client-id",
      AUTH_GITHUB_SECRET: "unit-client-secret",
    });

    const auth = await loadAuthOptions();

    expect(auth.githubProviderConfigured).toBe(false);
    expect(auth.missingAuthEnvironment).toEqual(["AUTH_SECRET"]);
    expect(auth.authOptions.providers).toEqual([]);
  });

  it("does not generate, log, or substitute an application secret", async () => {
    setAuthEnvironment({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const auth = await loadAuthOptions();
    const source = readFileSync(join(process.cwd(), "src", "lib", "auth-options.ts"), "utf8");

    expect(auth.authOptions.secret).toBeUndefined();
    expect(source).not.toContain("randomBytes");
    expect(source).not.toContain("fallbackSecret");
    expect(source).not.toContain("crypto");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("enables the real GitHub provider only under complete configuration", async () => {
    setAuthEnvironment({
      AUTH_SECRET: "unit-auth-secret",
      AUTH_GITHUB_ID: "unit-client-id",
      AUTH_GITHUB_SECRET: "unit-client-secret",
    });

    const auth = await loadAuthOptions();

    expect(auth.githubProviderConfigured).toBe(true);
    expect(auth.missingAuthEnvironment).toEqual([]);
    expect(auth.authOptions.secret).toBe("unit-auth-secret");
    expect(auth.authOptions.providers).toHaveLength(1);
    expect(auth.authOptions.providers[0]?.id).toBe("github");
  });

  it("persists provider identity without adding secrets to session payloads", async () => {
    setAuthEnvironment({
      AUTH_SECRET: "unit-auth-secret",
      AUTH_GITHUB_ID: "unit-client-id",
      AUTH_GITHUB_SECRET: "unit-client-secret",
    });

    const auth = await loadAuthOptions();
    const token = await auth.authOptions.callbacks?.jwt?.({
      token: {},
      account: { provider: "github", type: "oauth", providerAccountId: "123" },
      profile: { name: "Reliability Lead", email: "lead@example.test" },
      user: { id: "123", email: "lead@example.test", emailVerified: null },
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    });
    const session = await auth.authOptions.callbacks?.session?.({
      session: { expires: "2099-01-01T00:00:00.000Z", user: {} },
      token: token ?? {},
      user: { id: "123", email: "lead@example.test", emailVerified: null },
      newSession: undefined,
      trigger: "update",
    });
    const payload = JSON.stringify(session);

    const typedSession = session as { provider?: string; user?: { name?: string | null } } | undefined;

    expect(typedSession?.provider).toBe("github");
    expect(session?.user?.name).toBe("Reliability Lead");
    expect(payload).not.toContain("unit-auth-secret");
    expect(payload).not.toContain("unit-client-secret");
  });
});
