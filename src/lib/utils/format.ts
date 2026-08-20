/** Formatting helpers shared across the security console. */

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Compact absolute time for dense event tables: 14:22:07.412 */
export function formatClock(d: Date | string, withMs = false): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  if (!withMs) return `${hh}:${mm}:${ss}`;
  return `${hh}:${mm}:${ss}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // `hour12: false` renders midnight as hour 24 in en-US ("Aug 21, 24:39:08"),
    // which is not a real time and looks like a corrupted record in an audit
    // log. h23 is the 00-23 cycle actually intended.
    hourCycle: "h23",
  });
}

/** "3m ago", "2h ago" — used by live views where recency is what matters. */
export function formatRelative(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const secs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDuration(ms: number): string {
  // A stage that completed in under a tenth of a millisecond is instantaneous,
  // not "0µs" — rendering a zero reads as a broken measurement.
  if (ms <= 0) return "<0.1ms";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** "1 document" / "2 documents" — avoids the "1 document(s)" tell. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Shorten identifiers for table cells without losing recognisability. */
export function truncateMiddle(s: string, max = 24): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

export function truncate(s: string, max = 80): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
