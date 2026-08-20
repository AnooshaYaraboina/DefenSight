"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useChartSize } from "@/components/charts/primitives";

/**
 * The primary canvas.
 *
 * One chart, given real room, instead of four competing for it. Total threat
 * volume as an area, critical severity as a line over it, and a severity band
 * beneath the axis showing composition per bucket — three questions answered in
 * one read without a second chart.
 *
 * A crosshair follows the pointer with a readout pinned to the top-right rather
 * than a floating tooltip: on a dense instrument the number should appear in a
 * fixed place, not chase the cursor.
 */

export interface CanvasPoint {
  label: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  requests: number;
}

const BAND_LEGEND = [
  { label: "Low", color: "var(--color-viz-ord-1)" },
  { label: "Medium", color: "var(--color-viz-ord-2)" },
  { label: "High", color: "var(--color-viz-ord-4)" },
  { label: "Critical", color: "var(--color-viz-ord-5)" },
];

export function ThreatCanvas({
  data,
  className,
  height = 260,
  fill = false,
}: {
  data: CanvasPoint[];
  className?: string;
  height?: number;
  /**
   * Take the height of the container instead of the `height` prop. Used when
   * the chart shares a grid row with a taller neighbour — without it the panel
   * stretches to match and the plot floats in dead space.
   */
  fill?: boolean;
}) {
  const { ref, width, height: measured } = useChartSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);

  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 16;
  const BAND_H = 26;
  const BAND_GAP = 10;
  const AXIS_H = 18;

  const boxH = fill && measured > 0 ? measured : height;
  const plotH = boxH - PAD_T - BAND_H - BAND_GAP - AXIS_H;
  const plotW = Math.max(0, width - PAD_L - PAD_R);

  const rawMax = Math.max(1, ...data.map((d) => d.total));
  const max = niceCeil(rawMax);
  const ticks = [0, max / 2, max];

  const x = (i: number) =>
    PAD_L + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const ready = width > 0 && data.length > 1;

  const totalPath = ready
    ? data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.total)}`).join("")
    : "";
  const criticalPath = ready
    ? data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.critical)}`).join("")
    : "";
  const areaPath = ready
    ? `${totalPath}L${x(data.length - 1)},${PAD_T + plotH}L${x(0)},${PAD_T + plotH}Z`
    : "";

  const point = hover !== null ? data[hover] : null;
  const totals = data.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      critical: acc.critical + d.critical,
    }),
    { total: 0, critical: 0 },
  );

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left - PAD_L) / plotW;
    const index = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, index)));
  }

  const readout = point ?? {
    label: "All buckets",
    total: totals.total,
    critical: totals.critical,
    requests: data.reduce((s, d) => s + d.requests, 0),
  };

  return (
    <div className={cn("relative", fill && "flex h-full flex-col", className)}>
      {/* Readout pinned top-right — fixed position beats a chasing tooltip. */}
      <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-start gap-5">
        <Readout label="Threats" value={readout.total} tone="text-brand" swatch="var(--color-viz-primary)" />
        <Readout label="Critical" value={readout.critical} tone="text-critical" swatch="var(--color-viz-critical)" />
        <div className="min-w-[4.5rem] text-right">
          <p className="ds-eyebrow">{point ? point.label : "Window"}</p>
          <p className="mt-1 font-mono text-[11px] tabular text-ink-3">
            {readout.requests.toLocaleString()} req
          </p>
        </div>
      </div>

      {/*
        The band's ramp is ordinal, so the legend has to name the order — a
        reader cannot infer "lighter means worse" from the marks alone.
      */}
      <div
        ref={ref}
        className={cn("relative", fill && "min-h-0 flex-1")}
        style={fill ? undefined : { height }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        {ready && (
          <svg
            width={width}
            height={boxH}
            role="img"
            aria-label={`Threat activity. ${totals.total} threats, ${totals.critical} critical, across ${data.length} buckets.`}
          >
            <defs>
              <linearGradient id="canvas-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-viz-primary)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--color-viz-primary)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Grid — two lines only. More is noise on a chart this size. */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)}
                  stroke="var(--color-viz-grid)" strokeWidth={1}
                />
                <text
                  x={PAD_L - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                  className="fill-ink-4 font-mono" style={{ fontSize: 9 }}
                >
                  {Math.round(t)}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="url(#canvas-area)" />
            <path
              d={totalPath} fill="none" stroke="var(--color-viz-primary)"
              strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
            />
            <path
              d={criticalPath} fill="none" stroke="var(--color-viz-critical)"
              strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
            />

            {/* Severity composition band — answers "made of what" without a
                second chart competing for the same space. */}
            <g transform={`translate(0, ${PAD_T + plotH + BAND_GAP})`}>
              {data.map((d, i) => {
                const w = plotW / data.length;
                const bx = PAD_L + i * w;
                const sum = d.critical + d.high + d.medium + d.low;
                if (sum === 0) {
                  return (
                    <rect
                      key={i} x={bx + 0.5} y={BAND_H / 2 - 1} width={Math.max(1, w - 1)} height={2}
                      rx={1} fill="var(--color-line)"
                    />
                  );
                }
                const segments = [
                  { v: d.low, c: "var(--color-viz-ord-1)" },
                  { v: d.medium, c: "var(--color-viz-ord-2)" },
                  { v: d.high, c: "var(--color-viz-ord-4)" },
                  { v: d.critical, c: "var(--color-viz-ord-5)" },
                ];
                let offset = 0;
                return (
                  <g key={i} opacity={hover === null || hover === i ? 1 : 0.4} className="transition-opacity">
                    {segments.map((seg, si) => {
                      if (seg.v === 0) return null;
                      const h = (seg.v / sum) * BAND_H;
                      const rect = (
                        <rect
                          key={si} x={bx + 0.5} y={BAND_H - offset - h}
                          width={Math.max(1, w - 1)}
                          height={Math.max(1, h - 1.5)}
                          fill={seg.c}
                        />
                      );
                      offset += h;
                      return rect;
                    })}
                  </g>
                );
              })}
            </g>

            {/* Crosshair */}
            {hover !== null && (
              <g>
                <line
                  x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + plotH + BAND_GAP + BAND_H}
                  stroke="var(--color-viz-axis)" strokeWidth={1} strokeDasharray="2 3"
                />
                <circle cx={x(hover)} cy={y(data[hover].total)} r={3.5}
                  fill="var(--color-viz-primary)" stroke="var(--color-base)" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(data[hover].critical)} r={3.5}
                  fill="var(--color-viz-critical)" stroke="var(--color-base)" strokeWidth={2} />
              </g>
            )}

            {/* Sparse axis labels — first, middle, last. */}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1]
              .filter((i, idx, arr) => arr.indexOf(i) === idx)
              .map((i) => (
                <text
                  key={i} x={x(i)} y={boxH - 4}
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  className="fill-ink-4" style={{ fontSize: 9 }}
                >
                  {data[i]?.label}
                </text>
              ))}
          </svg>
        )}
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-3 pl-9">
        <span className="ds-eyebrow">Composition</span>
        {BAND_LEGEND.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-[9px] text-ink-4">
            <span className="size-1.5 rounded-[1px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Readout({
  label, value, tone, swatch,
}: {
  label: string; value: number; tone: string; swatch: string;
}) {
  return (
    <div className="text-right">
      <p className="ds-eyebrow flex items-center justify-end gap-1.5">
        <span className="size-1.5 rounded-[1px]" style={{ background: swatch }} />
        {label}
      </p>
      <p className={cn("ds-figure mt-1 text-base", tone)}>{value.toLocaleString()}</p>
    </div>
  );
}

/** Round up to a clean axis bound. */
function niceCeil(value: number): number {
  if (value <= 4) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
