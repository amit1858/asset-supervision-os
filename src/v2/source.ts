import type { DataFreshness, SourceMode } from "@/context/types";
import type { V2SourceState } from "./routes";

/**
 * Honest source & freshness presentation helpers (pure).
 *
 * The product must be explicit about where data comes from and how fresh it is,
 * and honest when something is not connected (blueprint §7, decision §7). These
 * helpers turn the machine states into human-readable, non-fabricated labels for
 * the shell and route surfaces. They never invent a "live" status.
 */

export interface SourceDescriptor {
  label: string;
  /** Longer, screen-reader friendly explanation. */
  detail: string;
  /** Semantic tone for status styling — colour only carries operational meaning. */
  tone: "neutral" | "info" | "warn" | "muted";
}

export function describeSourceMode(mode: SourceMode): SourceDescriptor {
  switch (mode) {
    case "snowflake":
      return {
        label: "Snowflake",
        detail: "Served from the Snowflake-compatible warehouse schema.",
        tone: "info",
      };
    case "local":
    default:
      return {
        label: "Seeded dataset",
        detail:
          "Served from the deterministic seeded operational dataset, not a live plant historian.",
        tone: "neutral",
      };
  }
}

export function describeFreshness(freshness: DataFreshness): SourceDescriptor {
  switch (freshness) {
    case "live":
      return { label: "Live", detail: "Data is current.", tone: "info" };
    case "recent":
      return {
        label: "Recent",
        detail: "Data is recent but not real-time.",
        tone: "neutral",
      };
    case "stale":
      return {
        label: "Stale",
        detail: "Data is stale and should be treated with caution.",
        tone: "warn",
      };
    case "offline":
    default:
      return {
        label: "Offline",
        detail: "The data source is offline; values may be out of date.",
        tone: "warn",
      };
  }
}

export function describeRouteSource(state: V2SourceState): SourceDescriptor {
  switch (state) {
    case "derived":
      return {
        label: "Derived",
        detail: "Calculated deterministically from seeded operational data.",
        tone: "neutral",
      };
    case "not_connected":
      return {
        label: "Not connected",
        detail: "This integration is not connected in this environment.",
        tone: "muted",
      };
    case "seeded":
    default:
      return {
        label: "Seeded",
        detail: "Backed by the deterministic seeded operational dataset.",
        tone: "neutral",
      };
  }
}
