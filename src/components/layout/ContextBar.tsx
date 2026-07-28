"use client";

import { Icon } from "./icons";
import { SourceStatus } from "@/components/ui/enterprise";
import { useOperationalContext } from "@/context/OperationalContext";
import { getPersona } from "@/personas/registry";
import type { TimeRangeKey } from "@/personas/types";

const TIME_LABELS: Record<TimeRangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  shift: "Current shift",
};

/**
 * Context bar (tier 2): the shared operational context — plant, unit, time/shift
 * — plus data-freshness and source-system status. Selections persist in the
 * shared context and survive persona switches.
 */
export function ContextBar({
  plants,
  units,
}: {
  plants: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string; plantId: string }>;
}) {
  const ctx = useOperationalContext();
  const persona = getPersona(ctx.personaId);
  const unitOptions = units.filter((u) => u.plantId === ctx.plantId);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-canvas px-4 py-2 text-sm">
      <Field label="Plant" icon="plant">
        <select
          aria-label="Plant"
          value={ctx.plantId}
          onChange={(e) => ctx.setPlant(e.target.value)}
          className="rounded border border-border-strong bg-surface px-2 py-1 text-sm font-medium text-text-primary"
        >
          {plants.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Unit">
        <select
          aria-label="Unit"
          value={ctx.unitId ?? ""}
          onChange={(e) => ctx.setUnit(e.target.value || null)}
          className="rounded border border-border-strong bg-surface px-2 py-1 text-sm font-medium text-text-primary"
        >
          <option value="">All units</option>
          {unitOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Range" icon="clock">
        <select
          aria-label="Time range"
          value={ctx.timeRange}
          onChange={(e) => ctx.setTimeRange(e.target.value as TimeRangeKey)}
          className="rounded border border-border-strong bg-surface px-2 py-1 text-sm font-medium text-text-primary"
        >
          {(Object.keys(TIME_LABELS) as TimeRangeKey[]).map((k) => (
            <option key={k} value={k}>{TIME_LABELS[k]}</option>
          ))}
        </select>
      </Field>

      {ctx.shift || persona.context.shift ? (
        <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary">
          <Icon name="shift" size={13} className="text-text-muted" />
          {ctx.shift ?? persona.context.shift}
        </span>
      ) : null}

      {ctx.assetTag ? (
        <span className="inline-flex items-center gap-1.5 rounded border border-brand bg-brand-subtle px-2 py-1 text-xs font-medium text-brand-text">
          <Icon name="asset" size={13} />
          Active asset: {ctx.assetTag}
          <button
            aria-label="Clear active asset"
            className="ml-0.5 text-brand-text/70 hover:text-brand-text"
            onClick={() => ctx.setAsset(null)}
          >
            ✕
          </button>
        </span>
      ) : null}

      <div className="ml-auto">
        <SourceStatus sourceMode={ctx.sourceMode} freshness={ctx.dataFreshness} updated="synthetic" />
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: "plant" | "clock";
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      {icon ? <Icon name={icon} size={14} className="text-text-muted" /> : null}
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </label>
  );
}
