"use client";

import type { ReactNode } from "react";
import { useCan } from "@/context/useCan";
import { CAPABILITIES } from "@/personas/capabilities";
import type { Capability } from "@/personas/types";

/**
 * Renders children only when the active persona holds `capability`. Optionally
 * renders a fallback. Capability-driven, never persona-name driven.
 */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useCan();
  return <>{can(capability) ? children : fallback}</>;
}

/**
 * A capability-gated action. Three outcomes, matching the spec:
 *  - available  → renders the action
 *  - read-only  → renders a disabled control that explains why (mode "explain")
 *  - hidden     → renders nothing (mode "hide")
 */
export function RestrictedAction({
  capability,
  children,
  mode = "explain",
  label,
}: {
  capability: Capability;
  children: ReactNode;
  mode?: "explain" | "hide";
  label?: string;
}) {
  const can = useCan();
  if (can(capability)) return <>{children}</>;
  if (mode === "hide") return null;

  const capLabel = label ?? CAPABILITIES[capability].label;
  return (
    <span
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-muted"
      title={`Read-only for this persona — requires the "${capLabel}" capability.`}
      aria-disabled="true"
    >
      <span aria-hidden>🔒</span>
      {capLabel}
      <span className="text-[10px] uppercase tracking-wide">· read-only</span>
    </span>
  );
}
