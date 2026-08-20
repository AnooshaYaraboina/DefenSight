"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chart furniture.
 *
 * Every chart in DefenSight is built from these so axes, grids, tooltips and
 * legends behave identically everywhere. Colours come from the validated
 * `--color-viz-*` tokens; nothing here hardcodes a hex.
 */

/* -------------------------------------------------------------------------- */
/* Frame                                                                       */
/* -------------------------------------------------------------------------- */

export function ChartFrame({
  title,
  subtitle,
  legend,
  actions,
  children,
  className,
  height = 200,
}: {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  void height; // consumed by the caller's own container sizing
  return (
    <figure className={cn("flex min-w-0 flex-col", className)}>
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-ink-4">{subtitle}</p>}
        </div>
        {actions}
      </figcaption>
      {legend && <div className="mb-2.5">{legend}</div>}
      <div className="min-w-0 flex-1" style={{ minHeight: height }}>
        {children}
      </div>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Legend — always present for two or more series                             */
/* -------------------------------------------------------------------------- */

export interface LegendItem {
  label: string;
  color: string;
  value?: string | number;
}

export function Legend({
  items,
  className,
}: {
  items: LegendItem[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          <span className="text-[11px] text-ink-3">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-mono text-[11px] tabular text-ink-2">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

export interface TooltipRow {
  label: string;
  value: string | number;
  color?: string;
}

export function ChartTooltip({
  title,
  rows,
  footer,
  x,
  y,
  containerWidth,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: string;
  x: number;
  y: number;
  containerWidth: number;
}) {
  // Flip the tooltip to the other side of the cursor near the right edge so it
  // never spills outside the card.
  const flip = x > containerWidth - 190;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-36 rounded-md border border-line-strong bg-elevated px-2.5 py-2 shadow-xl shadow-black/60"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? containerWidth - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      <p className="mb-1.5 text-[11px] font-medium text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              {r.color && (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-[1px]"
                  style={{ background: r.color }}
                />
              )}
              <span className="text-[11px] text-ink-3">{r.label}</span>
            </span>
            <span className="font-mono text-[11px] font-medium tabular text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] text-ink-4">{footer}</p>}
    </div>
  );
}

/** Tracks the plot area size so charts can be drawn in real pixels. */
export function useChartSize<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}

/* -------------------------------------------------------------------------- */
/* Axes and grid — recessive by design                                        */
/* -------------------------------------------------------------------------- */

export function GridLines({
  ticks,
  width,
  padLeft,
}: {
  /** Y positions, already in pixels. */
  ticks: number[];
  width: number;
  padLeft: number;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <line
          key={t}
          x1={padLeft}
          x2={width}
          y1={t}
          y2={t}
          stroke="var(--color-viz-grid)"
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

export function YAxisLabels({
  values,
  positions,
  padLeft,
}: {
  values: number[];
  positions: number[];
  padLeft: number;
}) {
  return (
    <g aria-hidden="true">
      {values.map((v, i) => (
        <text
          key={`${v}-${i}`}
          x={padLeft - 8}
          y={positions[i]}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-ink-4 font-mono"
          style={{ fontSize: 9 }}
        >
          {v}
        </text>
      ))}
    </g>
  );
}

/** Round a maximum up to a clean axis bound so tick labels read well. */
export function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

export function ticksFor(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Math.round((max / count) * i));
}
