import type { ReactNode } from "react";
import Link from "next/link";
import { OperationalContextProvider } from "@/context/OperationalContext";
import { readOperationalContext } from "@/context/server";
import { Shell } from "./Shell";
import { getDataset } from "@/data/seed";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Application shell (server). Reads the operational context from cookies,
 * provides it to the client tree, and renders the enterprise Shell. Header
 * counts (approvals, notifications) are derived from real seeded data.
 */
export function AppShell({
  children,
  crumbs,
}: {
  children: ReactNode;
  crumbs?: Crumb[];
}) {
  const ctx = readOperationalContext();
  const db = getDataset();

  const plants = db.plants.map((p) => ({ id: p.id, name: p.name }));
  const units = db.productionLines.map((l) => ({
    id: l.id,
    name: `${l.code} — ${l.name}`,
    plantId: l.plantId,
  }));

  const approvals = db.recommendations.filter((r) => r.status === "open").length;
  const notifications = db.conditionEvents.filter((c) => !c.acknowledged).length;

  return (
    <OperationalContextProvider initial={ctx}>
      <Shell plants={plants} units={units} approvals={approvals} notifications={notifications}>
        {crumbs && crumbs.length > 0 ? (
          <div className="border-b border-border bg-surface">
            <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-content px-6 py-2">
              <ol className="flex items-center gap-1.5 text-xs text-text-muted">
                {crumbs.map((c, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {c.href ? (
                      <Link href={c.href} className="hover:text-text-primary hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      <span className={i === crumbs.length - 1 ? "font-medium text-text-secondary" : ""}>
                        {c.label}
                      </span>
                    )}
                    {i < crumbs.length - 1 ? <span aria-hidden>/</span> : null}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        ) : null}
        {children}
      </Shell>
    </OperationalContextProvider>
  );
}
