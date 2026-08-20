"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dense data-table primitives. Security tables are read at a glance and scanned
 * vertically, so rows are compact, numerics are tabular, and the header stays
 * pinned while the body scrolls.
 */

export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative w-full overflow-auto rounded-panel border border-line", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-xs", className)} {...props} />
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 bg-surface-2/95 backdrop-blur supports-[backdrop-filter]:bg-surface-2/80",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({
  className,
  interactive,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  interactive?: boolean;
  selected?: boolean;
}) {
  return (
    <tr
      className={cn(
        "transition-colors",
        interactive && "cursor-pointer hover:bg-surface-2/60",
        selected && "bg-brand-dim/25 hover:bg-brand-dim/30",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-4",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  mono,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-ink-2",
        numeric && "text-right tabular",
        mono && "font-mono text-[11px]",
        className,
      )}
      {...props}
    />
  );
}

/** Clickable column header that cycles asc → desc → none. */
export function SortableTH<K extends string>({
  column,
  sort,
  onSort,
  children,
  numeric,
  className,
}: {
  column: K;
  sort: { key: K | null; dir: "asc" | "desc" };
  onSort: (key: K) => void;
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH numeric={numeric} className={cn("p-0", className)}>
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
        <Icon className={cn("size-3", active ? "text-brand" : "text-ink-4/60")} />
      </button>
    </TH>
  );
}

/** Generic sort state hook shared by every table in the console. */
export function useSort<K extends string>(initial: K, initialDir: "asc" | "desc" = "desc") {
  const [sort, setSort] = React.useState<{ key: K | null; dir: "asc" | "desc" }>({
    key: initial,
    dir: initialDir,
  });
  const onSort = React.useCallback((key: K) => {
    setSort((s) =>
      s.key !== key
        ? { key, dir: "desc" }
        : s.dir === "desc"
          ? { key, dir: "asc" }
          : { key: null, dir: "desc" },
    );
  }, []);
  return { sort, onSort };
}
