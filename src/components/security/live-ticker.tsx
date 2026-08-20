"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, truncate } from "@/lib/utils/format";
import { useLiveEvents } from "@/lib/hooks/use-live-events";
import { RiskPill } from "./risk-score";
import { DecisionBadge, LiveDot } from "./indicators";
import { Button } from "@/components/ui/button";

/**
 * A thin live strip above the event table.
 *
 * The table is a paged, filtered, deliberate view — reloading it on every new
 * event would yank the ground out from under whoever is reading it. This strip
 * carries the live signal instead, and offers an explicit refresh when enough
 * has accumulated to be worth pulling in.
 */
export function LiveTicker({ className }: { className?: string }) {
  const router = useRouter();
  const { events, state, received } = useLiveEvents({ limit: 8 });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-panel border border-line bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <LiveDot active={state === "live"} />
          <span className="text-[11px] font-medium text-ink-2">
            {state === "live" ? "Streaming" : state === "offline" ? "Disconnected" : "Reconnecting…"}
          </span>
          {received > 0 && (
            <span className="font-mono text-[10px] text-ink-4">{received} since load</span>
          )}
        </div>
        {received > 0 && (
          <Button variant="ghost" size="xs" onClick={() => router.refresh()}>
            Pull into table
            <ArrowRight />
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        // A quiet stream is the normal state. Say so in one line rather than
        // reserving a panel-sized void above the table.
        <p className="px-3 py-2 text-[11px] text-ink-4">
          Nothing streaming right now — the table below holds the full history.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {events.slice(0, 5).map((e) => (
            <li key={e.id} className="ds-row-enter">
              <Link
                href={`/monitor/${e.id}`}
                className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="font-mono text-[10px] text-ink-4">
                  {formatClock(e.createdAt, true)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
                  <span className="text-ink-2">{e.user}</span>
                  {" · "}
                  {truncate(e.request, 80)}
                </span>
                <RiskPill score={e.riskScore} />
                <DecisionBadge decision={e.decision} size="xs" showIcon={false} withTooltip={false} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
