"use client";

import { SessionProvider, signIn as nextAuthSignIn, signOut as nextAuthSignOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import {
  ModelConnectionProvider,
  notifyModelConnectionSignOut,
} from "./ModelConnectionProvider";

/**
 * Real Auth.js identity session. This wraps `next-auth/react`'s
 * `SessionProvider`, which calls the app's own `/api/auth/session` endpoint
 * (server-verified, httpOnly-cookie-backed) rather than trusting any
 * client-stored value. There is no mocked or fabricated session anywhere in
 * this file — an authenticated state can only exist because the server
 * verified a real GitHub OAuth callback.
 *
 * Guest mode is simply the unauthenticated state: the deterministic governed
 * demonstration works identically whether or not a session exists. Identity
 * (this provider) and persona (`OperationalContext` / `V2PersonaSelector`)
 * remain deliberately separate concerns — signing in never grants
 * operational authority.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ModelConnectionProvider>{children}</ModelConnectionProvider>
    </SessionProvider>
  );
}

/**
 * Thin wrapper around next-auth's `useSession` that keeps the call sites
 * (`AccessScreen`, `V2TopBar`) provider-agnostic. `signIn`
 * only ever triggers the real GitHub OAuth redirect; Microsoft/Entra has no
 * registered provider, so calling it is a deliberate no-op rather than a
 * broken request.
 */
export function useAuthSession() {
  const { data, status } = useSession();
  return {
    session: data,
    status,
    signIn: (provider: "github" | "microsoft") => {
      if (provider !== "github") return;
      void nextAuthSignIn("github");
    },
    signOut: () => {
      notifyModelConnectionSignOut();
      void nextAuthSignOut();
    },
  };
}
