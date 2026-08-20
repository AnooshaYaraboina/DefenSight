"use client";

import * as React from "react";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskGauge } from "./risk-score";
import { CompositionBar } from "@/components/charts/bar-charts";
import { LiveDot } from "./indicators";

/**
 * The dashboard's headline: overall AI security posture.
 *
 * A single hero number rather than a chart, because there is exactly one value
 * and its job is to be read in under a second from across a room. The
 * composition bar beneath it answers the immediate follow-up question — what is
 * the platform actually doing to traffic — without needing a second screen.
 */
export function PostureHero({
  score,
  delta,
  requests,
  decisionMix,
  window,
  className,
}: {
  score: number;
  delta: number | null;
  requests: number;
  decisionMix: Array<{ decision: string; count: number }>;
  window: string;
  className?: string;
}) {
  const verdict =
    score >= 85
      ? { label: "Strong", tone: "text-allow", note: "Controls are holding across the estate." }
      : score >= 70
        ? { label: "Stable", tone: "text-low", note: "Normal operating posture with routine threat activity." }
        : score >= 50
          ? { label: "Degraded", tone: "text-medium", note: "Elevated attack volume is depressing the score." }
          : { label: "At Risk", tone: "text-critical", note: "Sustained attack pressure requires attention." };

  const colorFor = (decision: string) =>
    ({
      ALLOW: "var(--color-viz-allow)",
      WARN: "var(--color-viz-warn)",
      REDACT: "var(--color-viz-redact)",
      REQUIRE_APPROVAL: "var(--color-viz-1)",
      BLOCK: "var(--color-viz-block)",
    })[decision] ?? "var(--color-viz-1)";

  const labelFor = (decision: string) =>
    ({
      ALLOW: "Allowed",
      WARN: "Warned",
      REDACT: "Redacted",
      REQUIRE_APPROVAL: "Held for approval",
      BLOCK: "Blocked",
    })[decision] ?? decision;

  // Fixed order so the bar does not resequence as counts change between windows.
  const ORDER = ["ALLOW", "WARN", "REDACT", "REQUIRE_APPROVAL", "BLOCK"];
  const segments = ORDER.map((d) => ({
    label: labelFor(d),
    value: decisionMix.find((m) => m.decision === d)?.count ?? 0,
    color: colorFor(d),
  }));

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-panel border border-line bg-surface",
        className,
      )}
    >
      {/* Subtle depth: a brand wash behind the score, and the scanning grid motif */}
      <div aria-hidden="true" className="ds-grid-bg pointer-events-none absolute inset-0 opacity-[0.35]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-28 size-72 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)" }}
      />

      <div className="relative grid gap-6 p-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center gap-5">
          <RiskGauge score={score} size={116} invert label="posture" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-brand" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Overall AI Security Score
              </p>
            </div>
            <p className={cn("mt-1 text-xl font-semibold tracking-tight", verdict.tone)}>
              {verdict.label}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-3">{verdict.note}</p>
            {delta !== null && (
              <div className="mt-2 flex items-center gap-1.5">
                {delta >= 0 ? (
                  <TrendingUp className="size-3 text-allow" />
                ) : (
                  <TrendingDown className="size-3 text-critical" />
                )}
                <span
                  className={cn(
                    "font-mono text-[11px] tabular",
                    delta >= 0 ? "text-allow" : "text-critical",
                  )}
                >
                  {delta > 0 ? "+" : ""}
                  {delta} pts
                </span>
                <span className="text-[10px] text-ink-4">vs previous {window}</span>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold tracking-tight text-ink">
                Defensive actions taken
              </p>
              <p className="mt-0.5 text-[11px] text-ink-4">
                Every one of {requests.toLocaleString()} requests in the last {window} passed
                through the full pipeline.
              </p>
            </div>
            <LiveDot label="Live" />
          </div>
          <CompositionBar segments={segments} />
        </div>
      </div>
    </section>
  );
}
