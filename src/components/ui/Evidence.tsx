import type { RecommendationEvidence } from "@/domain/types";
import { ProvenanceTag } from "./Badge";
import { fmtRelative } from "@/lib/format";

/**
 * Evidence panel — the "why" behind a recommendation. Each row shows the fact,
 * its value, its provenance (measured / calculated / predicted / AI / human),
 * the source record, and when it was observed.
 */
export function EvidencePanel({ evidence }: { evidence: RecommendationEvidence[] }) {
  if (evidence.length === 0) {
    return <p className="text-sm text-text-muted">No evidence recorded.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {evidence.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-text-primary">{e.label}</span>
              <ProvenanceTag provenance={e.provenance} size="sm" />
            </div>
            <p className="mt-0.5 text-sm tabular-nums text-text-secondary">{e.value}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-text-muted">{e.sourceType.replace(/_/g, " ")}</div>
            {e.observedAt ? (
              <div className="text-[11px] text-text-muted">{fmtRelative(e.observedAt)}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Inline numbered citation chip that links a claim to a piece of evidence. */
export function EvidenceCitation({
  index,
  label,
}: {
  index: number;
  label?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-border bg-elevated px-1 text-[11px] font-medium text-text-secondary align-middle"
      title={label}
    >
      <span aria-hidden>※</span>
      {index}
    </span>
  );
}
