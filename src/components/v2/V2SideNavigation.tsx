"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/layout/icons";
import { useOperationalContext } from "@/context/OperationalContext";
import { getPersona } from "@/personas/registry";
import { v2NavItems } from "@/v2/nav";

/**
 * V2 persona-aware left navigation. Content, order, and capability gating all
 * come from the persona registry via `v2NavItems` — there is no second,
 * hand-authored v2 navigation model (decision §3). Hrefs are mapped into the
 * `/v2` namespace; the `/design-system` showcase can never appear because it is
 * not a registry nav item (decision §4).
 */
export function V2SideNavigation() {
  const pathname = usePathname();
  const { personaId } = useOperationalContext();
  const persona = getPersona(personaId);
  const items = v2NavItems(personaId);

  return (
    <nav aria-label="Primary" className="flex h-full flex-col p-2">
      <div className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {persona.family.replace(/_/g, " ")}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const base = item.v2Href.split("?")[0]!;
          const active =
            base === "/v2"
              ? pathname === "/v2"
              : pathname === base || pathname.startsWith(base + "/");
          return (
            <li key={item.v2Href}>
              <Link
                href={item.v2Href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors duration-fast",
                  active
                    ? "bg-brand-subtle font-medium text-brand-text"
                    : "text-text-secondary hover:bg-elevated hover:text-text-primary",
                )}
              >
                <span className={active ? "text-brand" : "text-text-muted"}>
                  <Icon name={item.icon} size={17} />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto px-2 pb-1 pt-3 text-[10px] leading-relaxed text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-neutralstatus" aria-hidden />
          Synthetic demonstration environment
        </span>
      </div>
    </nav>
  );
}
