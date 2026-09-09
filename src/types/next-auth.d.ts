import type { DefaultSession } from "next-auth";

/**
 * Augments Auth.js's `Session` shape with the provider name we attach in the
 * `session` callback (`src/lib/auth-options.ts`). This is identity metadata
 * only (e.g. "github") — never a token, key, or other secret.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    provider?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
  }
}
