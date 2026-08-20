import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Standard page masthead. Every console screen uses this so titles, supporting
 * copy and primary actions sit in the same place on every route.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ink-3">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Section divider inside a long page. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-4">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
