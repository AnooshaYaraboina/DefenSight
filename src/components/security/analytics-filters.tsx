"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SEVERITIES } from "@/lib/engine/taxonomy";

/** Dimension filters for analytics. One row above the charts, per the spec. */
export function AnalyticsFilters({
  applications,
  agents,
  className,
}: {
  applications: Array<{ name: string; slug: string }>;
  agents: Array<{ name: string; slug: string }>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (!value || value === "__all") params.delete(key);
    else params.set(key, value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const active = ["application", "agent", "severity"].filter((k) => search.get(k));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className, pending && "opacity-70")}>
      <Filter label="Application" value={search.get("application")} onChange={(v) => setParam("application", v)}
        options={applications.map((a) => ({ value: a.slug, label: a.name }))} />
      <Filter label="Agent" value={search.get("agent")} onChange={(v) => setParam("agent", v)}
        options={agents.map((a) => ({ value: a.slug, label: a.name }))} />
      <Filter label="Severity" value={search.get("severity")} onChange={(v) => setParam("severity", v)}
        options={SEVERITIES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />

      {active.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams(search.toString());
            active.forEach((k) => params.delete(k));
            startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
          }}
        >
          <X />
          Clear {active.length}
        </Button>
      )}
    </div>
  );
}

function Filter({
  label, value, onChange, options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value ?? "__all"} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("w-auto min-w-32", value && "border-brand/40 text-brand")}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">All {label.toLowerCase()}s</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
