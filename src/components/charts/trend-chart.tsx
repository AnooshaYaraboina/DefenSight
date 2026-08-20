"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ChartFrame,
  ChartTooltip,
  GridLines,
  Legend,
  YAxisLabels,
  niceMax,
  ticksFor,
  useChartSize,
} from "./primitives";

export interface TrendPoint {
  label: string;
  total: number;
  critical: number;
}

/**
 * Threat trend over time.
 *
 * Two series on one axis: total threats as a filled area, critical threats as a
 * line on top. Deliberately not stacked by severity — red, orange and yellow are
 * neighbouring hues and no stepping of them clears the colour-vision separation
 * floor, so a "severity rainbow" stack would be unreadable for a meaningful
 * share of analysts. The severity breakdown lives in its own ordinal chart
 * where one hue can carry the ordering properly.
 */
export function TrendChart({
  data,
  title,
  subtitle,
  height = 190,
  className,
}: {
  data: TrendPoint[];
  title: string;
  subtitle?: string;
  height?: number;
  className?: string;
}) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);

  const PAD_LEFT = 30;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 20;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const plotWidth = Math.max(0, width - PAD_LEFT - 6);

  const max = niceMax(Math.max(1, ...data.map((d) => d.total)));
  const tickValues = ticksFor(max, 4);
  const yFor = (v: number) => PAD_TOP + plotHeight - (v / max) * plotHeight;
  const xFor = (i: number) =>
    PAD_LEFT + (data.length <= 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);

  /*
   * All three paths derive from the same geometry, computed inline.
   *
   * They were three separate useMemo calls, each depending on `xFor`/`yFor` —
   * helpers recreated every render, so the dependency lists were inaccurate and
   * the memoisation bought nothing. The React Compiler memoises this
   * automatically and correctly, which a hand-written dependency array on
   * closures cannot.
   */
  const hasGeometry = data.length > 0 && plotWidth > 0;
  const baseline = PAD_TOP + plotHeight;

  const totalLine = hasGeometry
    ? data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.total)}`).join("")
    : "";
  const criticalLine = hasGeometry
    ? data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.critical)}`).join("")
    : "";
  const areaPath = hasGeometry
    ? `${totalLine}L${xFor(data.length - 1)},${baseline}L${xFor(0)},${baseline}Z`
    : "";

  const totals = data.reduce((s, d) => s + d.total, 0);
  const criticals = data.reduce((s, d) => s + d.critical, 0);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (data.length === 0 || plotWidth <= 0) return;
    const ratio = (x - PAD_LEFT) / plotWidth;
    const index = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, index)));
  }

  const point = hover !== null ? data[hover] : null;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      height={height}
      className={className}
      legend={
        <Legend
          items={[
            { label: "Threats detected", color: "var(--color-viz-primary)", value: totals },
            { label: "Critical", color: "var(--color-viz-critical)", value: criticals },
          ]}
        />
      }
    >
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${title}. ${totals} threats, ${criticals} critical.`}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-viz-primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-viz-primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <GridLines ticks={tickValues.map(yFor)} width={width - 6} padLeft={PAD_LEFT} />
            <YAxisLabels values={tickValues} positions={tickValues.map(yFor)} padLeft={PAD_LEFT} />

            <path d={areaPath} fill="url(#trend-fill)" />
            <path d={totalLine} fill="none" stroke="var(--color-viz-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={criticalLine} fill="none" stroke="var(--color-viz-critical)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {hover !== null && (
              <g>
                <line x1={xFor(hover)} x2={xFor(hover)} y1={PAD_TOP} y2={PAD_TOP + plotHeight} stroke="var(--color-viz-axis)" strokeWidth={1} strokeDasharray="3 3" />
                {/* 2px surface ring keeps the marker readable where the two series overlap */}
                <circle cx={xFor(hover)} cy={yFor(data[hover].total)} r={4} fill="var(--color-viz-primary)" stroke="var(--color-surface)" strokeWidth={2} />
                <circle cx={xFor(hover)} cy={yFor(data[hover].critical)} r={4} fill="var(--color-viz-critical)" stroke="var(--color-surface)" strokeWidth={2} />
              </g>
            )}

            {/* Sparse x labels: first, middle, last. A label per point collides. */}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1]
              .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
              .map((i) => (
                <text
                  key={i}
                  x={xFor(i)}
                  y={height - 5}
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  className="fill-ink-4"
                  style={{ fontSize: 9 }}
                >
                  {data[i]?.label}
                </text>
              ))}
          </svg>
        )}

        {point && hover !== null && (
          <ChartTooltip
            title={point.label}
            x={xFor(hover)}
            y={yFor(point.total)}
            containerWidth={width}
            rows={[
              { label: "Threats", value: point.total, color: "var(--color-viz-primary)" },
              { label: "Critical", value: point.critical, color: "var(--color-viz-critical)" },
            ]}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/** Compact inline trend for stat tiles. No axes, no tooltip — it is a texture. */
export function Sparkline({
  values,
  tone = "var(--color-viz-primary)",
  width = 68,
  height = 22,
  className,
}: {
  values: number[];
  tone?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 3) - 1.5;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className={cn("shrink-0", className)} aria-hidden="true">
      <path d={points.join("")} fill="none" stroke={tone} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}
