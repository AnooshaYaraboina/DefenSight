import { Skeleton, TableSkeleton } from "@/components/ui/states";

/**
 * Console loading state (§25).
 *
 * Mirrors the shape most console pages take — masthead, metric row, content —
 * so the layout does not jump when real data arrives. A spinner would be less
 * work and more disorienting.
 */
export default function ConsoleLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading security data…</span>

      <div className="mb-5">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ds-panel p-3.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-6 w-14" />
            <Skeleton className="mt-3 h-2 w-24" />
          </div>
        ))}
      </div>

      <TableSkeleton rows={9} cols={7} />
    </div>
  );
}
