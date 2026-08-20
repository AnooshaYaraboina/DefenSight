"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDot } from "./indicators";

/**
 * The dashboard's single focal point.
 *
 * One number, stated large, with the one sentence that explains it. Everything
 * else on the page is subordinate — a dashboard with several competing focal
 * points has none, which was the previous version's failing.
 *
 * The composition bar beneath answers the immediate follow-up ("what is the
 * platform actually doing to traffic?") without requiring a second screen.
 */

const VERDICTS = [
  { min: 85, label: "Strong", tone: "allow", note: "Controls are holding across the estate." },
  // Brand cyan rather than informational blue: a score in the seventies and
  // eighties is a healthy estate under routine attack, and should read that way.
  { min: 70, label: "Stable", tone: "brand", note: "Normal posture with routine threat activity." },
  { min: 50, label: "Degraded", tone: "medium", note: "Elevated attack volume is depressing the score." },
  { min: 0, label: "At Risk", tone: "critical", note: "Sustained pressure requires attention." },
] as const;

const DECISION_ORDER = ["ALLOW", "WARN", "REDACT", "REQUIRE_APPROVAL", "BLOCK"] as const;

const DECISION_META: Record<string, { label: string; color: string }> = {
  ALLOW: { label: "Allowed", color: "var(--color-viz-allow)" },
  WARN: { label: "Warned", color: "var(--color-viz-warn)" },
  REDACT: { label: "Redacted", color: "var(--color-viz-redact)" },
  REQUIRE_APPROVAL: { label: "Held", color: "var(--color-viz-1)" },
  BLOCK: { label: "Blocked", color: "var(--color-viz-block)" },
};

export function PostureHero({
  score,
  delta,
  requests,
  decisionMix,
  window,
  trend,
  className,
}: {
  score: number;
  delta: number | null;
  requests: number;
  decisionMix: Array<{ decision: string; count: number }>;
  window: string;
  /** Daily posture scores, oldest first, for the inline trend. */
  trend?: number[];
  className?: string;
}) {
  const verdict = VERDICTS.find((v) => score >= v.min) ?? VERDICTS[VERDICTS.length - 1];
  const toneText = {
    allow: "text-allow", brand: "text-brand", medium: "text-medium", critical: "text-critical",
  }[verdict.tone];
  const toneStroke = {
    allow: "stroke-allow", brand: "stroke-brand", medium: "stroke-medium", critical: "stroke-critical",
  }[verdict.tone];

  const segments = DECISION_ORDER.map((d) => ({
    key: d,
    label: DECISION_META[d].label,
    color: DECISION_META[d].color,
    value: decisionMix.find((m) => m.decision === d)?.count ?? 0,
  })).filter((s) => s.value > 0);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;

  // Radial gauge geometry.
  const SIZE = 152;
  const STROKE = 9;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[0.875rem] border border-line bg-surface",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 size-96 opacity-[0.13] blur-[80px]"
        style={{ background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)" }}
      />

      <div className="relative grid gap-8 p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-12 lg:p-8">
        {/* ---------------------------------------------------- the number */}
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={radius}
                fill="none" strokeWidth={STROKE} className="stroke-inset"
              />
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={radius}
                fill="none" strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset}
                className={cn(toneStroke, "transition-[stroke-dashoffset] duration-1000 ease-out")}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("font-mono text-[2.75rem] font-semibold leading-none tabular", toneText)}>
                {Math.round(score)}
              </span>
              <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-4">
                out of 100
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              <ShieldCheck className="size-3 text-brand" />
              AI Security Score
            </p>
            <p className={cn("mt-2 text-2xl font-semibold tracking-tight", toneText)}>
              {verdict.label}
            </p>
            <p className="mt-1.5 max-w-[15rem] text-xs leading-relaxed text-ink-3">
              {verdict.note}
            </p>

            {delta !== null && (
              <div className="mt-3 flex items-center gap-1.5">
                {delta >= 0 ? (
                  <TrendingUp className="size-3.5 text-allow" />
                ) : (
                  <TrendingDown className="size-3.5 text-critical" />
                )}
                <span className={cn("font-mono text-xs tabular", delta >= 0 ? "text-allow" : "text-critical")}>
                  {delta > 0 ? "+" : ""}{delta}
                </span>
                <span className="text-[11px] text-ink-4">vs previous {window}</span>
              </div>
            )}

            {trend && trend.length > 2 && <PostureTrend values={trend} />}
          </div>
        </div>

        {/* ------------------------------------------------ what we did */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Defensive actions taken
              </h2>
              <p className="mt-1 text-xs text-ink-3">
                Every one of{" "}
                <span className="font-mono tabular text-ink-2">{requests.toLocaleString()}</span>{" "}
                requests passed through the full pipeline.
              </p>
            </div>
            <LiveDot label="Live" />
          </div>

          <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-inset">
            {segments.map((s) => (
              <div
                key={s.key}
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                title={`${s.label}: ${s.value}`}
              />
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {segments.map((s) => (
              <div key={s.key}>
                <dt className="flex items-center gap-1.5 text-[11px] text-ink-4">
                  <span className="size-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular text-ink">
                  {s.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>

          <Link
            href="/monitor"
            className="mt-5 inline-flex items-center gap-1.5 text-xs text-brand transition-colors hover:text-brand/80"
          >
            Inspect the event stream
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Inline posture trend. Deliberately unlabelled — it is texture, not a chart. */
function PostureTrend({ values }: { values: number[] }) {
  const width = 120;
  const height = 26;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");

  return (
    <svg width={width} height={height} className="mt-3" aria-hidden="true">
      <path
        d={`${path}L${width},${height}L0,${height}Z`}
        fill="var(--color-brand)"
        opacity={0.08}
      />
      <path
        d={path}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />
    </svg>
  );
}
