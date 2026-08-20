"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The command strip.
 *
 * A single instrument bar rather than a hero card. It carries the four things
 * a security lead checks first — posture, threat level, throughput, and what is
 * being done about it — in one horizontal read, so the vertical space below
 * belongs entirely to the work.
 *
 * The previous hero occupied a third of the viewport to say one number. Density
 * here is deliberate: this is instrumentation, and instrumentation earns its
 * space by being scannable, not by being large.
 */

export type ThreatLevel = "LOW" | "GUARDED" | "ELEVATED" | "SEVERE";

const THREAT_LEVELS: Record<
  ThreatLevel,
  { label: string; tone: string; bar: string; note: string }
> = {
  LOW: { label: "Low", tone: "text-allow", bar: "bg-allow", note: "Routine background activity." },
  GUARDED: { label: "Guarded", tone: "text-brand", bar: "bg-brand", note: "Normal attack pressure, all controls holding." },
  ELEVATED: { label: "Elevated", tone: "text-medium", bar: "bg-medium", note: "Sustained attack volume above baseline." },
  SEVERE: { label: "Severe", tone: "text-critical", bar: "bg-critical", note: "Active critical incidents require attention." },
};

export interface CommandStripProps {
  score: number;
  scoreDelta: number | null;
  threatLevel: ThreatLevel;
  requests: number;
  blocked: number;
  criticalIncidents: number;
  window: string;
  /** Throughput per bucket, oldest first. */
  pulse: number[];
  className?: string;
}

export function CommandStrip({
  score,
  scoreDelta,
  threatLevel,
  requests,
  blocked,
  criticalIncidents,
  window,
  pulse,
  className,
}: CommandStripProps) {
  const level = THREAT_LEVELS[threatLevel];
  const blockRate = requests > 0 ? (blocked / requests) * 100 : 0;

  const scoreTone =
    score >= 85 ? "text-allow" : score >= 70 ? "text-brand" : score >= 50 ? "text-medium" : "text-critical";
  const scoreRing =
    score >= 85 ? "stroke-allow" : score >= 70 ? "stroke-brand" : score >= 50 ? "stroke-medium" : "stroke-critical";

  const SIZE = 60;
  const STROKE = 4;
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <section
      className={cn(
        "ds-panel grid divide-y divide-line lg:grid-cols-[auto_1fr_auto] lg:divide-x lg:divide-y-0",
        className,
      )}
    >
      {/* ---------------------------------------------------------- posture */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="relative shrink-0">
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" strokeWidth={STROKE} className="stroke-inset" />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none"
              strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)}
              className={cn(scoreRing, "transition-[stroke-dashoffset] duration-700 ease-out")}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className={cn("ds-figure text-lg", scoreTone)}>{Math.round(score)}</span>
          </span>
        </div>

        <div className="min-w-0">
          <p className="ds-eyebrow flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-brand" />
            Security score
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-sm font-medium text-ink">
              {score >= 85 ? "Strong" : score >= 70 ? "Stable" : score >= 50 ? "Degraded" : "At risk"}
            </span>
            {scoreDelta !== null && scoreDelta !== 0 && (
              <span
                className={cn(
                  "font-mono text-[11px] tabular",
                  scoreDelta > 0 ? "text-allow" : "text-critical",
                )}
              >
                {scoreDelta > 0 ? "+" : ""}
                {scoreDelta}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ----------------------------------------------------- threat + flow */}
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Cell label="Threat level">
          <span className="flex items-center gap-2">
            <span className="flex items-end gap-[3px]" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => {
                const lit = { LOW: 1, GUARDED: 2, ELEVATED: 3, SEVERE: 4 }[threatLevel];
                return (
                  <span
                    key={i}
                    className={cn(
                      "w-[3px] rounded-[1px] transition-colors",
                      i < lit ? level.bar : "bg-line-strong",
                    )}
                    style={{ height: `${7 + i * 3}px` }}
                  />
                );
              })}
            </span>
            <span className={cn("text-sm font-medium", level.tone)}>{level.label}</span>
          </span>
          <p className="mt-1 truncate text-[11px] text-ink-4">{level.note}</p>
        </Cell>

        <Cell label={`Analysed · ${window}`}>
          <span className="flex items-baseline gap-2">
            <span className="ds-figure text-lg text-ink">{requests.toLocaleString()}</span>
            <Pulse values={pulse} />
          </span>
          <p className="mt-1 text-[11px] text-ink-4">
            <span className="text-ink-3">{blocked}</span> blocked · {blockRate.toFixed(1)}% of traffic
          </p>
        </Cell>

        <Cell label="Critical incidents">
          <span className="flex items-baseline gap-2">
            <span
              className={cn("ds-figure text-lg", criticalIncidents > 0 ? "text-critical" : "text-ink")}
            >
              {criticalIncidents}
            </span>
            {criticalIncidents > 0 && (
              <span className="ds-live-dot size-1.5 rounded-full bg-critical text-critical/40" />
            )}
          </span>
          <Link
            href="/incidents"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-4 transition-colors hover:text-brand"
          >
            {criticalIncidents > 0 ? "Open the queue" : "Nothing open"}
            <ArrowUpRight className="size-2.5" />
          </Link>
        </Cell>
      </div>

      {/* ------------------------------------------------------------- live */}
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="ds-live-dot size-1.5 shrink-0 rounded-full bg-allow text-allow/40" />
        <div className="min-w-0">
          <p className="ds-eyebrow">Pipeline</p>
          <p className="mt-1 whitespace-nowrap text-sm font-medium text-allow">Operational</p>
        </div>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="ds-eyebrow truncate">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Throughput sparkline. Texture, not a chart — deliberately unlabelled. */
function Pulse({ values }: { values: number[] }) {
  if (values.length < 3) return null;
  const width = 52;
  const height = 16;
  const max = Math.max(...values, 1);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - (v / max) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <path d={points} fill="none" stroke="var(--color-brand)" strokeWidth={1.25} opacity={0.55} strokeLinejoin="round" />
    </svg>
  );
}
