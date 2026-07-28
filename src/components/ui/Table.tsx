import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-elevated">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Th({
  children,
  numeric,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-secondary",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-text-primary",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("bg-surface hover:bg-elevated/60", className)}>{children}</tr>;
}
