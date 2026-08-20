import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded font-medium whitespace-nowrap border [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface-2 text-ink-2",
        brand: "border-brand/35 bg-brand-dim/50 text-brand",
        critical: "border-critical/35 bg-critical-dim text-critical",
        high: "border-high/35 bg-high-dim text-high",
        medium: "border-medium/35 bg-medium-dim text-medium",
        low: "border-low/35 bg-low-dim text-low",
        info: "border-info/30 bg-info-dim text-info",
        allow: "border-allow/35 bg-allow-dim text-allow",
        warn: "border-warn/35 bg-warn-dim text-warn",
        redact: "border-redact/35 bg-redact-dim text-redact",
        block: "border-block/35 bg-block-dim text-block",
        approval: "border-approval/35 bg-approval-dim text-approval",
        outline: "border-line-strong bg-transparent text-ink-3",
      },
      size: {
        xs: "h-4 px-1.5 text-[10px] [&_svg]:size-2.5",
        sm: "h-5 px-1.5 text-[11px] [&_svg]:size-3",
        md: "h-6 px-2 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size, className }))} {...props} />;
}

export { badgeVariants };
