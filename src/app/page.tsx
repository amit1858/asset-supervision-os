import { redirect } from "next/navigation";
import { readOperationalContext } from "@/context/server";
import { personaDefaultRoute } from "@/personas/registry";

/**
 * Root route. Middleware normally redirects "/" to the active persona's landing;
 * this server fallback does the same if middleware is bypassed.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const { personaId } = readOperationalContext();
  redirect(personaDefaultRoute(personaId));
}
