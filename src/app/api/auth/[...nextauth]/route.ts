import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, githubProviderConfigured } from "@/lib/auth-options";
import { isGuestSafeAuthAction, unconfiguredAuthPayload } from "@/lib/auth-route-availability";

/**
 * Real Auth.js route handler. When no provider is configured (see
 * `githubProviderConfigured` in `src/lib/auth-options.ts`), the guest-safe
 * session/providers reads remain available while sign-in/callback endpoints
 * return an explicit unavailable response. The app never fabricates a session.
 */
const nextAuthHandler = NextAuth(authOptions);

type AuthRouteContext = {
  params: {
    nextauth?: string[];
  };
};

function unauthenticatedSessionResponse() {
  return NextResponse.json({});
}

function emptyProvidersResponse() {
  return NextResponse.json({});
}

function authUnavailableResponse() {
  return NextResponse.json(unconfiguredAuthPayload(), { status: 503 });
}

function unconfiguredAuthResponse(context: AuthRouteContext) {
  const action = context.params.nextauth?.[0];
  if (isGuestSafeAuthAction(action)) {
    return action === "session" ? unauthenticatedSessionResponse() : emptyProvidersResponse();
  }
  return authUnavailableResponse();
}

export function GET(request: Request, context: AuthRouteContext) {
  if (!githubProviderConfigured) return unconfiguredAuthResponse(context);
  return nextAuthHandler(request, context);
}

export function POST(request: Request, context: AuthRouteContext) {
  if (!githubProviderConfigured) return authUnavailableResponse();
  return nextAuthHandler(request, context);
}
