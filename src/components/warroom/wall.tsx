"use client";

import * as React from "react";
import { useLiveEvents } from "@/lib/hooks/use-live-events";
import type { WarRoomData } from "@/lib/queries/warroom";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";
import { CommandBar } from "@/components/warroom/command-bar";
import { Flow, toFlowRows } from "@/components/warroom/flow";
import { Inspector } from "@/components/warroom/inspector";
import { NeedsYou } from "@/components/warroom/needs-you";

/**
 * The wall.
 *
 * Three regions, arranged around one question: what happened to this request?
 *
 *   1. Command bar — the standing figures, on one line
 *   2. The flow    — every request, with what was actually asked
 *   3. Inspector   — the selected request: input, twelve stages, output
 *   4. Needs you   — the only thing here a person must act on
 *
 * What was removed and why. The previous wall gave roughly 55% of the screen to
 * an estate map: four columns of dots joined by overlapping bezier curves, node
 * labels truncated mid-word. It was the most prominent element in the product
 * and no request could be traced through it. Beside it, a single posture number
 * held a 236px column and four figures held a row.
 *
 * Between them, two thirds of a screen spent on things that do not change while
 * you watch, and nowhere in that space could you read a prompt or a response —
 * the two things the pipeline exists to judge. The estate map component is
 * still in the tree; it is a fine visual and belongs somewhere. It does not
 * belong where the traffic should be.
 *
 * `h-dvh` + `overflow-hidden` keeps the no-scroll promise structural rather
 * than something that happens to hold at one window size. Each panel scrolls
 * inside itself.
 */
export function Wall({ data }: { data: WarRoomData }) {
  const { events, state } = useLiveEvents({ limit: 40 });
  const started = React.useRef(false);
  /* An explicit pick, or nothing. The effective selection is derived below
     rather than stored, so there is no effect racing the stream to set it. */
  const [picked, setPicked] = React.useState<string | null>(null);

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

  const rows = React.useMemo(
    () => toFlowRows(data.recentRequests, events as LiveSecurityEvent[]),
    [data.recentRequests, events],
  );

  /* Until someone picks a row the inspector tracks the newest arrival, so the
     wall is readable the moment it loads. The first click pins it: following
     the stream after that would pull the panel out from under a reader every
     few seconds, which is the one thing an inspector must never do. */
  const selected = picked ?? rows[0]?.id ?? null;

  return (
    <div className="ds-vignette relative flex h-dvh flex-col overflow-hidden bg-base">
      <CommandBar
        org={data.org}
        posture={data.posture}
        threatLevel={data.threatLevel}
        vitals={data.vitals}
        connection={state}
        onBurst={burst}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="flex min-h-0 flex-1 gap-2">
          <Flow
            rows={rows}
            selectedId={selected}
            onSelect={setPicked}
            className="min-w-0 flex-[1.35]"
          />
          <Inspector eventId={selected} className="hidden min-w-0 flex-1 lg:flex" />
        </div>

        <NeedsYou data={data.needsYou} className="shrink-0" />
      </div>
    </div>
  );
}
