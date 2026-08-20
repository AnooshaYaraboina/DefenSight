"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Filter, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration, truncate } from "@/lib/utils/format";
import { SearchInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { DecisionBadge, SeverityBar, ThreatBadge } from "./indicators";
import { RiskPill } from "./risk-score";
import { DECISIONS, SEVERITIES, THREAT_TYPES, THREAT_META } from "@/lib/engine/taxonomy";
import type { Decision, Severity, ThreatType } from "@/lib/engine/taxonomy";

export interface EventRow {
  id: string;
  ref: string;
  createdAt: Date;
  application: string;
  agent?: string;
  model: string;
  user: string;
  request: string;
  riskScore: number;
  severity: Severity;
  decision: Decision;
  threatTypes: ThreatType[];
  detectionCount: number;
  toolCallCount: number;
  retrievalCount: number;
  latencyMs: number;
  incidentId: string | null;
}

/**
 * The filterable event table (§7).
 *
 * Filters live in the URL rather than component state, so an analyst can send a
 * colleague a link to exactly what they are looking at — the single most useful
 * property a security console can have during an investigation.
 */
export function EventTable({
  events,
  total,
  page,
  pageCount,
  applications,
  agents,
  liveCount = 0,
}: {
  events: EventRow[];
  total: number;
  page: number;
  pageCount: number;
  applications: Array<{ name: string; slug: string }>;
  agents: Array<{ name: string; slug: string }>;
  liveCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(search.get("q") ?? "");

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(search.toString());
      if (value === null || value === "" || value === "__all") params.delete(key);
      else params.set(key, value);
      if (key !== "page") params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, search],
  );

  // Debounce the search so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const current = search.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => setParam("q", query || null), 320);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = ["severity", "decision", "application", "agent", "threat"].filter((k) =>
    search.get(k),
  );

  const threatOptions = React.useMemo(
    () => THREAT_TYPES.map((t) => ({ value: t, label: THREAT_META[t].label })).sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search requests, references, users…"
          className="w-full max-w-xs"
        />

        <FilterSelect label="Severity" value={search.get("severity")} onChange={(v) => setParam("severity", v)}
          options={SEVERITIES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
        <FilterSelect label="Decision" value={search.get("decision")} onChange={(v) => setParam("decision", v)}
          options={DECISIONS.map((d) => ({ value: d, label: d.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))} />
        <FilterSelect label="Application" value={search.get("application")} onChange={(v) => setParam("application", v)}
          options={applications.map((a) => ({ value: a.slug, label: a.name }))} />
        <FilterSelect label="Agent" value={search.get("agent")} onChange={(v) => setParam("agent", v)}
          options={agents.map((a) => ({ value: a.slug, label: a.name }))} />
        <FilterSelect label="Threat" value={search.get("threat")} onChange={(v) => setParam("threat", v)}
          options={threatOptions} />

        {active.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          >
            <X />
            Clear {active.length}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {liveCount > 0 && (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="flex items-center gap-1.5 rounded-md border border-brand/30 bg-brand-dim/40 px-2 py-1 text-[11px] text-brand transition-colors hover:bg-brand-dim/60"
            >
              <Radio className="size-3 animate-pulse" />
              {liveCount} new — refresh
            </button>
          )}
          <span className="font-mono text-[11px] tabular text-ink-4">
            {total.toLocaleString()} events
          </span>
        </div>
      </div>

      <TableWrap className={cn(pending && "opacity-60 transition-opacity")}>
        <Table>
          <THead>
            <TR>
              <TH className="w-8" />
              <TH className="w-24">Time</TH>
              <TH className="w-40">User</TH>
              <TH className="w-40">Application</TH>
              <TH>Request</TH>
              <TH className="w-52">Threats</TH>
              <TH numeric className="w-16">Risk</TH>
              <TH className="w-28">Action</TH>
              <TH numeric className="w-16">Latency</TH>
            </TR>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id} interactive className="group">
                <TD className="pl-3 pr-0">
                  <SeverityBar severity={e.severity} />
                </TD>
                <TD mono className="whitespace-nowrap text-ink-3">
                  <Link href={`/monitor/${e.id}`} className="block">
                    {formatClock(e.createdAt, true)}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/monitor/${e.id}`} className="block truncate text-ink-2">
                    {e.user}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/monitor/${e.id}`} className="block">
                    <span className="block truncate text-ink-2">{e.application}</span>
                    {e.agent && (
                      <span className="block truncate font-mono text-[10px] text-ink-4">{e.agent}</span>
                    )}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/monitor/${e.id}`} className="block">
                    <span className="block truncate text-ink-3">{truncate(e.request, 96)}</span>
                    {(e.toolCallCount > 0 || e.retrievalCount > 0) && (
                      <span className="mt-0.5 flex gap-2 font-mono text-[10px] text-ink-4">
                        {e.retrievalCount > 0 && <span>{e.retrievalCount} docs</span>}
                        {e.toolCallCount > 0 && <span>{e.toolCallCount} tools</span>}
                        {e.detectionCount > 0 && <span>{e.detectionCount} detections</span>}
                      </span>
                    )}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/monitor/${e.id}`} className="flex flex-wrap gap-1">
                    {e.threatTypes.slice(0, 2).map((t) => (
                      <ThreatBadge key={t} threat={t} size="xs" severity={e.severity} withTooltip={false} />
                    ))}
                    {e.threatTypes.length > 2 && (
                      <span className="self-center text-[10px] text-ink-4">
                        +{e.threatTypes.length - 2}
                      </span>
                    )}
                    {e.threatTypes.length === 0 && <span className="text-[11px] text-ink-4">—</span>}
                  </Link>
                </TD>
                <TD numeric>
                  <Link href={`/monitor/${e.id}`} className="block">
                    <RiskPill score={e.riskScore} />
                  </Link>
                </TD>
                <TD>
                  <Link href={`/monitor/${e.id}`} className="block">
                    <DecisionBadge decision={e.decision} size="xs" withTooltip={false} />
                  </Link>
                </TD>
                <TD numeric mono className="text-ink-4">
                  <Link href={`/monitor/${e.id}`} className="block">
                    {formatDuration(e.latencyMs)}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        {events.length === 0 && (
          <EmptyState
            icon={Filter}
            title="No events match these filters"
            description="Widen the time range or clear a filter. Live traffic can be generated from the dashboard."
            action={
              active.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => router.replace(pathname)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </TableWrap>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-ink-4">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
              <ChevronLeft />
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setParam("page", String(page + 1))}>
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger size="sm" className={cn("w-auto min-w-28", value && "border-brand/40 text-brand")}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
