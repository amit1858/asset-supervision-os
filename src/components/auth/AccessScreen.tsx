"use client";

import { useRouter } from "next/navigation";
import { useAuthSession } from "./AuthSessionProvider";

/**
 * `githubConfigured` reflects whether real `AUTH_SECRET`, `AUTH_GITHUB_ID`,
 * and `AUTH_GITHUB_SECRET` are present on the server (see `githubProviderConfigured` in
 * `src/lib/auth-options.ts`) — it is computed server-side by the page and
 * passed down, so the button's enabled state always matches whether the real
 * provider is actually registered with Auth.js. `microsoftConfigured` is
 * always `false` today: there is no Microsoft/Entra provider configured.
 */
export function AccessScreen({
  githubConfigured,
  microsoftConfigured,
}: {
  githubConfigured: boolean;
  microsoftConfigured: boolean;
}) {
  const router = useRouter();
  const { session, signIn, signOut, status } = useAuthSession();
  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const isLoading = status === "loading";
  // Prefer the display name; fall back to a generic label rather than the
  // email address, which is not shown on this screen unless required.
  const identityName = session?.user?.name ?? "Signed in";
  const identityProvider = session?.provider;

  return (
    <main className="min-h-screen bg-canvas px-4 py-12 text-text-primary">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="rounded-2xl border border-border bg-surface px-6 py-8 shadow-card">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                Asset Supervision OS
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-text-primary">
                Enter the governed manufacturing workspace
              </h1>
            </div>
            <div className="rounded-full border border-border bg-elevated px-3 py-1 text-xs font-medium text-text-muted">
              {isLoading ? "Checking access…" : isAuthenticated ? "Authenticated" : "Guest access"}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              {isAuthenticated ? (
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <p className="text-sm font-medium text-text-primary">Continue to workspace</p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Continue into the governed manufacturing workspace with your authenticated identity.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/v2")}
                    className="mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Open workspace
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <p className="text-sm font-medium text-text-primary">Guest demo</p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Continue as Guest Demo to enter the governed deterministic narrator and the existing V2 experience.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/v2")}
                    className="mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Continue as Guest Demo
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-border bg-elevated p-4">
                <p className="text-sm font-medium text-text-primary">{isAuthenticated ? "Your account" : "Sign in"}</p>
                {isAuthenticated ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-text-muted">
                      Signed in as <span className="font-medium text-text-primary">{identityName}</span>
                    </p>
                    <p className="text-sm leading-6 text-text-muted">
                      {identityProvider === "github" ? "Connected with GitHub" : `Connected with ${identityProvider}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => signIn("github")}
                      disabled={!githubConfigured || isLoading}
                      className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Sign in with GitHub
                    </button>
                    {microsoftConfigured ? (
                      <button
                        type="button"
                        onClick={() => signIn("microsoft")}
                        className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-elevated"
                      >
                        Sign in with Microsoft
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">
                        Microsoft sign-in is not configured for this demonstration.
                      </span>
                    )}
                  </div>
                )}
                {!githubConfigured && !isAuthenticated ? (
                  <p className="mt-3 text-sm text-text-muted">
                    GitHub sign-in is not configured in this environment (missing complete{" "}
                    <code>AUTH_SECRET</code> / <code>AUTH_GITHUB_ID</code> / <code>AUTH_GITHUB_SECRET</code>{" "}
                    configuration). The workspace remains available in guest mode.
                  </p>
                ) : null}
              </div>
            </div>

            <aside className="rounded-xl border border-border bg-surface-soft p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Access model
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-text-muted">
                <li>Guest mode uses the governed deterministic narrator.</li>
                <li>Signing in identifies the visitor with their GitHub account for this session.</li>
                <li>Identity and persona remain separate. Persona selection changes the demonstration lens only.</li>
                <li>Operational authority remains governed by the reliability and plant roles.</li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
