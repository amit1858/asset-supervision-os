"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { ContextBar } from "./ContextBar";
import { SideNavigation } from "./SideNavigation";
import { VoiceProvider, useVoice } from "@/voice/VoiceContext";
import { VoiceBriefingPanel } from "@/components/voice/VoiceBriefingPanel";
import { cn } from "@/lib/cn";

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
 * Client shell. TopBar + ContextBar form ONE sticky region whose measured
 * height drives the sidebar offset (--shell-header-h, with a CSS fallback for
 * first paint). When the assistant is docked (≥1280px) the main content reflows
 * so the panel sits beside it rather than covering the decision context.
 */
export function Shell({
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
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState<number | null>(null);

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
        <TopBar approvals={approvals} notifications={notifications} />
        <ContextBar plants={plants} units={units} />
      </header>
      <div className="flex flex-1">
        <aside
          className="sticky hidden w-56 shrink-0 self-start overflow-y-auto border-r border-border bg-surface lg:block"
          style={{ top: "var(--shell-header-h)", height: "calc(100dvh - var(--shell-header-h))" }}
        >
          <SideNavigation />
        </aside>
        {/* When docked (≥xl), reserve space so the assistant reflows content
            instead of covering the decision/blocker/workspace. */}
        <main className={cn("min-w-0 flex-1", isOpen && "xl:pr-[400px]")}>{children}</main>
      </div>
    </div>
  );
}
