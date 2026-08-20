"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChartFrame, ChartTooltip, Legend, useChartSize } from "./primitives";

/**
 * Horizontal bar family.
 *
 * Horizontal rather than vertical because every category here has a real name —
 * "Indirect Prompt Injection", "Warehouse Query" — and rotated x-axis labels are
 * the most common way a dashboard becomes unreadable. Horizontal bars let the
 * label sit inline at full size.
 */

export interface BarDatum {
  label: string;
  value: number;
  /** Optional override; defaults to the sequential magnitude ramp. */
  color?: string;
  /** Secondary text shown to the right of the value. */
  meta?: string;
  href?: string;
}

export function BarList({
  data,
  title,
  subtitle,
  valueLabel = "count",
  color = "var(--color-viz-primary)",
  maxRows = 8,
  className,
  height,
  onSelect,
}: {
  data: BarDatum[];
  title: string;
  subtitle?: string;
  valueLabel?: string;
  color?: string;
  maxRows?: number;
  className?: string;
  height?: number;
  onSelect?: (datum: BarDatum) => void;
}) {
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map((d) => d.value));

  return (
    <ChartFrame title={title} subtitle={subtitle} className={className} height={height ?? rows.length * 30}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[11px] text-ink-4">No activity in this window.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((d) => {
            const pct = (d.value / max) * 100;
            const interactive = Boolean(onSelect || d.href);
            return (
              <li key={d.label}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onSelect?.(d)}
                  className={cn(
                    "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-1 py-1 text-left transition-colors",
                    interactive && "hover:bg-surface-2 cursor-pointer",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] text-ink-2">{d.label}</span>
                      {d.meta && (
                        <span className="shrink-0 font-mono text-[10px] text-ink-4">{d.meta}</span>
                      )}
                    </span>
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-inset">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${Math.max(2, pct)}%`, background: d.color ?? color }}
                      />
                    </span>
                  </span>
                  <span
                    className="w-10 shrink-0 text-right font-mono text-xs font-medium tabular text-ink"
                    aria-label={`${d.value} ${valueLabel}`}
                  >
                    {d.value}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Ordinal distribution — one hue, monotone lightness                          */
/* -------------------------------------------------------------------------- */

const ORDINAL_RAMP = [
  "var(--color-viz-ord-1)",
  "var(--color-viz-ord-2)",
  "var(--color-viz-ord-3)",
  "var(--color-viz-ord-4)",
  "var(--color-viz-ord-5)",
];

export function OrdinalDistribution({
  data,
  title,
  subtitle,
  className,
  height = 150,
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  title: string;
  subtitle?: string;
  className?: string;
  height?: number;
}) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  const GAP = 2;
  const barWidth = data.length > 0 ? (width - GAP * (data.length - 1)) / data.length : 0;
  const PAD_BOTTOM = 26;
  const plotHeight = height - PAD_BOTTOM;

  return (
    <ChartFrame title={title} subtitle={subtitle} className={className} height={height}>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${title}. ${total} events across ${data.length} bands.`}>
            {data.map((d, i) => {
              const h = Math.max(2, (d.value / max) * (plotHeight - 6));
              const x = i * (barWidth + GAP);
              const y = plotHeight - h;
              return (
                <g key={d.label} onMouseEnter={() => setHover(i)}>
                  <rect x={x} y={0} width={barWidth} height={plotHeight} fill="transparent" />
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    rx={4}
                    fill={ORDINAL_RAMP[Math.min(i, ORDINAL_RAMP.length - 1)]}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    className="transition-opacity"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={plotHeight + 12}
                    textAnchor="middle"
                    className="fill-ink-4 font-mono"
                    style={{ fontSize: 9 }}
                  >
                    {d.label}
                  </text>
                  {d.sublabel && (
                    <text
                      x={x + barWidth / 2}
                      y={plotHeight + 22}
                      textAnchor="middle"
                      className="fill-ink-4"
                      style={{ fontSize: 8 }}
                    >
                      {d.sublabel}
                    </text>
                  )}
                  {/* Direct label on the bar: identity is never colour alone. */}
                  {d.value > 0 && h > 16 && (
                    <text
                      x={x + barWidth / 2}
                      y={y + 12}
                      textAnchor="middle"
                      className="fill-white font-mono font-semibold"
                      style={{ fontSize: 10 }}
                    >
                      {d.value}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && data[hover] && (
          <ChartTooltip
            title={data[hover].sublabel ?? data[hover].label}
            x={hover * (barWidth + GAP) + barWidth / 2}
            y={24}
            containerWidth={width}
            rows={[
              { label: "Events", value: data[hover].value },
              { label: "Share", value: `${((data[hover].value / (total || 1)) * 100).toFixed(1)}%` },
            ]}
            footer={`Risk band ${data[hover].label}`}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Composition bar — one row, several states                                   */
/* -------------------------------------------------------------------------- */

export interface CompositionSegment {
  label: string;
  value: number;
  color: string;
}

export function CompositionBar({
  segments,
  title,
  subtitle,
  className,
  showLegend = true,
}: {
  segments: CompositionSegment[];
  title?: string;
  subtitle?: string;
  className?: string;
  showLegend?: boolean;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const visible = segments.filter((s) => s.value > 0);

  const bar = (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-inset">
      {visible.map((s) => (
        <div
          key={s.label}
          className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500"
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  );

  if (!title) {
    return (
      <div className={className}>
        {bar}
        {showLegend && (
          <Legend
            className="mt-2"
            items={visible.map((s) => ({
              label: s.label,
              color: s.color,
              value: `${((s.value / total) * 100).toFixed(0)}%`,
            }))}
          />
        )}
      </div>
    );
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} className={className} height={0}>
      {bar}
      {showLegend && (
        <Legend
          className="mt-2.5"
          items={visible.map((s) => ({
            label: s.label,
            color: s.color,
            value: s.value,
          }))}
        />
      )}
    </ChartFrame>
  );
}
