"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Drives the simulated AI estate so the console has live traffic to monitor.
 *
 * This simulates the *estate*, never the defence: every generated request runs
 * through the real pipeline, so what appears on screen is a genuine verdict.
 */
export function TrafficControls() {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/simulate/live")
      .then((r) => r.json())
      .then((s: { running: boolean }) => setRunning(s.running))
      .catch(() => {
        /* status is a nicety; failing to read it should not surface an error */
      });
  }, []);

  async function call(action: "start" | "stop" | "burst") {
    setBusy(true);
    try {
      const res = await fetch("/api/simulate/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, intervalMs: 4000, attackRate: 0.18, count: 4 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      const status = (await res.json()) as { running: boolean };
      setRunning(status.running);
      if (action === "start") toast.success("Estate traffic started", { description: "New AI requests every few seconds." });
      if (action === "stop") toast("Estate traffic stopped");
      if (action === "burst") {
        toast.success("Traffic burst sent", { description: "4 requests pushed through the pipeline." });
        router.refresh();
      }
    } catch (error) {
      toast.error("Could not reach the traffic generator", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip content="Push a burst of AI requests through the pipeline now.">
        <Button variant="outline" size="sm" onClick={() => call("burst")} loading={busy && !running}>
          <Zap />
          Burst
        </Button>
      </Tooltip>
      <Tooltip
        content={
          running
            ? "Stop generating estate traffic."
            : "Continuously generate AI requests so the console has live activity to monitor."
        }
      >
        <Button
          variant={running ? "dangerOutline" : "secondary"}
          size="sm"
          onClick={() => call(running ? "stop" : "start")}
          disabled={busy}
        >
          {running ? <Square /> : <Play />}
          {running ? "Stop traffic" : "Start traffic"}
        </Button>
      </Tooltip>
    </div>
  );
}
