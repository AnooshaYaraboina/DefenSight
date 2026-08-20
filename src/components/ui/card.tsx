import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The console's surface.
 *
 * `.ds-panel` carries the shared language — a barely-there top-to-bottom
 * gradient and a 1px lit top edge that fades at both ends, so a panel reads as
 * catching light from above rather than as a box drawn on the page. Every
 * screen inherits it from here; nothing should hand-roll a bordered surface.
 */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "ds-panel",
        interactive && "ds-panel-interactive cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[13px] font-semibold tracking-tight text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-xs text-ink-3", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-line px-4 py-3", className)}
      {...props}
    />
  );
}
