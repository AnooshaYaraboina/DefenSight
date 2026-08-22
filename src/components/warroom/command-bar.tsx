"use client";

import * as React from "react";
import { Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";
import type { ThreatLevel } from "@/lib/queries/warroom";
import type { ConnectionState } from "@/lib/hooks/use-live-events";

/**
 * One strip carrying everything the wall used to spend two full regions on.
 *
 * The posture score had a 236px column to itself and the vitals had a row —
 * between them, roughly a third of the screen for six numbers that never
 * change while you watch them. Standing figures belong on one line; the space
 * belongs to the traffic, which does change.
 *
 * The score keeps its ring because a number read from across a room needs a
 * shape, but at 44px rather than 200.
 */

const THREAT_TONE: Record<ThreatLevel, string> = {
  SEVERE: "text-critical",
  ELEVATED: "text-high",
  GUARDED: "text-medium",
  LOW: "text-allow",
};

function Ring({ score }: { score: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const tone =
    score >= 85 ? "var(--color-allow)" : score >= 70 ? "var(--color-brand)" : "var(--color-high)";

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink font-mono text-[13px] font-semibold"
      >
        {score}
      </text>
    </svg>
  );
}

/** Throughput over the trailing day. Decoration only when it is flat. */
function Pulse({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 96;
  const h = 22;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--color-brand)" opacity="0.10" />
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth="1.25" />
    </svg>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col justify-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">{label}</span>
      <span className={cn("font-mono text-[17px] font-semibold leading-tight tabular", tone ?? "text-ink")}>
        {value}
      </span>
    </div>
  );
}

export function CommandBar({
  org,
  posture,
  threatLevel,
  vitals,
  connection,
  onBurst,
  className,
}: {
  org: string;
  posture: { score: number; delta: number | null; verdict: string; pulse: number[] };
  threatLevel: ThreatLevel;
  vitals: { analysed: number; blocked: number; critical: number; blockRate: number };
  connection: ConnectionState;
  onBurst: () => void;
  className?: string;
}) {
  const [clock, setClock] = React.useState<string>("");

  React.useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-5 border-b border-line bg-surface/70 px-4 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Logo size={26} />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold tracking-tight text-ink">DefenSight</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">{org}</p>
        </div>
      </div>

      <span className="h-8 w-px bg-line" />

      {/* posture */}
      <div className="flex items-center gap-2.5">
        <Ring score={posture.score} />
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">Posture</p>
          <p className="text-[13px] font-medium text-ink">{posture.verdict}</p>
          {posture.delta !== null && (
            <p
              className={cn(
                "font-mono text-[9px] tabular",
                posture.delta > 0 ? "text-allow" : posture.delta < 0 ? "text-high" : "text-ink-4",
              )}
            >
              {posture.delta > 0 ? "+" : ""}
              {posture.delta} vs last week
            </p>
          )}
        </div>
      </div>

      <span className="h-8 w-px bg-line" />

      <div className="flex items-center gap-6">
        <Figure label="Analysed · 7d" value={vitals.analysed.toLocaleString()} />
        <Figure label="Blocked" value={String(vitals.blocked)} tone="text-critical" />
        <Figure label="Block rate" value={`${vitals.blockRate.toFixed(1)}%`} />
        <Figure label="Critical" value={String(vitals.critical)} tone="text-critical" />
      </div>

      <Pulse values={posture.pulse} />

      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connection === "live"
                ? "ds-live-dot bg-allow"
                : connection === "connecting" || connection === "reconnecting"
                  ? "bg-medium"
                  : "bg-ink-4",
            )}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">
            {connection}
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          <Activity className={cn("size-3.5", THREAT_TONE[threatLevel])} />
          <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.1em]", THREAT_TONE[threatLevel])}>
            {threatLevel}
          </span>
        </span>

        <button
          type="button"
          onClick={onBurst}
          className="flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-brand/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <Zap className="size-3" />
          Burst
        </button>

        <span className="w-[68px] text-right font-mono text-[11px] tabular text-ink-3">{clock}</span>
      </div>
    </header>
  );
}
