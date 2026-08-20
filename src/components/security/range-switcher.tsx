"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Time-range control. One row, above the charts, per the interaction spec. */
export function RangeSwitcher({
  current,
  options,
  param = "range",
}: {
  current: string;
  options: Array<{ key: string; label: string }>;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function select(key: string) {
    const params = new URLSearchParams(search.toString());
    params.set(param, key);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div
      role="group"
      aria-label="Time range"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5",
        pending && "opacity-70",
      )}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => select(o.key)}
          aria-pressed={current === o.key}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-medium transition-colors",
            current === o.key
              ? "bg-brand-dim/60 text-brand"
              : "text-ink-4 hover:bg-surface-2 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
