import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions, githubProviderConfigured } from "./auth-options";

/**
 * Server-side session verification. Uses next-auth's `getServerSession`,
 * which decrypts and validates the httpOnly JWT session cookie on the
 * server — it does not trust anything the client claims about itself.
 * Import this only in server components, route handlers, or server actions.
 */
export function getAuthSession() {
  if (!githubProviderConfigured) return null;
  return getServerSession(authOptions);
}
