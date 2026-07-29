import Link from "next/link";
import { getPersona } from "@/personas/registry";
import { describeRouteSource } from "@/v2/source";
import type { V2Route } from "@/v2/routes";

/**
 * Honest Phase 1 placeholder for a V2 surface. It never fabricates operational
 * content: it states the page's job, the accountable persona, exactly what
 * Phase 2 will build here, and the honest source posture of the data. This keeps
 * the shell, navigation, context, and thread reviewable now without pretending
 * the workspace depth exists yet.
 */
export function V2Placeholder({ route }: { route: V2Route }) {
  const owner = getPersona(route.ownerPersona);
  const source = describeRouteSource(route.source);

  return (
    <section
      aria-label={`${route.title} — planned workspace`}
      className="rounded-md border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-text-primary">Planned workspace</h2>
        <span
          className="inline-flex items-center gap-1.5 rounded border border-border bg-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary"
          title={source.detail}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-neutralstatus" />
          {source.label}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Primary job
            </dt>
            <dd className="mt-1 text-sm text-text-primary">{route.purpose}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Accountable persona
            </dt>
            <dd className="mt-1 text-sm text-text-primary">
              {owner.displayName}
              <span className="text-text-muted"> · {owner.family.replace(/_/g, " ")}</span>
            </dd>
          </div>
        </dl>

        <div className="rounded border border-border bg-canvas px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-text">
            Coming in Phase 2
          </div>
          <p className="mt-1 text-sm text-text-secondary">{route.phase2}</p>
        </div>

        <p className="text-xs text-text-muted">
          The shared operational context, persona-aware navigation, the assistant,
          and the {" "}
          <span className="font-medium text-text-secondary">Signal → Value</span>{" "}
          thread above are live now. The detailed workspace for this surface is
          delivered in the next phase against the existing deterministic engines —
          no data is invented here. See the current record in{" "}
          <Link href="/" className="font-medium text-brand-text hover:underline">
            the production experience
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
