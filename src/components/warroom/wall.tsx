"use client";

import * as React from "react";
import { useLiveEvents } from "@/lib/hooks/use-live-events";
import type { WarRoomData } from "@/lib/queries/warroom";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";
import { StatusRail } from "@/components/warroom/status-rail";
import { PostureCore } from "@/components/warroom/posture-core";
import { EstateMap } from "@/components/warroom/estate-map";
import { NeedsYou } from "@/components/warroom/needs-you";
import { Vitals } from "@/components/warroom/vitals";
import { Wire } from "@/components/warroom/wire";

/**
 * The wall.
 *
 * Five things, and a rail. That count is the design, not a starting point:
 *
 *   1. Posture      — one number, read from across a room
 *   2. Estate map   — where traffic goes and where it gets stopped
 *   3. Needs you    — the only thing here a person must act on
 *   4. Vitals       — four figures
 *   5. The wire     — the last interception
 *
 * The previous dashboard carried fourteen features and answered none of them
 * well. Anything that wants to be the sixth element belongs on its own screen,
 * reachable from the rail. Please do not add one.
 *
 * `h-dvh` + `overflow-hidden` makes the no-scroll promise structural rather
 * than something that happens to hold at one window size.
 */
export function Wall({ data }: { data: WarRoomData }) {
  const { events, state } = useLiveEvents({ limit: 40 });
  const started = React.useRef(false);

  // Traffic auto-starts so the wall is never a still photograph. Guarded by a
  // ref because StrictMode mounts effects twice in development, and left
  // running on unmount — the generator feeds the whole console, not this view.
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const status = await fetch("/api/simulate/live").then((r) => r.json());
        if (status?.running) return;
        await fetch("/api/simulate/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 12%, not the 22% a manual burst uses. The wall runs unattended for
          // hours, and a fifth of all traffic being an attack compounds into an
          // incident backlog that makes a healthy estate look abandoned.
          body: JSON.stringify({ action: "start", intervalMs: 4000, attackRate: 0.12 }),
        });
      } catch {
        // A wall that greets you with an error toast is worse than a quiet one.
      }
    })();
  }, []);

  function burst() {
    void fetch("/api/simulate/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "burst", count: 6 }),
    }).catch(() => {});
  }

  return (
    <div className="ds-vignette ds-scanline relative flex h-dvh flex-col overflow-hidden bg-base">
      <StatusRail
        org={data.org}
        threatLevel={data.threatLevel}
        connection={state}
        onBurst={burst}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {/* ---------------------------------------------------- watchfloor */}
        <div className="flex min-h-0 flex-1 gap-2">
          <PostureCore
            score={data.posture.score}
            delta={data.posture.delta}
            verdict={data.posture.verdict}
            pulse={data.posture.pulse}
            className="hidden w-[236px] shrink-0 lg:flex"
          />

          <EstateMap
            nodes={data.topology.nodes}
            edges={data.topology.edges}
            agentsByName={data.topology.agentsByName}
            toolNodeBySlug={data.topology.toolNodeBySlug}
            events={events as LiveSecurityEvent[]}
            className="min-w-0 flex-1"
          />

          <NeedsYou data={data.needsYou} className="hidden w-[272px] shrink-0 xl:flex" />
        </div>

        <Vitals
          analysed={data.vitals.analysed}
          blocked={data.vitals.blocked}
          critical={data.vitals.critical}
          blockRate={data.vitals.blockRate}
          className="shrink-0"
        />

        <Wire seed={data.recentIntercepts} live={events} />
      </div>
    </div>
  );
}
