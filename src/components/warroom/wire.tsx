"use client";

import * as React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { THREAT_META, type ThreatType } from "@/lib/engine/taxonomy";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";

/**
 * The wire.
 *
 * One line, the last thing that was stopped. A scrolling list of everything
 * would be a second live feed competing with the map; this shows the single
 * most recent interception and lets it be replaced.
 */

export interface Intercept {
  id: string;
  at: Date | string;
  threat: string;
  target: string;
  decision: string;
  severity: string;
}

export function Wire({
  seed,
  live,
  className,
}: {
  seed: Intercept[];
  live: LiveSecurityEvent[];
  className?: string;
}) {
  // Only interceptions belong on the wire. An allowed request is not news.
  const fromLive: Intercept[] = live
    .filter((e) => e.blocked || e.severity === "CRITICAL" || e.severity === "HIGH")
    .map((e) => ({
      id: e.id,
      at: e.createdAt,
      threat: e.threatTypes.length
        ? (THREAT_META[e.threatTypes[0] as ThreatType]?.label ?? e.threatTypes[0])
        : "Anomaly",
      target: e.agent ?? e.application,
      decision: e.decision,
      severity: e.severity,
    }));

  /* A live event can also be sitting in the server-rendered seed: the bus
     replays recent traffic and the seed was queried from those same rows.
     Concatenating blind repeats the id, which collides as a React key and
     makes the wire silently drop a line. Live wins -- it is the fresher copy
     of the same row. */
  const items = [...fromLive, ...seed]
    .filter((item, i, all) => all.findIndex((other) => other.id === item.id) === i)
    .slice(0, 6);
  const latest = items[0];

  return (
    <section
      className={cn(
        "ds-panel flex h-14 shrink-0 items-center gap-3 overflow-hidden px-4",
        className,
      )}
      aria-label="Latest interception"
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <Zap className="size-3.5 text-critical" />
        <span className="ds-eyebrow">Intercepted</span>
      </span>

      <span className="h-5 w-px shrink-0 bg-line" />

      {latest ? (
        <ul className="flex min-w-0 flex-1 items-center gap-6 overflow-hidden">
          {items.slice(0, 3).map((item, i) => (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0 items-center gap-2.5 whitespace-nowrap",
                i === 0 ? "ds-row-enter" : "hidden lg:flex",
                i > 0 && "opacity-45",
              )}
            >
              <span className="font-mono text-[10px] tabular text-ink-4">{clock(item.at)}</span>
              <span className="text-[11px] font-medium text-critical">{item.threat}</span>
              <span className="text-[10px] text-ink-4">→</span>
              <span className="truncate text-[11px] text-ink-2">{item.target}</span>
              <span className="text-[10px] text-ink-4">→</span>
              <span className="rounded border border-critical/30 bg-critical-dim/40 px-1.5 py-px text-[10px] font-medium text-critical">
                {item.decision === "BLOCK" ? "BLOCKED" : item.decision}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 text-[11px] text-ink-4">
          Nothing intercepted yet. Every request so far cleared the pipeline.
        </p>
      )}

      <Link
        href="/monitor"
        className="shrink-0 text-[10px] text-ink-4 transition-colors hover:text-brand-text"
      >
        Full monitor →
      </Link>
    </section>
  );
}

function clock(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
}
