"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/layout/icons";
import { useOperationalContext } from "@/context/OperationalContext";
import { getAuthorizationProvider } from "@/personas/authorization";
import { getPersona, PERSONAS } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import { v2LandingRoute } from "@/v2/nav";

/**
 * V2 persona selector — "Explore as: <persona>". Identical governance to v1
 * (shows only authorization-permitted personas, preserves the active asset
 * thread, is a view selection and not authentication) but routes to the `/v2`
 * landing surface. Persona identity comes entirely from the registry.
 */
export function V2PersonaSelector() {
  const router = useRouter();
  const { personaId, assetTag, setPersona } = useOperationalContext();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const auth = getAuthorizationProvider();
  const permitted = auth.getPermittedPersonas();
  const active = getPersona(personaId);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 2600);
    return () => clearTimeout(t);
  }, [confirm]);

  // When the menu opens, move focus to the selected option so keyboard users
  // land inside the listbox (matches the governed assistant's focus handling).
  useEffect(() => {
    if (!open) return;
    const opts = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!opts || opts.length === 0) return;
    const activeIdx = Array.from(opts).findIndex((o) => o.getAttribute("aria-selected") === "true");
    opts[activeIdx >= 0 ? activeIdx : 0]?.focus();
  }, [open]);

  function closeAndReturnFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAndReturnFocus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const opts = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      );
      if (opts.length === 0) return;
      const idx = opts.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        e.key === "ArrowDown"
          ? (idx + 1) % opts.length
          : (idx - 1 + opts.length) % opts.length;
      opts[next]?.focus();
    }
  }

  function choose(id: PersonaId) {
    setOpen(false);
    if (id === personaId) return;
    setPersona(id);
    setConfirm(`Now exploring as ${PERSONAS[id].displayName}`);
    router.push(v2LandingRoute(id, { assetTag }));
  }

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Explore as ${active.displayName}. This changes the demonstration lens, not your operational authority. Change persona.`}
        title={active.displayName}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] px-2.5 py-1.5 text-sm text-header-fg hover:bg-[var(--color-header-control-hover)]"
      >
        <Icon name="user" size={15} className="shrink-0 text-header-muted" />
        <span className="hidden shrink-0 text-header-muted md:inline">Explore as</span>
        <span className="max-w-[10.5rem] truncate font-medium xl:max-w-[16rem]">{active.displayName}</span>
        <Icon name="chevron-down" size={14} className="shrink-0 text-header-muted" />
      </button>

      {open ? (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={listRef}
            role="listbox"
            aria-label="Select persona"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-md border border-border bg-surface shadow-panel"
          >
            <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Explore as — changes the demonstration lens only
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {permitted.map((id) => {
                const p = PERSONAS[id];
                const isActive = id === personaId;
                return (
                  <li key={id}>
                    <button
                      role="option"
                      aria-selected={isActive}
                      onClick={() => choose(id)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-elevated",
                        isActive && "bg-brand-subtle",
                      )}
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-brand">
                        {isActive ? <Icon name="check" size={14} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-sm", isActive ? "font-semibold text-brand-text" : "text-text-primary")}>
                          {p.displayName}
                        </span>
                        <span className="block truncate text-xs text-text-muted">{p.accountability}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border bg-elevated px-3 py-2 text-[11px] text-text-muted">
              {auth.modeLabel}
            </div>
          </div>
        </>
      ) : null}

      {confirm ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-md border border-healthy-border bg-healthy-subtle px-3 py-1.5 text-xs font-medium text-healthy-text shadow-card"
        >
          <span className="mr-1" aria-hidden>✓</span>
          {confirm}
        </div>
      ) : null}
    </div>
  );
}
