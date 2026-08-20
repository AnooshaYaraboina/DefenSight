"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { INCIDENT_STATUSES, INCIDENT_STATUS_META } from "@/lib/engine/taxonomy";

/** Lifecycle filter for the incident list. Kept in the URL, like every filter. */
export function StatusFilter({
  current,
  counts,
  total,
  className,
}: {
  current?: string;
  counts: Record<string, number>;
  total: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function select(status: string | null) {
    const params = new URLSearchParams(search.toString());
    if (status) params.set("status", status);
    else params.delete("status");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const all = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div
      role="group"
      aria-label="Filter by status"
      className={cn("flex flex-wrap items-center gap-1.5", className, pending && "opacity-70")}
    >
      <FilterChip active={!current} label="All" count={all} onClick={() => select(null)} />
      {INCIDENT_STATUSES.map((status) => (
        <FilterChip
          key={status}
          active={current === status}
          label={INCIDENT_STATUS_META[status].label}
          count={counts[status] ?? 0}
          tone={INCIDENT_STATUS_META[status].token}
          onClick={() => select(status)}
        />
      ))}
      <span className="ml-auto font-mono text-[11px] text-ink-4">{total} shown</span>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-brand/40 bg-brand-dim/50 text-brand"
          : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2",
      )}
    >
      {tone && !active && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", {
            critical: "bg-critical", high: "bg-high", medium: "bg-medium",
            low: "bg-low", allow: "bg-allow", info: "bg-info",
          }[tone] ?? "bg-ink-4")}
        />
      )}
      {label}
      <span className="font-mono tabular text-ink-4">{count}</span>
    </button>
  );
}
