"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { V2TopBar } from "./V2TopBar";
import { V2SideNavigation } from "./V2SideNavigation";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { ContextBar } from "@/components/layout/ContextBar";
import { VoiceProvider, useVoice } from "@/voice/VoiceContext";
import { VoiceBriefingPanel } from "@/components/voice/VoiceBriefingPanel";
import { useOperationalContext } from "@/context/OperationalContext";
import { getPersona } from "@/personas/registry";
import { cn } from "@/lib/cn";
import { GuidedJourney } from "./GuidedJourney";

interface NameMap {
  id: string;
  name: string;
}
interface UnitMap {
  id: string;
  name: string;
  plantId: string;
}

/**
 * V2 client shell. Mirrors the v1 Shell layout contract — one sticky header
 * (V2TopBar + the shared, route-agnostic ContextBar) whose measured height drives
 * the sidebar offset, and a reflow that keeps the docked assistant beside the
 * decision context rather than over it. The governed assistant (VoiceProvider +
 * VoiceBriefingPanel) is reused unchanged, so its server truth boundary is
 * preserved.
 */
export function V2ShellClient({
  plants,
  units,
  approvals,
  notifications,
  children,
}: {
  plants: NameMap[];
  units: UnitMap[];
  approvals: number;
  notifications: number;
  children: ReactNode;
}) {
  return (
    <VoiceProvider plants={plants} units={units}>
      <ShellInner plants={plants} units={units} approvals={approvals} notifications={notifications}>
        {children}
      </ShellInner>
      <VoiceBriefingPanel />
    </VoiceProvider>
  );
}

function ShellInner({
  plants,
  units,
  approvals,
  notifications,
  children,
}: {
  plants: NameMap[];
  units: UnitMap[];
  approvals: number;
  notifications: number;
  children: ReactNode;
}) {
  const { isOpen } = useVoice();
  const { personaId } = useOperationalContext();
  const persona = getPersona(personaId);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      setHeaderH((prev) => (prev === h ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shellStyle =
    headerH != null ? ({ "--shell-header-h": `${headerH}px` } as CSSProperties) : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-canvas" style={shellStyle}>
      <header ref={headerRef} className="sticky top-0 z-30">
        <V2TopBar
          approvals={approvals}
          notifications={notifications}
          onOpenNav={() => setNavOpen(true)}
        />
        <ContextBar plants={plants} units={units} />
        <div className="flex justify-end border-b border-border bg-canvas px-4 py-1.5">
          <GuidedJourney />
        </div>
      </header>
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} contextLabel={persona.displayName}>
        <V2SideNavigation onNavigate={() => setNavOpen(false)} />
      </MobileNavDrawer>
      <div className="flex flex-1">
        <aside
          className="sticky hidden w-56 shrink-0 self-start overflow-y-auto border-r border-border bg-surface lg:block"
          style={{ top: "var(--shell-header-h)", height: "calc(100dvh - var(--shell-header-h))" }}
        >
          <V2SideNavigation />
        </aside>
        <main className={cn("min-w-0 flex-1", isOpen && "xl:pr-[400px]")}>{children}</main>
      </div>
    </div>
  );
}
