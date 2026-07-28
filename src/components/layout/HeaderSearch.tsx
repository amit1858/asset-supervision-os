"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/**
 * Global search that stays inline at wide widths (≥ xl) and collapses to an
 * icon-triggered, focus-managed overlay at constrained widths (including 1024).
 * The expanded overlay is keyboard accessible, labelled, dismissible with
 * Escape, and returns focus to the trigger — without navigating or losing the
 * user's page context.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const inputClasses =
    "w-full rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] py-1.5 pl-8 pr-3 text-sm text-header-fg placeholder:text-header-muted focus:border-white/40 focus:bg-[var(--color-header-control-hover)]";

  return (
    <>
      {/* Inline search — wide widths only */}
      <form
        className="relative ml-2 hidden max-w-md flex-1 xl:block"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-header-muted">
          <Icon name="search" size={15} />
        </span>
        <input
          type="search"
          aria-label="Search assets, work orders, recommendations"
          placeholder="Search assets, work orders, recommendations…"
          className={inputClasses}
        />
      </form>

      {/* Icon trigger — constrained widths */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open search"
        aria-expanded={open}
        title="Search"
        onClick={() => setOpen(true)}
        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)] xl:hidden"
      >
        <Icon name="search" size={18} />
      </button>

      {/* Expanded overlay across the header */}
      {open ? (
        <div
          role="search"
          aria-label="Search"
          className="absolute inset-x-0 top-0 z-10 flex h-[54px] items-center gap-2 bg-header-bg px-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <span className="text-header-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            ref={inputRef}
            type="search"
            aria-label="Search assets, work orders, recommendations"
            placeholder="Search assets, work orders, recommendations…"
            className={inputClasses + " flex-1 pl-3"}
          />
          <button
            type="button"
            aria-label="Close search"
            title="Close search"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)]"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ) : null}
    </>
  );
}
