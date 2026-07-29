"use client";

import Link from "next/link";
import { Icon } from "@/components/layout/icons";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { VoiceHeaderButton } from "@/components/voice/VoiceLauncher";
import { V2PersonaSelector } from "./V2PersonaSelector";

/**
 * V2 top bar (tier 1). Mirrors the v1 chrome — identity, global search, and
 * account/context controls — but every link stays inside the `/v2` namespace and
 * the persona selector routes to `/v2` landings. A small preview marker makes it
 * explicit that this is the parallel rebuild, not the production experience.
 */
export function V2TopBar({
  approvals,
  notifications,
}: {
  approvals: number;
  notifications: number;
}) {
  return (
    <div data-app-header className="relative flex h-[54px] items-center gap-3 bg-header-bg px-4 text-header-fg">
      <Link href="/v2" className="flex items-center gap-2.5">
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

      <div className="ml-auto flex items-center gap-1">
        <VoiceHeaderButton />
        <HeaderIconButton label={`Notifications (${notifications})`} icon="bell" count={notifications} />
        <HeaderIconButton label={`My Approvals (${approvals})`} icon="approvals" count={approvals} href="/v2/reliability" />
        <div className="mx-1.5 h-6 w-px bg-white/15" aria-hidden />
        <V2PersonaSelector />
        <ThemeSwitcher />
        <button
          type="button"
          className="ml-0.5 flex items-center gap-1.5 rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] px-2 py-1.5 text-sm text-header-fg hover:bg-[var(--color-header-control-hover)]"
          title="Demo user"
        >
          <Icon name="user" size={15} />
          <span className="hidden lg:inline">Demo user</span>
        </button>
      </div>
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
