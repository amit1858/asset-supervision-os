import type {
  ConditionEvent,
  InventoryBalance,
  MaintenanceHistoryRecord,
  SparePart,
  WorkOrder,
} from "@/domain/types";
import { Table, TBody, Td, Th, THead, TRow } from "./Table";
import { WorkOrderStatusBadge, SeverityBadge, ProvenanceTag } from "./Badge";
import { fmtCurrency, fmtDate, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

export function WorkOrderTable({ workOrders }: { workOrders: WorkOrder[] }) {
  return (
    <Table caption="Open and recent work orders">
      <THead>
        <TRow>
          <Th>Work order</Th>
          <Th>Title</Th>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th>Priority</Th>
          <Th numeric>Est. cost</Th>
          <Th>Scheduled</Th>
        </TRow>
      </THead>
      <TBody>
        {workOrders.map((wo) => (
          <TRow key={wo.id}>
            <Td className="font-mono text-xs font-semibold">{wo.number}</Td>
            <Td>{wo.title}</Td>
            <Td className="capitalize text-text-secondary">{wo.type}</Td>
            <Td>
              <WorkOrderStatusBadge status={wo.status} size="sm" />
            </Td>
            <Td className="font-medium">{wo.priority}</Td>
            <Td numeric>{fmtCurrency(wo.estimatedCost, wo.currency)}</Td>
            <Td className="text-text-secondary">
              {wo.scheduledStart ? fmtDate(wo.scheduledStart) : "—"}
            </Td>
          </TRow>
        ))}
      </TBody>
    </Table>
  );
}

/** Spare availability with an explicit stock/lead-time status. */
export function SpareAvailability({
  spares,
}: {
  spares: Array<{ part: SparePart; balance: InventoryBalance | null }>;
}) {
  return (
    <ul className="space-y-2">
      {spares.map(({ part, balance }) => {
        const available = (balance?.onHandQty ?? 0) - (balance?.reservedQty ?? 0);
        const inStock = available > 0;
        return (
          <li
            key={part.id}
            className="flex items-center justify-between gap-3 rounded border border-border bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-text-primary">
                  {part.partNumber}
                </span>
                {part.criticalSpare ? (
                  <span className="rounded-sm bg-critical-subtle px-1 text-[10px] font-semibold text-critical-text">
                    Critical spare
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-text-secondary">{part.description}</p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold",
                  inStock ? "text-healthy-text" : "text-critical-text",
                )}
              >
                <span aria-hidden>{inStock ? "●" : "○"}</span>
                {inStock ? `${available} in stock` : "Not in stock"}
              </div>
              <div className="text-[11px] text-text-muted">
                {inStock ? "Ready to issue" : `${part.leadTimeDays}-day lead time`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical event timeline distinguishing provenance and severity. */
export function EventTimeline({ events }: { events: ConditionEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-muted">No condition events recorded.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-attention"
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={e.severity} size="sm" />
            <ProvenanceTag provenance={e.provenance} size="sm" />
            <span className="text-xs text-text-muted">{fmtRelative(e.detectedAt)}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-text-primary">{e.rule}</p>
          <p className="text-xs text-text-secondary">{e.detail}</p>
        </li>
      ))}
    </ol>
  );
}

export function MaintenanceHistoryTable({
  records,
}: {
  records: MaintenanceHistoryRecord[];
}) {
  return (
    <Table caption="Maintenance history">
      <THead>
        <TRow>
          <Th>Date</Th>
          <Th>Activity</Th>
          <Th>Findings</Th>
          <Th numeric>Labor h</Th>
        </TRow>
      </THead>
      <TBody>
        {records.map((m) => (
          <TRow key={m.id}>
            <Td className="whitespace-nowrap text-text-secondary">{fmtDate(m.performedAt)}</Td>
            <Td className="font-medium">{m.activity}</Td>
            <Td className="text-text-secondary">{m.findings}</Td>
            <Td numeric>{m.laborHours}</Td>
          </TRow>
        ))}
      </TBody>
    </Table>
  );
}

/** Financial impact block with an explicit deterministic provenance tag. */
export function FinancialImpact({
  exposureUsd,
  breakdown,
  currency = "USD",
}: {
  exposureUsd: number;
  breakdown: Array<{ label: string; valueUsd: number }>;
  currency?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Financial exposure
        </span>
        <ProvenanceTag provenance="deterministic" size="sm" />
      </div>
      <div className="mt-1 metric-value text-metric tabular-nums text-critical-text">
        {fmtCurrency(exposureUsd, currency)}
      </div>
      <ul className="mt-2 space-y-1">
        {breakdown.map((b) => (
          <li key={b.label} className="flex justify-between text-xs">
            <span className="text-text-secondary">{b.label}</span>
            <span className="tabular-nums font-medium text-text-primary">
              {fmtCurrency(b.valueUsd, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
