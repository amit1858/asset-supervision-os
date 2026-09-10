import type { IconName } from "@/personas/types";

/**
 * Minimal enterprise line-icon set (16px, 1.5 stroke, currentColor). Restrained
 * geometric marks — no playful/consumer glyphs. Covers navigation and common
 * shell affordances without a third-party icon dependency.
 */
export type UiIconName =
  | IconName
  | "search"
  | "bell"
  | "approvals"
  | "chevron-down"
  | "plant"
  | "clock"
  | "check"
  | "alert"
  | "menu"
  | "user"
  | "close"
  | "voice"
  | "mic"
  | "stop"
  | "send"
  | "more";

const P: Record<UiIconName, string> = {
  // nav
  overview: "M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z",
  shift: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  reliability: "M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z",
  watchlist: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  planning: "M4 4h16v16H4zM8 4v16M4 9h16",
  materials: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
  turnaround: "M4 12a8 8 0 018-8 8 8 0 016 2.7M20 12a8 8 0 01-8 8 8 8 0 01-6-2.7M18 4v3h-3M6 20v-3h3",
  agent: "M12 3a3 3 0 013 3v1h1a3 3 0 013 3v3a6 6 0 01-6 6h-2a6 6 0 01-6-6V10a3 3 0 013-3h1V6a3 3 0 013-3zM9 13h.01M15 13h.01",
  asset: "M6 3h9l3 3v15H6zM9 8h6M9 12h6M9 16h4",
  oee: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  value: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  portfolio: "M3 4h18v4H3zM3 12h8v8H3zM14 12h7v8h-7z",
  candidates: "M9 11l3 3 8-8M4 12v7a1 1 0 001 1h14",
  // shell
  search: "M11 11a5 5 0 10-7-7 5 5 0 007 7zM21 21l-6.5-6.5",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  approvals: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "chevron-down": "M6 9l6 6 6-6",
  plant: "M3 21V9l6 4V9l6 4V5l6 4v12zM3 21h18",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  check: "M20 6L9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3.1l-8-14a2 2 0 00-3.4 0z",
  menu: "M3 6h18M3 12h18M3 18h18",
  user: "M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z",
  close: "M18 6L6 18M6 6l12 12",
  voice: "M4 5h15a1 1 0 011 1v8a1 1 0 01-1 1H9l-5 4V5zM8.5 10h.01M12 10h.01M15.5 10h.01",
  mic: "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 11v1a7 7 0 01-14 0v-1M12 19v3M8.5 22h7",
  stop: "M7 7h10v10H7z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: UiIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={P[name]} />
    </svg>
  );
}
