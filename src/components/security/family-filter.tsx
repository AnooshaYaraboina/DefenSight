"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { THREAT_FAMILY_META, type ThreatFamily } from "@/lib/engine/taxonomy";

/** Attack-family filter for the Threat Center. Held in the URL like every filter. */
export function FamilyFilter({
  current,
  families,
  className,
}: {
  current?: ThreatFamily;
  families: Array<{ key: ThreatFamily; total: number }>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function select(family: string | null) {
    const params = new URLSearchParams(search.toString());
    if (family) params.set("family", family);
    else params.delete("family");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const total = families.reduce((s, f) => s + f.total, 0);

  return (
    <div
      role="group"
      aria-label="Filter by attack family"
      className={cn("flex flex-wrap items-center gap-1.5", className, pending && "opacity-70")}
    >
      <Chip active={!current} label="All families" count={total} onClick={() => select(null)} />
      {families.map((f) => (
        <Chip
          key={f.key}
          active={current === f.key}
          label={THREAT_FAMILY_META[f.key].label}
          count={f.total}
          onClick={() => select(f.key)}
        />
      ))}
    </div>
  );
}

function Chip({
  active, label, count, onClick,
}: {
  active: boolean; label: string; count: number; onClick: () => void;
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
      {label}
      <span className="font-mono tabular text-ink-4">{count}</span>
    </button>
  );
}
