"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/layout/icons";
import { cn } from "@/lib/cn";

/**
 * Accessible left-side navigation drawer/sheet for constrained widths (below
 * the `lg` breakpoint where the persistent sidebar is hidden — see
 * `V2ShellClient`). Mirrors the focus-trap/Escape/scroll-lock/focus-restore
 * contract already proven by the Case Investigator's `Drawer` primitive, but
 * is a separate, generic component so that primitive (and its behavior) stays
 * untouched. Closes automatically when the route changes underneath it, so
 * selecting a navigation destination always returns the visitor to the
 * workspace rather than leaving the sheet open over it.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavDrawer({
  open,
  onClose,
  contextLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  contextLabel: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const openedPathname = useRef(pathname);

  useEffect(() => setMounted(true), []);

  // Selecting a route closes the drawer: track the pathname at open time and
  // close as soon as it changes while the sheet is still open.
  useEffect(() => {
    if (!open) {
      openedPathname.current = pathname;
      return;
    }
    if (pathname !== openedPathname.current) onClose();
  }, [open, pathname, onClose]);

  // Defensive: if the viewport grows past the breakpoint that hides the
  // trigger, close the sheet rather than leaving an orphaned overlay open.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) {
      onClose();
      return;
    }
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    const body = document.body;
    const priorOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = priorOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-[85vw] max-w-[300px] flex-col bg-surface shadow-xl outline-none",
          "border-r border-border",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">Navigate</div>
            <div className="truncate text-xs text-text-muted">{contextLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-text-secondary",
              "hover:border-border-strong hover:text-text-primary",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            )}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
