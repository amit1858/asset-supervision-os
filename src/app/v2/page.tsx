import { redirect } from "next/navigation";
import { readOperationalContext } from "@/context/server";
import { v2LandingRoute } from "@/v2/nav";

/**
 * `/v2` root — redirect to the active persona's V2 landing, preserving the asset
 * thread. The persona is read from the server-side operational context (cookies),
 * so the entry point mirrors the persona's default surface without a second
 * navigation model.
 */
export default function V2IndexPage() {
  const ctx = readOperationalContext();
  redirect(v2LandingRoute(ctx.personaId, { assetTag: ctx.assetTag }));
}
