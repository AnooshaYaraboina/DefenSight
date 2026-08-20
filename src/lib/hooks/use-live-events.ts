"use client";

import * as React from "react";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

/**
 * Subscribes to the SSE event stream.
 *
 * EventSource reconnects on its own, but silently — so this hook surfaces the
 * connection state explicitly. A monitoring console that has quietly stopped
 * receiving data while still looking healthy is actively dangerous, so
 * "reconnecting" is shown rather than hidden.
 */
export function useLiveEvents(options: { limit?: number; enabled?: boolean } = {}) {
  const { limit = 60, enabled = true } = options;
  const [events, setEvents] = React.useState<LiveSecurityEvent[]>([]);
  // Derived from `enabled` rather than set in an effect: calling setState
  // synchronously in an effect body triggers a second render pass before paint.
  const [state, setState] = React.useState<ConnectionState>(
    enabled ? "connecting" : "offline",
  );
  const [received, setReceived] = React.useState(0);
  const [lastAt, setLastAt] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const source = new EventSource("/api/stream");

    const add = (raw: MessageEvent, isReplay: boolean) => {
      try {
        const parsed = JSON.parse(raw.data) as { type: string; payload: LiveSecurityEvent };
        if (parsed.type !== "security_event") return;
        setEvents((prev) => {
          if (prev.some((e) => e.id === parsed.payload.id)) return prev;
          return [parsed.payload, ...prev].slice(0, limit);
        });
        if (!isReplay) {
          setReceived((n) => n + 1);
          setLastAt(new Date());
        }
      } catch {
        /* a malformed frame must not tear down the stream */
      }
    };

    source.addEventListener("connected", () => setState("live"));
    source.addEventListener("replay", (e) => add(e as MessageEvent, true));
    source.addEventListener("security_event", (e) => add(e as MessageEvent, false));
    source.addEventListener("heartbeat", () => setState("live"));

    source.onerror = () => {
      setState(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    };
    source.onopen = () => setState("live");

    return () => source.close();
  }, [enabled, limit]);

  return { events, state, received, lastAt };
}

/** Subscribes to alerts for the toast layer and the topbar badge. */
export function useLiveAlerts(enabled = true) {
  const [alerts, setAlerts] = React.useState<
    Array<{ id: string; severity: string; title: string; message: string; category: string }>
  >([]);

  React.useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/stream");
    source.addEventListener("alert", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as {
          payload: { id: string; severity: string; title: string; message: string; category: string };
        };
        setAlerts((prev) => {
          if (prev.some((a) => a.id === parsed.payload.id)) return prev;
          return [parsed.payload, ...prev].slice(0, 30);
        });
      } catch {
        /* ignore malformed frame */
      }
    });
    return () => source.close();
  }, [enabled]);

  return alerts;
}
