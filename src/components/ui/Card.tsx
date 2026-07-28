import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-md border border-border bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-start gap-2.5">
        {icon ? <div className="mt-0.5 text-text-muted">{icon}</div> : null}
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

/** Page-level width container tuned for 1440px operations screens. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-content px-6 py-6">{children}</div>;
}

export function PageTitle({
  title,
  context,
  actions,
}: {
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {context ? (
          <div className="mt-1 text-sm text-text-secondary">{context}</div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="mb-6" id={id}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Responsive grid; defaults to 12 columns on desktop, stacks on small screens. */
export function Grid({
  children,
  cols = 12,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 12;
  className?: string;
}) {
  const map: Record<number, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    12: "lg:grid-cols-12",
  };
  return <div className={cn("grid grid-cols-1 gap-4", map[cols], className)}>{children}</div>;
}
