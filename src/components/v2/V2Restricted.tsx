import Link from "next/link";
import { getPersona } from "@/personas/registry";
import { EmptyWorkspace } from "@/components/ui/enterprise";
import type { V2Route } from "@/v2/routes";

/**
 * Restricted state for a V2 surface the active persona cannot access. The
 * missing authority is explained in text (not conveyed by colour or silence),
 * the required capabilities are named, and a route back to the persona's own
 * landing is offered. Access is always decided by the capability model on the
 * server — this component only presents the outcome.
 */
export function V2Restricted({
  route,
  backHref = "/v2",
}: {
  route: V2Route;
  backHref?: string;
}) {
  const owner = getPersona(route.ownerPersona);
  const caps = route.access?.anyOf ?? [];

  return (
    <div className="mx-auto w-full max-w-content px-6 py-10">
      <EmptyWorkspace
        title={`${route.title} is not available for the current persona`}
        description={`This surface is accountable to the ${owner.displayName} and requires a capability the current persona does not hold. Switching persona changes your view, not your authority.`}
        hint={
          <div className="flex flex-col items-center gap-3">
            {caps.length > 0 ? (
              <p className="text-xs text-text-muted">
                Requires one of:{" "}
                <span className="font-medium text-text-secondary">
                  {caps.map((c) => c.replace(/_/g, " ")).join(", ")}
                </span>
              </p>
            ) : null}
            <Link
              href={backHref}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-brand-text hover:bg-elevated"
            >
              Back to my workspace
            </Link>
          </div>
        }
      />
    </div>
  );
}
