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
    <section className={cn("ds-panel flex min-h-0 flex-col p-4", className)}>
      <p className="ds-eyebrow shrink-0">Needs you</p>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        {COUNTS.map((c) => {
          const Icon = c.icon;
          const value = data[c.key];
          return (
            <Link
              key={c.key}
              href={c.href}
              className="ds-well group flex flex-col items-center px-2 py-2.5 transition-colors hover:border-line-strong"
            >
              <Icon className={cn("size-3.5", value > 0 ? c.tone : "text-ink-4")} />
              <span className={cn("ds-figure mt-1.5 text-xl", value > 0 ? "text-ink" : "text-ink-3")}>
                {value}
              </span>
              <span className="mt-0.5 text-center text-[9px] leading-tight text-ink-4">{c.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="ds-rule my-3 shrink-0" />

      {data.items.length === 0 ? (
        <p className="text-[11px] text-ink-4">Nothing is waiting on a decision.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group block rounded-md border border-line bg-surface-2/40 px-2.5 py-2 transition-colors hover:border-brand/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <SeverityBadge severity={item.severity} size="xs" showIcon={false} withTooltip={false} />
                  <ArrowUpRight className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1.5 truncate text-[11px] font-medium text-ink-2">{item.label}</p>
                <p className="mt-0.5 truncate text-[10px] text-ink-4">
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
