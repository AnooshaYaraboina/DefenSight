"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";
import { ROLE_META, type Role } from "@/lib/engine/taxonomy";

export interface AuditRow {
  id: string;
  createdAt: Date;
  actorName: string;
  actorRole: string;
  action: string;
  category: string;
  targetType: string | null;
  targetLabel: string | null;
  description: string;
  metadata: unknown;
  outcome: string;
}

const CATEGORY_TONE: Record<string, string> = {
  SECURITY_DECISION: "brand",
  CONFIG: "medium",
  INCIDENT: "critical",
  TOOL: "high",
  DOCUMENT: "low",
  AUTH: "info",
  ADMIN: "redact",
};

/**
 * Searchable audit trail (§24).
 *
 * Failure outcomes are visually distinct because they are the entries that
 * matter during an investigation — a blocked request, a refused tool, a
 * disabled control. Successes are the background against which those read.
 */
export function AuditTable({
  logs,
  categories,
}: {
  logs: AuditRow[];
  categories: Array<{ category: string; count: number }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(search.get("q") ?? "");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  React.useEffect(() => {
    const current = search.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => setParam("q", query || null), 320);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCategory = search.get("category");
  const activeOutcome = search.get("outcome");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search actions, actors, targets…"
          className="w-full max-w-xs"
        />

        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setParam("category", activeCategory === c.category ? null : c.category)}
              aria-pressed={activeCategory === c.category}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                activeCategory === c.category
                  ? "border-brand/40 bg-brand-dim/50 text-brand"
                  : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2",
              )}
            >
              {c.category.toLowerCase().replace(/_/g, " ")}
              <span className="font-mono tabular text-ink-4">{c.count}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setParam("outcome", activeOutcome === "FAILURE" ? null : "FAILURE")}
          aria-pressed={activeOutcome === "FAILURE"}
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
            activeOutcome === "FAILURE"
              ? "border-critical/40 bg-critical-dim text-critical"
              : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2",
          )}
        >
          Failures only
        </button>

        {(activeCategory || activeOutcome || search.get("q")) && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname))}>
            <X />
            Clear
          </Button>
        )}

        <span className="ml-auto font-mono text-[11px] text-ink-4">{logs.length} shown</span>
      </div>

      <ol
        className={cn(
          "ds-panel divide-y divide-line overflow-hidden",
          pending && "opacity-60 transition-opacity",
        )}
      >
        {logs.map((log) => {
          const isOpen = expanded === log.id;
          // `metadata` is a Json column, so it arrives as `unknown`; `&&` on it
          // would propagate that type into every consumer below.
          const hasMetadata =
            Boolean(log.metadata) && Object.keys(log.metadata as object).length > 0;
          return (
            <li
              key={log.id}
              className={cn(
                "transition-colors",
                log.outcome === "FAILURE" && "bg-critical-dim/10",
              )}
            >
              <button
                type="button"
                onClick={() => hasMetadata && setExpanded(isOpen ? null : log.id)}
                disabled={!hasMetadata}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2.5 text-left",
                  hasMetadata && "cursor-pointer hover:bg-surface-2/50",
                )}
              >
                <span className="w-32 shrink-0 font-mono text-[10px] text-ink-4">
                  {formatDateTime(log.createdAt)}
                </span>

                <span className="w-36 shrink-0">
                  <span className="block truncate text-[11px] text-ink-2">{log.actorName}</span>
                  <span className="block truncate text-[9px] text-ink-4">
                    {ROLE_META[log.actorRole as Role]?.label ?? log.actorRole}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[10px] text-brand">{log.action}</code>
                    <Badge tone={(CATEGORY_TONE[log.category] ?? "neutral") as never} size="xs">
                      {log.category.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                    {log.outcome === "FAILURE" && (
                      <Badge tone="critical" size="xs">{log.outcome.toLowerCase()}</Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">
                    {log.description}
                  </span>
                </span>

                {hasMetadata && (
                  <ChevronDown
                    className={cn("mt-0.5 size-3.5 shrink-0 text-ink-4 transition-transform", isOpen && "rotate-180")}
                  />
                )}
              </button>

              {isOpen && hasMetadata && (
                <pre className="overflow-x-auto border-t border-line bg-inset px-3 py-2 font-mono text-[10px] leading-relaxed text-ink-3">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
