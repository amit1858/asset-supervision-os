import { missingAuthEnvironment } from "./auth-options";

export const authenticationUnavailableMessage =
  "GitHub authentication is not configured in this environment. Guest Demo remains available.";

export function unconfiguredAuthPayload() {
  return {
    error: "authentication_not_configured",
    message: authenticationUnavailableMessage,
    missing: missingAuthEnvironment,
  };
}

export function isGuestSafeAuthAction(action: string | undefined) {
  return action === "session" || action === "providers";
}
