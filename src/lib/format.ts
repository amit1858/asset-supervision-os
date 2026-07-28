/**
 * Formatting helpers. All numeric formatters use tabular figures at the display
 * layer; engines keep full precision. A fixed anchor makes relative times
 * deterministic for the demo.
 */
import { ANCHOR_NOW } from "@/data/constants";

const ANCHOR_MS = new Date(ANCHOR_NOW).getTime();

export function fmtNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function fmtCurrency(n: number, currency = "USD", compact = false): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
}

/** Micro-dollar aware cost formatter for token spend. */
export function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Deterministic relative time against the fixed demo anchor. */
export function fmtRelative(iso: string): string {
  const diffMs = ANCHOR_MS - new Date(iso).getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "yesterday" : `${days} days ago`;
  const ahead = -days;
  return ahead === 1 ? "in 1 day" : `in ${ahead} days`;
}

export function fmtDays(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n)} day${Math.round(n) === 1 ? "" : "s"}`;
}
