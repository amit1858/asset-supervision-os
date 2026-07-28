import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-text-inverted hover:bg-brand-hover border-brand",
  secondary: "bg-surface text-text-primary hover:bg-elevated border-border-strong",
  ghost: "bg-transparent text-text-secondary hover:bg-elevated border-transparent",
  danger: "bg-critical text-text-inverted hover:opacity-90 border-critical",
  success: "bg-healthy text-text-inverted hover:opacity-90 border-healthy",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
