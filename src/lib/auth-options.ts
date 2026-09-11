import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

/**
 * Real Auth.js (next-auth v4) configuration.
 *
 * - JWT-backed sessions only — no database adapter, no server-side session
 *   store. The encrypted session lives entirely in an httpOnly cookie that
 *   Auth.js manages; this app never reads or writes it directly.
 * - GitHub is the only enabled identity provider. It is registered only when
 *   `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET` are all present,
 *   so an incomplete environment boots in guest mode without exposing broken
 *   sign-in controls or authentication endpoints.
 * - Microsoft/Entra is intentionally NOT registered here. There is no
 *   provider, no button state, and no claim of support until it is
 *   deliberately configured — see `AccessScreen`, which labels it
 *   "Not configured" rather than rendering a non-functional live control.
 * - `AUTH_SECRET` must be supplied via the environment (`.env.local` in
 *   development). It is never read, logged, or echoed by this module or any
 *   caller — it is only ever passed through to the next-auth runtime.
 */
const githubClientId = process.env.AUTH_GITHUB_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET;
const authSecret = process.env.AUTH_SECRET;

export const requiredAuthEnvironment = [
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
] as const;

export const missingAuthEnvironment = requiredAuthEnvironment.filter((name) => !process.env[name]);

export const githubProviderConfigured = missingAuthEnvironment.length === 0;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: authSecret,
  providers: githubProviderConfigured
    ? [
        GithubProvider({
          clientId: githubClientId as string,
          clientSecret: githubClientSecret as string,
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Runs only at sign-in (when `account`/`profile` are present); persists
      // the provider name and display identity into the JWT for later
      // requests. No provider API keys or BYOK secrets ever pass through
      // this token — those remain client-memory-only in the model connection drawer.
      if (account) {
        token.provider = account.provider;
      }
      if (profile) {
        token.name = profile.name ?? token.name;
        const emailish = profile as { email?: string | null };
        token.email = emailish.email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }
      return {
        ...session,
        provider: typeof token.provider === "string" ? token.provider : undefined,
      };
    },
  },
};
