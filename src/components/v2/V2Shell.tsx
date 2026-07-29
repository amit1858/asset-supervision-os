import type { ReactNode } from "react";
import Link from "next/link";
import { OperationalContextProvider } from "@/context/OperationalContext";
import { readOperationalContext } from "@/context/server";
import { getDataset } from "@/data/seed";
import { V2ShellClient } from "./V2ShellClient";

export interface V2Crumb {
  label: string;
  href?: string;
}

/**
 * V2 application shell (server). Same contract as the v1 AppShell — reads the
 * shared operational context from cookies, provides it to the client tree, and
 * derives header counts from the real seeded dataset — but renders the V2 chrome
 * and navigation. Existing v1 routes are untouched; this is a parallel surface.
 */
export function V2Shell({
  children,
  crumbs,
}: {
  children: ReactNode;
  crumbs?: V2Crumb[];
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
      <V2ShellClient plants={plants} units={units} approvals={approvals} notifications={notifications}>
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
      </V2ShellClient>
    </OperationalContextProvider>
  );
}
