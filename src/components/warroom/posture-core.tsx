"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Posture, as one number.
 *
 * A large ring is the right instrument here for the reason a fuel gauge is:
 * the exact value matters less than where it sits on the arc, and that reads
 * from across a room.
 */

export function PostureCore({
  score,
  delta,
  verdict,
  pulse,
  className,
}: {
  score: number;
  delta: number | null;
  verdict: string;
  pulse: number[];
  className?: string;
}) {
  const tone =
    score >= 85 ? "text-allow" : score >= 70 ? "text-brand" : score >= 50 ? "text-medium" : "text-critical";
  const ring =
    score >= 85 ? "stroke-allow" : score >= 70 ? "stroke-brand" : score >= 50 ? "stroke-medium" : "stroke-critical";

  const SIZE = 148;
  const STROKE = 6;
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <section
      className={cn("ds-panel relative flex flex-col items-center justify-center p-5", className)}
      aria-label="Security posture"
    >
      <p className="ds-eyebrow absolute left-4 top-4">Posture</p>

      <div className="relative">
        <svg width={SIZE} height={SIZE} className="-rotate-90" role="img" aria-label={`${score} out of 100`}>
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r}
            fill="none" stroke="var(--color-inset)" strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r}
            fill="none" strokeWidth={STROKE} strokeLinecap="round"
            className={cn(ring, "transition-[stroke-dashoffset] duration-1000")}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - score / 100),
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("ds-figure text-[2.6rem]", tone)}>{score}</span>
          <span className="mt-1 text-[10px] text-ink-4">/ 100</span>
        </div>
      </div>

      <p className={cn("mt-3 text-sm font-semibold tracking-tight", tone)}>{verdict}</p>
      {delta !== null && (
        <p className="mt-0.5 font-mono text-[11px] tabular text-ink-3">
          {delta > 0 ? "+" : ""}
          {delta} vs last week
        </p>
      )}

      <Pulse values={pulse} className="mt-5" />
      <p className="ds-eyebrow mt-1.5">Throughput · 24h</p>
    </section>
  );
}

/** Bar heartbeat rather than a line — it reads as activity, not as a trend. */
function Pulse({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-8 items-end gap-[2px]", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px] bg-brand transition-[height] duration-500"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: 0.35 + (i / values.length) * 0.65 }}
        />
      ))}
    </div>
  );
}
