"use client";

import * as React from "react";
import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskTrack } from "./risk-score";
import { Tooltip } from "@/components/ui/tooltip";
import type { RiskFactor } from "@/lib/engine/types";

/**
 * Explainable risk breakdown (§16).
 *
 * The assessment requires the score to be explainable, which means more than
 * printing a number and a sentence: each factor shows what it measured, how
 * heavily it was weighted, and how many points it actually contributed. The
 * contributions sum to the displayed score, so an analyst can audit the
 * arithmetic rather than take it on trust.
 */
export function RiskBreakdown({
  score,
  confidence,
  rationale,
  factors,
  className,
}: {
  score: number;
  confidence: number;
  rationale: string;
  factors: RiskFactor[];
  className?: string;
}) {
  const increasing = factors.filter((f) => f.direction === "increases");
  const decreasing = factors.filter((f) => f.direction === "decreases");
  const maxContribution = Math.max(1, ...factors.map((f) => Math.abs(f.contribution)));

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular text-ink">{score}</span>
            <span className="text-[11px] text-ink-4">/ 100</span>
          </div>
          <Tooltip content="How much the engine trusts this score. Rises with the number of independent signals that agree.">
            <span className="flex items-center gap-1 text-[10px] text-ink-4">
              <Info className="size-3" />
              {(confidence * 100).toFixed(0)}% scoring confidence
            </span>
          </Tooltip>
        </div>
        <RiskTrack score={score} />
      </div>

      {rationale && (
        <p className="rounded-md border border-line bg-surface-2/50 p-3 text-[11px] leading-relaxed text-ink-2">
          {rationale}
        </p>
      )}

      {factors.length === 0 ? (
        <p className="text-[11px] text-ink-4">
          No elevated risk factors were present on this request.
        </p>
      ) : (
        <div className="space-y-3">
          <FactorGroup
            title="Factors raising risk"
            icon={TrendingUp}
            tone="critical"
            factors={increasing}
            maxContribution={maxContribution}
          />
          {decreasing.length > 0 && (
            <FactorGroup
              title="Mitigating factors"
              icon={TrendingDown}
              tone="allow"
              factors={decreasing}
              maxContribution={maxContribution}
            />
          )}

          <div className="flex items-center justify-between border-t border-line pt-2.5">
            <span className="text-[11px] text-ink-3">Sum of contributions</span>
            <span className="font-mono text-[11px] font-medium tabular text-ink">
              {factors.reduce((s, f) => s + f.contribution, 0).toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function FactorGroup({
  title,
  icon: Icon,
  tone,
  factors,
  maxContribution,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "critical" | "allow";
  factors: RiskFactor[];
  maxContribution: number;
}) {
  if (factors.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
        <Icon className={cn("size-3", tone === "critical" ? "text-critical" : "text-allow")} />
        {title}
      </p>
      <ul className="space-y-2">
        {factors.map((f) => (
          <li key={`${f.key}-${f.direction}`} className="rounded-md border border-line bg-surface-2/40 p-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-medium text-ink-2">{f.label}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[11px] font-semibold tabular",
                  tone === "critical" ? "text-critical" : "text-allow",
                )}
              >
                {f.contribution > 0 ? "+" : ""}
                {f.contribution}
              </span>
            </div>

            <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{f.detail}</p>

            <div className="mt-2 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-inset">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    tone === "critical" ? "bg-critical" : "bg-allow",
                  )}
                  style={{ width: `${(Math.abs(f.contribution) / maxContribution) * 100}%` }}
                />
              </span>
              <Tooltip content={`Signal strength ${(f.value * 100).toFixed(0)}% × weight ${f.weight}`}>
                <span className="shrink-0 font-mono text-[9px] text-ink-4">
                  {(f.value * 100).toFixed(0)}% × w{f.weight}
                </span>
              </Tooltip>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inline single-line version for tables and cards. */
export function RiskFactorSummary({ factors }: { factors: RiskFactor[] }) {
  const top = factors.filter((f) => f.direction === "increases").slice(0, 3);
  if (top.length === 0) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-ink-4">
        <Minus className="size-3" />
        No elevated factors
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {top.map((f) => (
        <Tooltip key={f.key} content={f.detail}>
          <span className="rounded border border-line-strong bg-surface-2 px-1.5 py-px text-[10px] text-ink-2">
            {f.label}
            <span className="ml-1 font-mono text-critical">+{f.contribution}</span>
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
