"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EvidenceSpan {
  start: number;
  end: number;
  label?: string;
  severity?: "critical" | "high" | "medium" | "low";
}

const SPAN_TONE = {
  critical: "bg-critical/25 text-critical border-b-2 border-critical/70",
  high: "bg-high/25 text-high border-b-2 border-high/70",
  medium: "bg-medium/20 text-medium border-b-2 border-medium/60",
  low: "bg-low/20 text-low border-b-2 border-low/60",
} as const;

/**
 * Renders text with detector-matched regions highlighted in place.
 *
 * This is the heart of explainability in DefenSight: instead of telling an
 * analyst "prompt injection, 92% confidence", we show them the exact characters
 * that triggered it. Spans are sorted and clipped so overlapping detector hits
 * cannot corrupt the output.
 */
export function HighlightedText({
  text,
  spans,
  className,
  maxLength,
}: {
  text: string;
  spans: EvidenceSpan[];
  className?: string;
  maxLength?: number;
}) {
  const body = maxLength && text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

  const parts = React.useMemo(() => {
    const clipped = spans
      .filter((s) => s.start < body.length && s.end > s.start)
      .map((s) => ({ ...s, end: Math.min(s.end, body.length) }))
      .sort((a, b) => a.start - b.start);

    const out: Array<{ text: string; span?: EvidenceSpan }> = [];
    let cursor = 0;
    for (const s of clipped) {
      if (s.start < cursor) continue; // drop overlaps rather than nest them
      if (s.start > cursor) out.push({ text: body.slice(cursor, s.start) });
      out.push({ text: body.slice(s.start, s.end), span: s });
      cursor = s.end;
    }
    if (cursor < body.length) out.push({ text: body.slice(cursor) });
    return out;
  }, [body, spans]);

  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2",
        className,
      )}
    >
      {parts.map((p, i) =>
        p.span ? (
          <mark
            key={i}
            title={p.span.label}
            className={cn(
              "rounded-sm px-0.5",
              SPAN_TONE[p.span.severity ?? "high"],
            )}
          >
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </p>
  );
}

/** Monospace panel for prompts, payloads, JSON arguments and decoded content. */
export function CodePanel({
  children,
  label,
  copyValue,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  label?: string;
  copyValue?: string;
  className?: string;
  tone?: "neutral" | "danger" | "safe";
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silently ignore, this is a convenience only */
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        tone === "danger"
          ? "border-critical/30 bg-critical-dim/30"
          : tone === "safe"
            ? "border-allow/25 bg-allow-dim/30"
            : "border-line bg-inset",
        className,
      )}
    >
      {(label || copyValue) && (
        <div className="flex items-center justify-between border-b border-line/70 px-2.5 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
            {label}
          </span>
          {copyValue && (
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink-2"
            >
              {copied ? <Check className="size-3 text-allow" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      )}
      <div className="max-h-64 overflow-auto p-2.5">{children}</div>
    </div>
  );
}

/** Label/value row used throughout detail panes. */
export function KeyValue({
  label,
  children,
  mono,
  className,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <dt className="shrink-0 text-[11px] text-ink-4">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-xs text-ink-2",
          mono && "font-mono text-[11px]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
