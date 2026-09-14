"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/layout/icons";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { VoiceHeaderButton } from "@/components/voice/VoiceLauncher";
import { V2PersonaSelector } from "./V2PersonaSelector";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useModelConnection } from "@/components/auth/ModelConnectionProvider";

/**
 * V2 top bar (tier 1). Mirrors the v1 chrome — identity, global search, and
 * account/context controls — but every link stays inside the `/v2` namespace and
 * the persona selector routes to `/v2` landings. A small preview marker makes it
 * explicit that this is the parallel rebuild, not the production experience.
 *
 * Identity here comes from the real Auth.js session (`useAuthSession`), never
 * a mock. Signing in identifies the visitor; it does not, by itself, change
 * persona authority (see `V2PersonaSelector`). Authenticated visitors may
 * connect NVIDIA in this tab until reload; guests remain on deterministic
 * narration and cannot open the credential surface.
 *
 * Below `lg` there is no room for every desktop control at once (voice,
 * notifications, approvals, theme — 4 controls, ~215px). Those four move
 * behind a single "More actions" menu (`MobileActionsMenu`) so the header
 * never causes document-level horizontal overflow; persona, model-connection
 * status, and identity/guest access stay directly visible at every width
 * because they carry operational meaning that should never be one tap away.
 * `onOpenNav`, when provided, renders a `lg:hidden` hamburger trigger for the
 * mobile navigation drawer (there is no persistent sidebar below `lg`).
 */
export function V2TopBar({
  approvals,
  notifications,
  onOpenNav,
}: {
  approvals: number;
  notifications: number;
  onOpenNav?: () => void;
}) {
  const { session, status } = useAuthSession();
  const { connection, openConnection } = useModelConnection();

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const isLoading = status === "loading";
  const identityLabel = isLoading
    ? "Checking access…"
    : isAuthenticated
      ? session?.user?.name ?? session?.user?.email ?? "Signed in"
      : "Guest Demo";

  return (
    <div data-app-header className="relative flex h-[54px] items-center gap-3 bg-header-bg px-4 text-header-fg">
      {onOpenNav ? (
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          title="Navigation"
          className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)] lg:hidden"
        >
          <Icon name="menu" size={20} />
        </button>
      ) : null}

      <Link href="/v2" className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-white/15 text-sm font-bold text-header-fg ring-1 ring-white/20" aria-hidden>
          A
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-semibold">Asset Supervision OS</span>
          <span className="block text-[10px] uppercase tracking-wide text-header-muted">
            Physical Operations Intelligence
          </span>
        </span>
      </Link>

      <span className="hidden rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-header-muted sm:inline">
        V2 preview
      </span>

      <HeaderSearch />

      <div className="ml-auto flex min-w-0 items-center gap-1">
        <div className="hidden items-center gap-1 lg:flex">
          <VoiceHeaderButton />
          <HeaderIconButton label={`Notifications (${notifications})`} icon="bell" count={notifications} />
          <HeaderIconButton label={`My Approvals (${approvals})`} icon="approvals" count={approvals} href="/v2/reliability" />
          <div className="mx-1.5 h-6 w-px bg-white/15" aria-hidden />
        </div>

        <MobileActionsMenu approvals={approvals} notifications={notifications} />

        <V2PersonaSelector />
        <button
          type="button"
          aria-disabled={!isAuthenticated}
          onClick={() => {
            if (isAuthenticated) openConnection();
          }}
          aria-label={
            isAuthenticated
              ? connection.status === "connected"
                ? "Provider connected in this tab until reload. Manage Provider Centre."
                : "Open Provider Centre"
              : "Deterministic narration — Provider Centre requires sign-in."
          }
          title={
            isAuthenticated
              ? connection.status === "connected"
                ? "A provider is connected in this tab until reload, sign-out, or disconnect."
                : "Connect a provider in this tab until reload, sign-out, or disconnect."
              : "Guest Demo uses governed deterministic narration. Sign in to open Provider Centre."
          }
          className="ml-0.5 flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] px-1.5 py-1.5 text-sm text-header-fg hover:bg-[var(--color-header-control-hover)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 lg:h-auto lg:px-2"
        >
          <Icon name="agent" size={15} />
          <span className="hidden min-[1360px]:inline">
            {connection.status === "connected"
              ? `${connection.provider} connected`
              : isAuthenticated
                ? "Provider Centre"
                : "Deterministic narration"}
          </span>
        </button>
        <div className="hidden lg:block">
          <ThemeSwitcher />
        </div>
        <Link
          href="/access"
          title={isAuthenticated ? `Signed in as ${identityLabel}` : "Guest Demo — sign in for more"}
          className="ml-0.5 flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] px-1.5 py-1.5 text-sm text-header-fg hover:bg-[var(--color-header-control-hover)] lg:h-auto lg:px-2"
        >
          <Icon name="user" size={15} />
          <span className="hidden max-w-[10rem] truncate min-[1360px]:inline">{identityLabel}</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Mobile-only ("lg:hidden") overflow menu that holds the voice launcher,
 * notifications, approvals, and theme switcher — the four controls that are
 * shown directly in the header at `lg` and above. Reuses the exact same
 * components/links as the desktop cluster (no reimplementation of voice or
 * theme behavior), just relocated behind one 44px trigger so the header fits
 * inside a 375px viewport without clipping or overflow.
 */
function MobileActionsMenu({
  approvals,
  notifications,
}: {
  approvals: number;
  notifications: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const badgeCount = approvals + notifications;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <div className="relative lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`More actions${badgeCount > 0 ? ` (${badgeCount})` : ""}`}
        title="More actions"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-11 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)]"
      >
        <Icon name="more" size={18} />
        {badgeCount > 0 ? (
          <span className="absolute right-1 top-1 min-w-[15px] rounded-full bg-white px-1 text-[10px] font-semibold leading-[15px] text-header-bg">
            {badgeCount}
          </span>
        ) : null}
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
            role="menu"
            aria-label="More actions"
            className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-md border border-border bg-surface text-text-primary shadow-panel"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <span className="text-sm">Voice</span>
              <VoiceHeaderButton />
            </div>
            <Link
              href="/v2/reliability"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-elevated"
            >
              <span>My Approvals</span>
              <span className="text-text-muted">{approvals}</span>
            </Link>
            <div
              role="menuitem"
              aria-label={`Notifications (${notifications})`}
              className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-text-secondary"
            >
              <span>Notifications</span>
              <span className="text-text-muted">{notifications}</span>
            </div>
            <div className="border-t border-border px-3 py-2.5">
              <div className="mb-1.5 text-xs text-text-muted">Theme</div>
              <ThemeSwitcher />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeaderIconButton({
  label,
  icon,
  count,
  href,
}: {
  label: string;
  icon: "bell" | "approvals";
  count: number;
  href?: string;
}) {
  const inner = (
    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)]">
      <Icon name={icon} size={18} />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full bg-white px-1 text-[10px] font-semibold leading-[15px] text-header-bg">
          {count}
        </span>
      ) : null}
    </span>
  );
  return href ? (
    <Link href={href} aria-label={label} title={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label}>
      {inner}
    </button>
  );
}
