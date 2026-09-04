import "server-only";

/**
 * Server-only public seam for the calculation engine port.
 *
 * The concrete `engine-adapter.ts` is the private, `server-only` implementation
 * of `EnginePort` and — per the calculations boundary invariant — is imported
 * only within this directory. Server-side read models that need a live engine
 * port import it through THIS barrel, so the private adapter stays encapsulated
 * and no client-reachable module can ever pull the engine into a browser
 * bundle.
 */
export { getEngineAdapter } from "./engine-adapter";
export type { EnginePort } from "@/v2/domain/calculations/port";
