import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  type StatusToken,
  CRITICALITY,
  DISPOSITION,
  EVENT_SEVERITY,
  FRESHNESS,
  OPERATIONAL_STATUS,
  PROVENANCE,
  READINESS,
  VALUE_STATUS,
  WORK_ORDER_STATUS,
} from "@/design-system/status";
import type {
  AssetOperationalStatus,
  Criticality,
  DataFreshness,
  EventSeverity,
  Provenance,
  ReadinessStatus,
  RecommendedDisposition,
  ValueStatus,
  WorkOrderStatus,
} from "@/domain/enums";

export function Badge({
  token,
  size = "md",
  className,
}: {
  token: StatusToken;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        token.className,
        className,
      )}
    >
      <span aria-hidden className="leading-none">
        {token.symbol}
      </span>
      <span>{token.label}</span>
    </span>
  );
}

/** Small labelled indicator dot (shape + text, never color alone). */
export function StatusDot({
  token,
  label,
}: {
  token: StatusToken;
  label?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", token.dotClass)} aria-hidden />
      <span className="text-sm text-text-secondary">{label ?? token.label}</span>
    </span>
  );
}

export const AssetStatusBadge = ({ status, size }: { status: AssetOperationalStatus; size?: "sm" | "md" }) => (
  <Badge token={OPERATIONAL_STATUS[status]} size={size} />
);

export const CriticalityBadge = ({ level, size }: { level: Criticality; size?: "sm" | "md" }) => (
  <Badge token={CRITICALITY[level]} size={size} />
);

export const SeverityBadge = ({ severity, size }: { severity: EventSeverity; size?: "sm" | "md" }) => (
  <Badge token={EVENT_SEVERITY[severity]} size={size} />
);

export const DataFreshnessBadge = ({ freshness, size }: { freshness: DataFreshness; size?: "sm" | "md" }) => (
  <Badge token={FRESHNESS[freshness]} size={size} />
);

export const WorkOrderStatusBadge = ({ status, size }: { status: WorkOrderStatus; size?: "sm" | "md" }) => (
  <Badge token={WORK_ORDER_STATUS[status]} size={size} />
);

export const ValueStatusBadge = ({ status, size }: { status: ValueStatus; size?: "sm" | "md" }) => (
  <Badge token={VALUE_STATUS[status]} size={size} />
);

export const DispositionBadge = ({ disposition, size }: { disposition: RecommendedDisposition; size?: "sm" | "md" }) => (
  <Badge token={DISPOSITION[disposition]} size={size} />
);

export const ReadinessBadge = ({ status, size }: { status: ReadinessStatus; size?: "sm" | "md" }) => (
  <Badge token={READINESS[status]} size={size} />
);

export const ProvenanceTag = ({ provenance, size }: { provenance: Provenance; size?: "sm" | "md" }) => (
  <Badge token={PROVENANCE[provenance]} size={size} />
);

/** Prominent, scannable equipment identifier, e.g. "K-201". */
export function EquipmentId({
  tag,
  className,
  size = "md",
}: {
  tag: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "equipment-id inline-flex items-center rounded-sm bg-elevated px-1.5 text-text-primary ring-1 ring-inset ring-border",
        size === "lg" ? "text-lg" : size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {tag}
    </span>
  );
}
