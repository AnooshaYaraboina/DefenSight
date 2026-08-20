import type { NextRequest } from "next/server";
import { bus } from "@/lib/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream backing the live monitor (§7).
 *
 * Sends a replay of recent events on connect so a console opened mid-stream is
 * not staring at an empty table, then streams new ones as they occur. A
 * heartbeat every 20 seconds keeps intermediaries from closing an idle
 * connection — a monitoring view that silently stops updating is worse than one
 * that visibly reconnects.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send("connected", {
        at: new Date().toISOString(),
        subscribers: bus.subscriberCount + 1,
      });

      for (const event of bus.getRecent(20)) {
        send("replay", event);
      }

      const unsubscribe = bus.subscribe((event) => send(event.type, event));

      const heartbeat = setInterval(() => {
        send("heartbeat", { at: new Date().toISOString() });
      }, 20_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering, which otherwise holds events until the buffer
      // fills and makes a "live" view arrive in bursts.
      "X-Accel-Buffering": "no",
    },
  });
}
