import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PERSONA_ID, isPersonaId, personaDefaultRoute } from "@/personas/registry";
import { PERSONA_COOKIE } from "@/context/types";

/**
 * Routing:
 *  - "/"            → the active persona's default landing (from the persona
 *                     cookie; defaults to the Reliability Manager).
 *  - "/ai-economics" → moved into the Agent Control Tower "Value & Cost" tab.
 *    Preserved as a 308 redirect so bookmarked deep links keep working.
 *
 * Persona selection here is a VIEW routing concern, not authentication.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/ai-economics") {
    const url = req.nextUrl.clone();
    url.pathname = "/agent-control";
    url.search = "?tab=value-cost";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/") {
    const raw = req.cookies.get(PERSONA_COOKIE)?.value;
    const personaId = isPersonaId(raw) ? raw : DEFAULT_PERSONA_ID;
    const url = req.nextUrl.clone();
    url.pathname = personaDefaultRoute(personaId);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/ai-economics"],
};
