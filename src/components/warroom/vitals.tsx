import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/format";

/**
 * Four numbers.
 *
 * The constraint is the design. Nine metrics is what the previous dashboard
 * had, and nine numbers side by side rank themselves — the reader has to work
 * out which matters. Four do not need ranking.
 */

export function Vitals({
  analysed,
  blocked,
  critical,
  blockRate,
  className,
}: {
  analysed: number;
  blocked: number;
  critical: number;
  blockRate: number;
  className?: string;
}) {
  const cells = [
    { label: "Analysed · 7d", value: formatNumber(analysed), tone: "text-ink" },
    { label: "Blocked", value: formatNumber(blocked), tone: "text-critical" },
    { label: "Critical incidents", value: String(critical), tone: critical > 0 ? "text-critical" : "text-allow" },
    { label: "Block rate", value: `${blockRate.toFixed(1)}%`, tone: "text-ink" },
  ];

  return (
    <section className={cn("ds-panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x", className)}>
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={cn(
            "px-5 py-4",
            i % 2 === 1 && "border-l border-line sm:border-l-0",
            i >= 2 && "border-t border-line sm:border-t-0",
          )}
        >
          <p className="ds-eyebrow">{c.label}</p>
          <p className={cn("ds-figure mt-2 text-3xl", c.tone)}>{c.value}</p>
        </div>
      ))}
    </section>
  );
}
