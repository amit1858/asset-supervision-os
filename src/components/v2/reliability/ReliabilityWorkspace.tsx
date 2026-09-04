import Link from "next/link";
import { formatUtcInstant, type ReliabilityWorkspaceView } from "@/v2/reliability/view-types";
import { SectionCard } from "./primitives";

/**
 * September 6–7 Reliability experience — the Reliability Command Center
 * workspace. Opens on the governed priority queue. Pure presentation: every
 * figure arrives resolved on `view`; this component computes nothing.
 */
export function ReliabilityWorkspace({ view }: { view: ReliabilityWorkspaceView }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {view.summary.map((s) => (
          <div key={s.label} className="rounded-md border border-border bg-surface px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {s.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
              {s.value}
            </div>
            <div className="mt-0.5 text-[11px] text-text-muted">{s.hint}</div>
          </div>
        ))}
      </div>

      <SectionCard
        eyebrow="Priority queue"
        title="Assets requiring a governed decision"
        aside={`Evaluated ${formatUtcInstant(view.evaluatedAt)}`}
      >
        {view.priorities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 font-medium">Asset</th>
                  <th className="px-2 py-1.5 font-medium">Health</th>
                  <th className="px-2 py-1.5 font-medium">Risk</th>
                  <th className="px-2 py-1.5 font-medium">Time to critical</th>
                  <th className="px-2 py-1.5 font-medium">Exposure</th>
                  <th className="px-2 py-1.5 font-medium">Decision</th>
                  <th className="px-2 py-1.5 font-medium">Next action</th>
                </tr>
              </thead>
              <tbody>
                {view.priorities.map((row) => (
                  <tr key={row.tag} className="border-b border-border hover:bg-elevated">
                    <td className="px-2 py-2">
                      <Link
                        href={row.href}
                        className="font-medium text-info-text underline-offset-2 hover:underline"
                      >
                        {row.assetName}
                      </Link>
                      <div className="text-[11px] text-text-muted">{row.tag}</div>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-text-primary">
                      {row.healthDisplay}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-text-primary">{row.riskDisplay}</td>
                    <td className="px-2 py-2 tabular-nums text-text-primary">
                      {row.timeToCriticalDisplay}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-text-primary">
                      {row.exposureDisplay}
                    </td>
                    <td className="px-2 py-2 text-text-secondary">{row.decisionStatusLabel}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.nextActLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-elevated px-3 py-6 text-center">
            <div className="text-xs font-medium text-text-secondary">{view.emptyTitle}</div>
            <p className="mt-1 text-[11px] text-text-muted">{view.emptyDescription}</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
