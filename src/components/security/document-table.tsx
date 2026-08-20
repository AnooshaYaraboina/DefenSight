"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileWarning, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { SearchInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Tooltip } from "@/components/ui/tooltip";
import { Table, TBody, TD, TH, THead, TR, TableWrap, useSort } from "@/components/ui/table";
import { ClassificationBadge } from "./indicators";
import { ScanStatusBadge, TrustPill } from "./document-badges";
import { THREAT_META, type Classification, type ThreatType } from "@/lib/engine/taxonomy";

export interface DocumentRow {
  id: string;
  title: string;
  classification: Classification;
  trustScore: number;
  riskLevel: string;
  scanStatus: string;
  quarantined: boolean;
  quarantineReason: string | null;
  sourceName: string;
  sourceIsExternal: boolean;
  sourceTrust: number;
  owner: string;
  sizeBytes: number;
  findingCount: number;
  retrievalCount: number;
  vectorStore: string | null;
  topThreat: string | null;
}

type SortKey = "title" | "trustScore" | "findingCount" | "retrievalCount" | "sizeBytes";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "quarantined", label: "Quarantined" },
  { key: "MALICIOUS", label: "Malicious" },
  { key: "SUSPICIOUS", label: "Suspicious" },
  { key: "CLEAN", label: "Clean" },
];

export function DocumentTable({
  documents,
  sources,
  counts,
}: {
  documents: DocumentRow[];
  sources: Array<{ id: string; name: string }>;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(search.get("q") ?? "");
  const { sort, onSort } = useSort<SortKey>("trustScore", "asc");

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

  const sorted = React.useMemo(() => {
    if (!sort.key) return documents;
    const key = sort.key;
    return [...documents].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [documents, sort]);

  const activeStatus = search.get("status") ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search documents…"
          className="w-full max-w-xs"
        />

        <div role="group" aria-label="Filter by scan status" className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const count =
              f.key === "" ? documents.length : f.key === "quarantined" ? undefined : counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setParam("status", f.key || null)}
                aria-pressed={activeStatus === f.key}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  activeStatus === f.key
                    ? "border-brand/40 bg-brand-dim/50 text-brand"
                    : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2",
                )}
              >
                {f.label}
                {count !== undefined && (
                  <span className="font-mono tabular text-ink-4">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <span className="ml-auto font-mono text-[11px] text-ink-4">
          {sorted.length} document{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      <TableWrap className={cn(pending && "opacity-60 transition-opacity")}>
        <Table>
          <THead>
            <TR>
              <SortableHeader column="title" sort={sort} onSort={onSort}>Document</SortableHeader>
              <TH className="w-44">Source</TH>
              <TH className="w-28">Classification</TH>
              <SortableHeader column="trustScore" sort={sort} onSort={onSort} numeric>Trust</SortableHeader>
              <TH className="w-28">Scan</TH>
              <TH className="w-44">Finding</TH>
              <SortableHeader column="retrievalCount" sort={sort} onSort={onSort} numeric>Retrievals</SortableHeader>
              <SortableHeader column="sizeBytes" sort={sort} onSort={onSort} numeric>Size</SortableHeader>
            </TR>
          </THead>
          <TBody>
            {sorted.map((d) => (
              <TR key={d.id} interactive className={d.quarantined ? "bg-critical-dim/20" : undefined}>
                <TD>
                  <Link href={`/rag/documents/${d.id}`} className="block">
                    <span className="flex items-center gap-1.5">
                      {d.quarantined && <ShieldOff className="size-3 shrink-0 text-critical" />}
                      <span className="truncate font-medium text-ink-2">{d.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-ink-4">{d.owner}</span>
                  </Link>
                </TD>
                <TD>
                  <Link href={`/rag/documents/${d.id}`} className="block">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-ink-3">{d.sourceName}</span>
                      {d.sourceIsExternal && (
                        <Tooltip content="Externally authored. Never implicitly trusted.">
                          <Badge tone="high" size="xs">EXT</Badge>
                        </Tooltip>
                      )}
                    </span>
                  </Link>
                </TD>
                <TD>
                  <ClassificationBadge classification={d.classification} />
                </TD>
                <TD numeric>
                  <TrustPill trust={d.trustScore} ceiling={d.sourceTrust} />
                </TD>
                <TD>
                  <ScanStatusBadge status={d.scanStatus} quarantined={d.quarantined} />
                </TD>
                <TD>
                  {d.topThreat ? (
                    <Tooltip content={d.quarantineReason ?? undefined}>
                      <span className="truncate text-[11px] text-critical">
                        {THREAT_META[d.topThreat as ThreatType]?.label ?? d.topThreat}
                      </span>
                    </Tooltip>
                  ) : d.findingCount > 0 ? (
                    <span className="text-[11px] text-medium">{d.findingCount} findings</span>
                  ) : (
                    <span className="text-[11px] text-ink-4">—</span>
                  )}
                </TD>
                <TD numeric mono className="text-ink-3">{d.retrievalCount}</TD>
                <TD numeric mono className="text-ink-4">{formatBytes(d.sizeBytes)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        {sorted.length === 0 && (
          <EmptyState
            icon={FileWarning}
            title="No documents match"
            description="Adjust the filters, or upload a document to run it through the scanner."
          />
        )}
      </TableWrap>
    </div>
  );
}

function SortableHeader<K extends string>({
  column, sort, onSort, children, numeric,
}: {
  column: K;
  sort: { key: K | null; dir: "asc" | "desc" };
  onSort: (key: K) => void;
  children: React.ReactNode;
  numeric?: boolean;
}) {
  const active = sort.key === column;
  return (
    <TH numeric={numeric} className="p-0">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "flex w-full items-center gap-1 px-3 py-2 transition-colors hover:text-ink-2",
          numeric && "justify-end",
          active && "text-ink-2",
        )}
      >
        {children}
        <span className={cn("text-[8px]", active ? "text-brand" : "text-ink-4/50")}>
          {!active ? "↕" : sort.dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </TH>
  );
}
