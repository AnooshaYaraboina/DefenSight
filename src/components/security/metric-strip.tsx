import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/format";
import { Tooltip } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/charts/trend-chart";

/**
 * The page instrument bar.
 *
 * Every console screen used to open with a row of four boxed metric tiles —
 * four separate surfaces, four borders, four shadows, saying four numbers. It
 * read as a template, and it cost three hundred pixels before any of the actual
 * work appeared.
 *
 * This is the same information as one instrument: a single panel, cells split
 * by a hairline. It is the dashboard's command strip generalised, so a reader
 * moving between screens meets the same grammar every time — eyebrow, figure,
 * supporting line — and the space below belongs to the page's real content.
 *
 * The delta is coloured by whether the change is *good*, never by its sign.
 * More blocked attacks is not a regression, and a strip that reds-out on a
 * rising block count teaches analysts to stop reading the colour.
 */

export interface Metric {
  label: string;
  value: number | string;
  /** Percentage change against the previous window. */
  delta?: number | null;
  polarity?: "higher-is-worse" | "higher-is-better" | "neutral";
  /** Supporting line under the figure. Replaces the delta when both are absent. */
  note?: string;
  /** Explanation on hover. */
  hint?: string;
  href?: string;
  spark?: number[];
  /** Colour the figure — for values that carry a verdict, not just a count. */
  tone?: string;
}

export function MetricStrip({
  metrics,
  className,
}: {
  metrics: Metric[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "ds-panel ds-rise grid grid-cols-2 divide-line",
        "sm:divide-x",
        metrics.length >= 6
          ? "sm:grid-cols-3 xl:grid-cols-6"
          : metrics.length === 5
            ? "sm:grid-cols-3 lg:grid-cols-5"
            : metrics.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-4",
        className,
      )}
    >
      {metrics.map((m, i) => (
        <Cell key={m.label} metric={m} index={i} count={metrics.length} />
      ))}
    </section>
  );
}

function Cell({ metric: m, index, count }: { metric: Metric; index: number; count: number }) {
  const { delta, polarity = "neutral" } = m;

  const improving =
    delta === null || delta === undefined || delta === 0 || polarity === "neutral"
      ? null
      : polarity === "higher-is-worse"
        ? delta < 0
        : delta > 0;

  const DeltaIcon =
    delta === null || delta === undefined || delta === 0
      ? Minus
      : delta > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const body = (
    <>
      <p className="ds-eyebrow truncate">{m.label}</p>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className={cn("ds-figure text-xl", m.tone ?? "text-ink")}>
          {typeof m.value === "number" ? formatNumber(m.value) : m.value}
        </span>
        {m.spark && m.spark.length > 1 && (
          <Sparkline
            values={m.spark}
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

      {delta !== null && delta !== undefined ? (
        <p className="mt-1.5 flex items-center gap-1">
          <DeltaIcon
            className={cn(
              "size-3 shrink-0",
              improving === null ? "text-ink-4" : improving ? "text-allow" : "text-critical",
            )}
          />
          <span
            className={cn(
              "font-mono text-[10px] tabular",
              improving === null ? "text-ink-4" : improving ? "text-allow" : "text-critical",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
          <span className="truncate text-[10px] text-ink-4">vs previous</span>
        </p>
      ) : m.note ? (
        <p className="mt-1.5 truncate text-[10px] text-ink-4">{m.note}</p>
      ) : null}
    </>
  );

  /*
   * The cell borders come from the parent's divide-x, but a wrapped row on a
   * narrow screen needs its own top rule or the second row floats.
   */
  const shell = cn(
    "group relative min-w-0 px-4 py-3.5",
    index % 2 === 1 && "border-l border-line sm:border-l-0",
    index >= 2 && "border-t border-line sm:border-t-0",
    count >= 5 && index >= 3 && "sm:border-t sm:border-line lg:border-t-0",
    m.href && "transition-colors hover:bg-surface-2",
  );

  const content = m.href ? (
    <Link href={m.href} className={cn(shell, "block")}>
      {body}
      <ArrowUpRight className="absolute right-3 top-3 size-3 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );

  return m.hint ? <Tooltip content={m.hint}>{content}</Tooltip> : content;
}
