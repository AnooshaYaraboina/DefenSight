import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Meter used for risk scores, security scores and threshold displays.
 * `tone` drives the fill colour so the same component reads correctly whether
 * high is good (security score) or bad (risk score).
 */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  className,
  trackClassName,
  "aria-label": ariaLabel,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "critical" | "high" | "medium" | "low" | "allow" | "info";
  className?: string;
  trackClassName?: string;
  "aria-label"?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = {
    brand: "bg-brand",
    critical: "bg-critical",
    high: "bg-high",
    medium: "bg-medium",
    low: "bg-low",
    allow: "bg-allow",
    info: "bg-info",
  }[tone];

  return (
    <div
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-inset", trackClassName, className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
