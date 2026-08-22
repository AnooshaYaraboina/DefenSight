"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Ban, CornerDownRight, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One request, opened.
 *
 * This is the half of the wall that did not exist. The old dashboard could tell
 * you that something was blocked and roughly where; it could never show what
 * was asked, what each defensive stage made of it, or what came back. Those
 * three things are the product's whole argument, and they were only reachable
 * two navigations away.
 *
 * Input at the top, the pipeline in the middle, output at the bottom — read
 * top to bottom and you have the request's entire life. The stage that stopped
 * it is marked, because "where did this die" is the first question anyone asks.
 *
 * The response is shown redacted wherever redaction ran. Printing the raw value
 * next to a note saying it was masked would be the leak the pipeline just
 * prevented.
 */

interface Stage {
  stage: string;
  label: string;
  summary: string;
  decision?: string;
  severity?: string;
  durationMs?: number;
  interventionPoint?: boolean;
}

interface Detail {
  id: string;
  ref: string;
  at: string;
  user: string;
  application: string;
  agent: string | null;
  request: string;
  response: string | null;
  responseWasRedacted: boolean;
  decision: string;
  severity: string;
  riskScore: number;
  blocked: boolean;
  threatTypes: string[];
  stages: Stage[];
  latencyMs: number;
  incident: { id: string; ref: string } | null;
}

const DECISION_TONE: Record<string, string> = {
  BLOCK: "border-critical/40 bg-critical-dim text-critical",
  REDACT: "border-redact/40 bg-redact-dim text-redact",
  REQUIRE_APPROVAL: "border-approval/40 bg-approval-dim text-approval",
  WARN: "border-warn/40 bg-warn-dim text-warn",
  ALLOW: "border-allow/40 bg-allow-dim text-allow",
};

function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-4">
        {label}
      </p>
      {children}
    </div>
  );
}

export function Inspector({
  eventId,
  className,
}: {
  eventId: string | null;
  className?: string;
}) {
  const [loaded, setLoaded] = React.useState<Detail | null>(null);
  const [failedId, setFailedId] = React.useState<string | null>(null);

  /* State is written only from the fetch callbacks. Clearing it synchronously
     when the selection changes would set state in the effect body and cascade
     a render; instead the three view states are derived below from whether the
     loaded record matches the id being asked for. */
  React.useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    fetch(`/api/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Detail) => {
        if (!cancelled) setLoaded(d);
      })
      .catch(() => {
        if (!cancelled) setFailedId(eventId);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const detail = loaded && loaded.id === eventId ? loaded : null;
  const failed = eventId !== null && failedId === eventId;
  const loading = eventId !== null && !detail && !failed;

  return (
    <section
      className={cn("ds-panel flex min-h-0 flex-col overflow-hidden", className)}
      aria-label="Request detail"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          Inspector
        </h2>
        {detail && (
          <Link
            href={`/monitor/${detail.id}`}
            className="flex items-center gap-1 font-mono text-[9.5px] text-brand-text hover:underline"
          >
            Full attack chain
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </header>

      {!eventId && (
        <p className="px-3.5 py-6 text-[12px] leading-relaxed text-ink-4">
          Select a request from the flow to see what was asked, what each defensive stage made
          of it, and what came back.
        </p>
      )}

      {loading && <p className="px-3.5 py-6 font-mono text-[11px] text-ink-4">Loading…</p>}

      {failed && (
        <p className="px-3.5 py-6 text-[12px] text-ink-4">
          That request could not be loaded. It may have been pruned from the window.
        </p>
      )}

      {detail && (
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
          {/* ------------------------------------------------------ verdict */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide",
                DECISION_TONE[detail.decision] ?? DECISION_TONE.ALLOW,
              )}
            >
              {detail.decision.replace(/_/g, " ").toLowerCase()}
            </span>
            <span className="font-mono text-[10px] text-ink-4">
              risk {detail.riskScore}/100 · {detail.severity.toLowerCase()} · {detail.latencyMs}ms
            </span>
            <span className="ml-auto font-mono text-[9.5px] text-ink-4">{detail.ref}</span>
          </div>

          <p className="font-mono text-[9.5px] text-ink-4">
            {detail.application}
            {detail.agent ? ` › ${detail.agent}` : ""} · {detail.user}
          </p>

          {detail.threatTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.threatTypes.map((t) => (
                <span
                  key={t}
                  className="rounded border border-critical/30 bg-critical-dim/50 px-1.5 py-0.5 font-mono text-[9px] text-critical"
                >
                  {t.toLowerCase().replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* -------------------------------------------------------- input */}
          <Section label="Input — what was asked">
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-inset px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
              {detail.request}
            </p>
          </Section>

          {/* ------------------------------------------------------ pipeline */}
          <Section label={`Pipeline — ${detail.stages.length} stages`}>
            <ol className="space-y-0.5">
              {detail.stages.map((s, i) => (
                <li
                  key={`${s.stage}-${i}`}
                  className={cn(
                    "flex gap-2 rounded px-2 py-1.5",
                    s.interventionPoint && "border border-critical/40 bg-critical-dim/40",
                  )}
                >
                  <span className="mt-px w-4 shrink-0 font-mono text-[9px] tabular text-ink-4">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          s.interventionPoint ? "text-critical" : "text-ink-2",
                        )}
                      >
                        {s.label}
                      </span>
                      {s.interventionPoint && (
                        <span className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-wide text-critical">
                          <Ban className="size-2.5" />
                          stopped here
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-4">
                      {s.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          {/* ------------------------------------------------------- output */}
          <Section label="Output — what came back">
            {detail.blocked ? (
              <p className="flex items-start gap-2 rounded border border-critical/30 bg-critical-dim/30 px-2.5 py-2 text-[11px] leading-relaxed text-critical">
                <Ban className="mt-0.5 size-3.5 shrink-0" />
                Blocked before the model ran. No response was generated, so nothing reached the
                user.
              </p>
            ) : detail.response ? (
              <>
                {detail.responseWasRedacted && (
                  <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[9.5px] text-redact">
                    <EyeOff className="size-3" />
                    Sensitive values masked before delivery — this is what the user saw.
                  </p>
                )}
                <p className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-inset px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
                  {detail.response}
                </p>
              </>
            ) : (
              <p className="flex items-start gap-2 rounded border border-line bg-surface-2/60 px-2.5 py-2 text-[11px] leading-relaxed text-ink-4">
                <CornerDownRight className="mt-0.5 size-3.5 shrink-0" />
                No response recorded for this request.
              </p>
            )}
          </Section>

          {detail.incident ? (
            <Link
              href={`/incidents/${detail.incident.id}`}
              className="flex items-center gap-2 rounded border border-critical/30 bg-critical-dim/25 px-2.5 py-2 text-[11px] text-critical transition-colors hover:border-critical/60"
            >
              <ShieldCheck className="size-3.5 shrink-0" />
              Opened incident {detail.incident.ref}
              <ArrowUpRight className="ml-auto size-3" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
