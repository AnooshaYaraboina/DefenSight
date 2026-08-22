import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, FileWarning, ShieldAlert, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils/format";
import { SeverityBadge } from "@/components/security/indicators";
import type { WarRoomData } from "@/lib/queries/warroom";

/**
 * The only thing on the wall a person has to act on.
 *
 * Three counts and at most three items. A queue that shows twenty is a backlog
 * you scroll past; a queue that shows three is a queue you clear.
 *
 * Laid out along the foot of the wall rather than down a side column. As a tall
 * rail it competed with the traffic for the eye and still only ever held three
 * rows; along the bottom it reads as the standing to-do it is, and gives the
 * width back to the request being inspected.
 */

const COUNTS = [
  { key: "incidents", label: "Incidents", icon: ShieldAlert, href: "/incidents", tone: "text-critical" },
  { key: "approvals", label: "Approvals", icon: UserCheck, href: "/tools", tone: "text-medium" },
  { key: "quarantined", label: "Quarantined", icon: FileWarning, href: "/rag?status=quarantined", tone: "text-high" },
] as const;

export function NeedsYou({
  data,
  className,
}: {
  data: WarRoomData["needsYou"];
  className?: string;
}) {
  return (
    <section className={cn("ds-panel flex items-stretch gap-3 px-3 py-2.5", className)}>
      <div className="flex shrink-0 flex-col justify-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          Needs you
        </p>
        <p className="font-mono text-[9px] text-ink-4">waiting on a person</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {COUNTS.map((c) => {
          const Icon = c.icon;
          const value = data[c.key];
          return (
            <Link
              key={c.key}
              href={c.href}
              className="ds-well group flex items-center gap-2 px-2.5 py-1.5 transition-colors hover:border-line-strong"
            >
              <Icon className={cn("size-3.5", value > 0 ? c.tone : "text-ink-4")} />
              <span className={cn("font-mono text-[15px] font-semibold tabular", value > 0 ? "text-ink" : "text-ink-3")}>
                {value}
              </span>
              <span className="text-[9.5px] leading-tight text-ink-4">{c.label}</span>
            </Link>
          );
        })}
      </div>

      <span className="w-px shrink-0 bg-line" />

      {data.items.length === 0 ? (
        <p className="flex items-center text-[11px] text-ink-4">Nothing is waiting on a decision.</p>
      ) : (
        /* The assistant dock is fixed to the bottom-right corner. Reserving the
           space keeps it from sitting on top of the last queue item, which is
           the one a person is most likely to be reaching for. */
        <ul className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto pr-[168px]">
          {data.items.map((item) => (
            <li key={item.id} className="min-w-[220px] flex-1">
              <Link
                href={item.href}
                className="group flex h-full flex-col justify-center rounded-md border border-line bg-surface-2/40 px-2.5 py-1.5 transition-colors hover:border-brand/40"
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={item.severity} size="xs" showIcon={false} withTooltip={false} />
                  <span className="truncate text-[11px] font-medium text-ink-2">{item.label}</span>
                  <ArrowUpRight className="ml-auto size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-0.5 truncate text-[9.5px] text-ink-4">
                  {item.detail} · {formatRelative(item.at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
