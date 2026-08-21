"use client";

import * as React from "react";
import { Activity, Radio, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";
import type { ThreatLevel } from "@/lib/queries/warroom";
import type { ConnectionState } from "@/lib/hooks/use-live-events";

/**
 * The rail.
 *
 * Threat level lives here rather than taking one of the wall's five slots. It
 * is a single word plus four bars — the least space any honest rendering of it
 * could take, and it is the first thing anyone walking up to the wall reads.
 */

const LEVELS: Record<ThreatLevel, { label: string; tone: string; bar: string; lit: number }> = {
  LOW: { label: "Low", tone: "text-allow", bar: "bg-allow", lit: 1 },
  GUARDED: { label: "Guarded", tone: "text-accent", bar: "bg-accent", lit: 2 },
  ELEVATED: { label: "Elevated", tone: "text-medium", bar: "bg-medium", lit: 3 },
  SEVERE: { label: "Severe", tone: "text-critical", bar: "bg-critical", lit: 4 },
};

export function StatusRail({
  org,
  threatLevel,
  connection,
  onBurst,
  className,
}: {
  org: string;
  threatLevel: ThreatLevel;
  connection: ConnectionState;
  onBurst: () => void;
  className?: string;
}) {
  const level = LEVELS[threatLevel];
  const live = connection === "live";

  // Rendered after mount only. A server-rendered clock is wrong the instant it
  // reaches the browser, and hydration would flag the mismatch.
  const [clock, setClock] = React.useState<string | null>(null);
  React.useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface/60 px-4 backdrop-blur",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Logo size={16} />
        <span className="text-[13px] font-semibold tracking-tight text-ink">DefenSight</span>
      </span>

      <span className="hidden h-4 w-px bg-line sm:block" />

      <span className="hidden text-[11px] text-ink-3 sm:block">{org}</span>

      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
          live
            ? "border-accent/30 bg-accent-dim/40 text-accent"
            : "border-line-strong bg-surface-2 text-ink-4",
        )}
      >
        {live ? (
          <>
            <span className="ds-live-dot size-1.5 rounded-full bg-accent" />
            <Radio className="size-3" />
            LIVE
          </>
        ) : (
          <>
            <WifiOff className="size-3" />
            {connection === "connecting" ? "CONNECTING" : "OFFLINE"}
          </>
        )}
      </span>

      {/* ------------------------------------------------------ threat level */}
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="ds-eyebrow hidden md:inline">Threat level</span>
          <span className="flex items-end gap-[3px]" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] rounded-[1px] transition-colors",
                  i < level.lit ? level.bar : "bg-line-strong",
                )}
                style={{ height: 6 + i * 3 }}
              />
            ))}
          </span>
          <span className={cn("text-[13px] font-semibold tracking-tight", level.tone)}>
            {level.label}
          </span>
        </div>

        <span className="hidden h-4 w-px bg-line sm:block" />

        <button
          type="button"
          onClick={onBurst}
          className="flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-[10px] font-medium text-ink-3 transition-colors hover:border-brand/40 hover:text-brand-text"
        >
          <Zap className="size-3" />
          Burst
        </button>

        <span className="flex items-center gap-1.5 font-mono text-[11px] tabular text-ink-3">
          <Activity className="size-3 text-ink-4" />
          {clock ?? "--:--:--"}
        </span>
      </div>
    </header>
  );
}
