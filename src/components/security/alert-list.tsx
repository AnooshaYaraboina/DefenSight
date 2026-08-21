"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, CheckCheck, Siren } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { SeverityBadge } from "./indicators";
import { formatRelative } from "@/lib/utils/format";
import { useLiveAlerts } from "@/lib/hooks/use-live-events";
import type { Severity } from "@/lib/engine/taxonomy";

export interface AlertRow {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  category: string;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  createdAt: Date;
  eventId: string | null;
  incidentId: string | null;
  acknowledgedBy: { name: string } | null;
  incident: { ref: string } | null;
}

/**
 * Real-time alert list (§24).
 *
 * New alerts arrive over the same stream the monitor uses. They surface as a
 * banner rather than being spliced into the list, so an analyst working through
 * the queue does not have rows shift underneath them mid-read.
 */
export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  const router = useRouter();
  const live = useLiveAlerts();
  const [busy, setBusy] = React.useState(false);

  const knownIds = React.useMemo(() => new Set(alerts.map((a) => a.id)), [alerts]);
  const incoming = live.filter((a) => !knownIds.has(a.id));
  const unacknowledged = alerts.filter((a) => !a.acknowledged);

  async function acknowledge(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Acknowledge failed");
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("Could not acknowledge", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {incoming.length > 0 && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="ds-row-enter flex w-full items-center gap-2.5 rounded-panel border border-brand/40 bg-brand-dim/30 px-4 py-3 text-left transition-colors hover:bg-brand-dim/50"
        >
          <BellRing className="size-4 animate-pulse text-brand" />
          <span className="flex-1 text-xs font-medium text-brand">
            {incoming.length} new alert{incoming.length === 1 ? "" : "s"} since this page loaded
          </span>
          <span className="text-[11px] text-brand-text/80">Refresh to view</span>
        </button>
      )}

      {unacknowledged.length > 0 && (
        <div className="ds-panel flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-[11px] text-ink-3">
            <strong className="text-ink">{unacknowledged.length}</strong> alert
            {unacknowledged.length === 1 ? "" : "s"} awaiting acknowledgement
          </span>
          <Button variant="outline" size="sm" loading={busy} onClick={() => acknowledge({ all: true }, "All alerts acknowledged")}>
            <CheckCheck />
            Acknowledge all
          </Button>
        </div>
      )}

      {alerts.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No alerts"
          description="Alerts are raised automatically when a high or critical severity threat is confirmed."
        />
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={cn(
                "rounded-panel border p-4 transition-colors",
                alert.acknowledged
                  ? "border-line/60 bg-surface/50"
                  : alert.severity === "CRITICAL"
                    ? "border-critical/35 bg-critical-dim/15"
                    : "border-line bg-surface",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={alert.severity} size="xs" />
                    <Badge tone="outline" size="xs">{alert.category.toLowerCase()}</Badge>
                    <span className={cn("text-xs font-medium", alert.acknowledged ? "text-ink-3" : "text-ink")}>
                      {alert.title}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{alert.message}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-ink-4">
                    <span>{formatRelative(alert.createdAt)}</span>
                    {alert.acknowledgedBy && alert.acknowledgedAt && (
                      <span className="flex items-center gap-1 text-allow">
                        <Check className="size-3" />
                        acknowledged by {alert.acknowledgedBy.name} {formatRelative(alert.acknowledgedAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {alert.incidentId && alert.incident && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/incidents/${alert.incidentId}`}>
                        <Siren />
                        {alert.incident.ref}
                      </Link>
                    </Button>
                  )}
                  {alert.eventId && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/monitor/${alert.eventId}`}>Investigate</Link>
                    </Button>
                  )}
                  {!alert.acknowledged && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => acknowledge({ alertId: alert.id }, "Alert acknowledged")}
                    >
                      <Check />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
