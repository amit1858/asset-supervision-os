"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { resolveTheme, normalizeThemePref, THEME_STORAGE_KEY, type ThemePref } from "@/lib/theme";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref, systemPrefersDark());
}

/**
 * Light / Dark / System theme switcher. Persists the preference and, in system
 * mode, follows OS changes live. The initial theme is set pre-paint by an inline
 * script in the root layout, so this control only reflects/updates it.
 */
export function ThemeSwitcher() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  // Read the stored preference after mount (avoids hydration mismatch).
  useEffect(() => {
    setPref(normalizeThemePref(localStorage.getItem(THEME_STORAGE_KEY)));
    setMounted(true);
  }, []);

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    if (!mounted) return;
    applyTheme(pref);
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  }, [pref, mounted]);

  // Follow OS changes while in system mode.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const options: Array<{ value: ThemePref; label: string; symbol: string }> = [
    { value: "light", label: "Light", symbol: "☀" },
    { value: "dark", label: "Dark", symbol: "☾" },
    { value: "system", label: "System", symbol: "⌂" },
  ];

  return (
    <div
      className="inline-flex items-center rounded-md border border-[var(--color-header-control-border)] bg-[var(--color-header-control)] p-0.5"
      role="radiogroup"
      aria-label="Color theme"
    >
      {options.map((o) => {
        const active = mounted && pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label} theme`}
            title={`${o.label} theme`}
            onClick={() => setPref(o.value)}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded text-sm transition-colors duration-fast",
              active
                ? "bg-white/20 text-header-fg"
                : "text-header-muted hover:bg-[var(--color-header-control-hover)] hover:text-header-fg",
            )}
          >
            <span aria-hidden>{o.symbol}</span>
          </button>
        );
      })}
    </div>
  );
}
