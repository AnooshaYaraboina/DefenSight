"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/format";
import { Tooltip } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/charts/trend-chart";

/**
 * Dashboard metric tile.
 *
 * The number is the point, so it gets the visual weight; everything else is
 * supporting. The delta is coloured by whether the change is *good*, not by its
 * sign — more blocked attacks is not a regression, and a tile that reds-out on
 * a rising block count trains analysts to ignore the colour.
 */
export function StatTile({
  label,
  value,
  delta,
  polarity = "neutral",
  hint,
  href,
  spark,
  emphasis = false,
  className,
}: {
  label: string;
  value: number;
  delta?: number | null;
  polarity?: "higher-is-worse" | "higher-is-better" | "neutral";
  hint?: string;
  href?: string;
  spark?: number[];
  emphasis?: boolean;
  className?: string;
}) {
  const improving =
    delta === null || delta === undefined || delta === 0 || polarity === "neutral"
      ? null
      : polarity === "higher-is-worse"
        ? delta < 0
        : delta > 0;

  const DeltaIcon = delta === null || delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium leading-tight text-ink-3">{label}</p>
        {href && (
          <ArrowRight className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cn(
            "font-mono font-semibold leading-none tabular text-ink",
            emphasis ? "text-3xl" : "text-2xl",
          )}
        >
          {formatNumber(value)}
        </span>
        {spark && spark.length > 1 && (
          <Sparkline
            values={spark}
            tone={
              improving === false
                ? "var(--color-viz-critical)"
                : improving === true
                  ? "var(--color-viz-allow)"
                  : "var(--color-viz-primary)"
            }
          />
        )}
      </div>

      {delta !== null && delta !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          <DeltaIcon
            className={cn(
              "size-3",
              improving === null ? "text-ink-4" : improving ? "text-allow" : "text-critical",
            )}
          />
          <span
            className={cn(
              "font-mono text-[11px] tabular",
              improving === null ? "text-ink-4" : improving ? "text-allow" : "text-critical",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
          <span className="text-[10px] text-ink-4">vs previous</span>
        </div>
      )}
    </>
  );

  const shell = cn(
    "group relative flex flex-col overflow-hidden rounded-[0.625rem] border border-line bg-surface px-4 py-3.5 transition-colors",
    href && "hover:border-line-strong hover:bg-surface-2",
    className,
  );

  const content = href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );

  return hint ? <Tooltip content={hint}>{content}</Tooltip> : content;
}
