"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { severityFromRisk, SEVERITY_META, type Severity } from "@/lib/engine/taxonomy";

function toneFor(severity: Severity) {
  return {
    CRITICAL: { text: "text-critical", ring: "stroke-critical", bg: "bg-critical-dim", border: "border-critical/35" },
    HIGH: { text: "text-high", ring: "stroke-high", bg: "bg-high-dim", border: "border-high/35" },
    MEDIUM: { text: "text-medium", ring: "stroke-medium", bg: "bg-medium-dim", border: "border-medium/35" },
    LOW: { text: "text-low", ring: "stroke-low", bg: "bg-low-dim", border: "border-low/35" },
    INFO: { text: "text-info", ring: "stroke-info", bg: "bg-info-dim", border: "border-info/30" },
  }[severity];
}

/** Compact numeric risk pill for table cells. */
export function RiskPill({
  score,
  className,
  showLabel = false,
}: {
  score: number;
  className?: string;
  showLabel?: boolean;
}) {
  const sev = severityFromRisk(score);
  const tone = toneFor(sev);
  return (
    <Tooltip content={`Risk ${score}/100 — ${SEVERITY_META[sev].label}`}>
      <span
        className={cn(
          "inline-flex h-5 min-w-[2.25rem] items-center justify-center gap-1 rounded border px-1.5 font-mono text-[11px] font-semibold tabular",
          tone.bg,
          tone.border,
          tone.text,
          className,
        )}
      >
        {score}
        {showLabel && (
          <span className="font-sans text-[10px] font-medium">{SEVERITY_META[sev].label}</span>
        )}
      </span>
    </Tooltip>
  );
}

/**
 * Radial gauge for headline scores. `invert` flips the semantics for the
 * Security Score, where 100 is good rather than catastrophic.
 */
export function RiskGauge({
  score,
  size = 96,
  label,
  sublabel,
  invert = false,
  className,
}: {
  score: number;
  size?: number;
  label?: string;
  sublabel?: string;
  /** True when a high score is *good* (security posture rather than risk). */
  invert?: boolean;
  className?: string;
}) {
  const sev = severityFromRisk(invert ? 100 - score : score);
  const tone = toneFor(sev);
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - pct / 100);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-inset"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(tone.ring, "transition-[stroke-dashoffset] duration-700 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn("font-mono font-semibold tabular leading-none", tone.text)}
          style={{ fontSize: size * 0.28 }}
        >
          {Math.round(score)}
        </span>
        {label && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-ink-4">
            {label}
          </span>
        )}
        {sublabel && <span className="text-[9px] text-ink-4">{sublabel}</span>}
      </div>
    </div>
  );
}

/**
 * Horizontal risk track with threshold markers — used on the event detail view
 * so an analyst can see not just the score but where the policy cut-offs sit.
 */
export function RiskTrack({
  score,
  thresholds = [40, 65, 85],
  className,
}: {
  score: number;
  thresholds?: number[];
  className?: string;
}) {
  const sev = severityFromRisk(score);
  const tone = toneFor(sev);
  return (
    <div className={cn("relative", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-inset">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", {
            CRITICAL: "bg-critical",
            HIGH: "bg-high",
            MEDIUM: "bg-medium",
            LOW: "bg-low",
            INFO: "bg-info",
          }[sev])}
          style={{ width: `${score}%` }}
        />
        {thresholds.map((t) => (
          <span
            key={t}
            className="absolute top-0 h-full w-px bg-base/80"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-4">
        <span>0</span>
        <span className={tone.text}>{score}</span>
        <span>100</span>
      </div>
    </div>
  );
}
