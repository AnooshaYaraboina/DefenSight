import * as React from "react";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Shimmer placeholder. Sized by the caller. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ds-skeleton rounded", className)} {...props} />;
}

/** Table-shaped loading state so layout does not jump when data lands. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="ds-panel divide-y divide-line">
      <div className="flex gap-3 bg-surface-2 px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3 flex-1"
              style={{ opacity: 1 - r * (0.6 / rows) }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-line bg-surface-2">
        <Icon className="size-5 text-ink-4" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-ink-4">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-critical/30 bg-critical-dim">
        <AlertCircle className="size-5 text-critical" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-ink-4">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      )}
    </div>
  );
}
