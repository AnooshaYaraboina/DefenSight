"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight, CheckCircle2, Clock, FileWarning, Siren, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils/format";
import type { AttentionItem } from "@/lib/queries/attention";

/**
 * The work queue.
 *
 * A dashboard's second panel should answer "what needs me?" rather than
 * restating a metric in a different shape. Every row here has an action behind
 * it and links straight to where that action is taken.
 */

const KIND_META = {
  incident: { icon: Siren, label: "Incident", tone: "text-critical" },
  approval: { icon: UserCheck, label: "Approval", tone: "text-approval" },
  document: { icon: FileWarning, label: "Document", tone: "text-high" },
  alert: { icon: Siren, label: "Alert", tone: "text-critical" },
} as const;

export function AttentionQueue({
  items,
  counts,
  className,
}: {
  items: AttentionItem[];
  counts: { incidents: number; approvals: number; documents: number; alerts: number };
  className?: string;
}) {
  const total = counts.incidents + counts.approvals + counts.alerts;

  /*
   * "Expiring soon" depends on the current time, which the server and client do
   * not agree on. Resolved after mount and refreshed each minute rather than
   * computed during render, which would guarantee a hydration mismatch.
   */
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(id);
      clearInterval(timer);
    };
  }, []);

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink">Needs attention</h2>
          <p className="mt-1 text-xs text-ink-3">
            {total === 0 ? "Nothing is waiting on a human." : `${total} item${total === 1 ? "" : "s"} awaiting action.`}
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Counter label="Incidents" value={counts.incidents} href="/incidents" tone="critical" />
        <Counter label="Approvals" value={counts.approvals} href="/tools" tone="approval" />
        <Counter label="Quarantined" value={counts.documents} href="/rag?status=quarantined" tone="high" />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[0.625rem] border border-line bg-surface px-6 py-12 text-center">
          <CheckCircle2 className="size-7 text-allow" />
          <div>
            <p className="text-xs font-medium text-ink-2">Queue is clear</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-4">
              No incidents open, no approvals pending, no unacknowledged alerts.
            </p>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            const expiringSoon =
              now !== null && item.expiresAt && item.expiresAt.getTime() - now < 3600_000;

            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-start gap-3 rounded-[0.625rem] border px-3.5 py-3 transition-all",
                    item.severity === "CRITICAL"
                      ? "border-critical/25 bg-critical-dim/15 hover:border-critical/40"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-ink-2">
                        {item.title}
                      </span>
                      <ArrowUpRight className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-4">
                      <span className="truncate">{item.detail}</span>
                      <span>{formatRelative(item.at)}</span>
                      {item.expiresAt && (
                        <span className={cn("flex items-center gap-1", expiringSoon && "text-high")}>
                          <Clock className="size-3" />
                          expires {formatRelative(item.expiresAt)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Counter({
  label, value, href, tone,
}: {
  label: string; value: number; href: string;
  tone: "critical" | "approval" | "high";
}) {
  const toneText = { critical: "text-critical", approval: "text-approval", high: "text-high" }[tone];
  return (
    <Link
      href={href}
      className="rounded-[0.625rem] border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <p className={cn("font-mono text-xl font-semibold tabular", value > 0 ? toneText : "text-ink-3")}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-ink-4">{label}</p>
    </Link>
  );
}
