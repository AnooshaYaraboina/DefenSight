"use client";

import * as React from "react";
import Link from "next/link";
import { Pause, Play, Radio, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, truncate } from "@/lib/utils/format";
import { useLiveEvents } from "@/lib/hooks/use-live-events";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { DecisionBadge, SeverityBar } from "./indicators";
import { RiskPill } from "./risk-score";
import { THREAT_META, type ThreatType } from "@/lib/engine/taxonomy";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";

/**
 * Live security event feed (§7).
 *
 * Newest first, entering with a brief highlight so a new row is noticed without
 * the list jumping. Pausing freezes the view rather than the stream — an analyst
 * reading a row should never have it scroll away mid-sentence, but the events
 * behind it keep accumulating and appear on resume.
 */
export function LiveFeed({
  initialEvents = [],
  limit = 40,
  compact = false,
  className,
}: {
  /** Server-rendered seed so the feed is populated before the stream connects. */
  initialEvents?: LiveSecurityEvent[];
  limit?: number;
  compact?: boolean;
  className?: string;
}) {
  const { events, state, received } = useLiveEvents({ limit });
  const [paused, setPaused] = React.useState(false);
  const frozen = React.useRef<typeof events>([]);

  // Snapshot on pause so the visible list is stable while the stream continues.
  React.useEffect(() => {
    if (paused) frozen.current = events;
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = paused ? frozen.current : events;
  const rows: LiveSecurityEvent[] = live.length > 0 ? live : initialEvents;
  const pendingWhilePaused = paused ? Math.max(0, events.length - frozen.current.length) : 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {state === "live" ? (
            <Radio className="size-3.5 text-allow" />
          ) : state === "offline" ? (
            <WifiOff className="size-3.5 text-critical" />
          ) : (
            <Radio className="size-3.5 animate-pulse text-medium" />
          )}
          <span className="text-[11px] font-medium text-ink-2">
            {state === "live" ? "Live" : state === "offline" ? "Disconnected" : "Reconnecting…"}
          </span>
          {received > 0 && (
            <span className="font-mono text-[10px] text-ink-4">{received} received</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pendingWhilePaused > 0 && (
            <span className="rounded bg-brand-dim/60 px-1.5 py-0.5 font-mono text-[10px] text-brand">
              +{pendingWhilePaused} queued
            </span>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume live feed" : "Pause live feed"}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-panel border border-line bg-surface">
        {rows.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="Waiting for AI activity"
            description="Events appear here the moment a request reaches the pipeline. Start the traffic generator to see the estate in motion."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="ds-row-enter">
                <Link
                  href={`/monitor/${e.id}`}
                  className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <SeverityBar severity={e.severity as never} className="mt-1 shrink-0" />

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[10px] text-ink-4">
                        {formatClock(e.createdAt, true)}
                      </span>
                      <span className="text-[11px] font-medium text-ink-2">{e.user}</span>
                      <span className="text-[10px] text-ink-4">→</span>
                      <span className="text-[11px] text-ink-3">{e.application}</span>
                      {e.agent && !compact && (
                        <span className="rounded bg-surface-2 px-1 font-mono text-[10px] text-ink-4">
                          {e.agent}
                        </span>
                      )}
                    </span>

                    <span className="mt-1 block truncate text-[11px] text-ink-3">
                      {truncate(e.request, compact ? 60 : 110)}
                    </span>

                    {e.threatTypes.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {e.threatTypes.slice(0, compact ? 1 : 3).map((t) => (
                          <span
                            key={t}
                            className="rounded border border-critical/30 bg-critical-dim px-1 py-px text-[10px] text-critical"
                          >
                            {THREAT_META[t as ThreatType]?.label ?? t}
                          </span>
                        ))}
                        {e.threatTypes.length > (compact ? 1 : 3) && (
                          <span className="px-1 text-[10px] text-ink-4">
                            +{e.threatTypes.length - (compact ? 1 : 3)}
                          </span>
                        )}
                      </span>
                    )}
                  </span>

                  <span className="flex shrink-0 items-center gap-2 pt-0.5">
                    <RiskPill score={e.riskScore} />
                    {!compact && <DecisionBadge decision={e.decision as never} size="xs" showIcon={false} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
