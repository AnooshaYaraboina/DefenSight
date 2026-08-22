"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { RecentRequest } from "@/lib/queries/warroom";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";

/**
 * The flow.
 *
 * Every request through the pipeline, newest first, showing the thing itself.
 * The wall previously identified traffic by category — "RAG Poisoning → Atlas
 * Document Summar…" — which tells an analyst what kind of thing happened
 * without ever showing what was said. A verdict you cannot read is a verdict
 * you have to take on trust.
 *
 * Each row carries the prompt, who sent it, the decision, and the stage that
 * stopped it. Selecting one opens it in the inspector alongside.
 *
 * Live events carry the prompt and the stage that stopped them, but not the
 * full trace — the bus sends a summary, not the whole analysis — so the
 * inspector fetches the rest on selection.
 */

const DECISION_TONE: Record<string, string> = {
  BLOCK: "border-critical/40 bg-critical-dim text-critical",
  REDACT: "border-redact/40 bg-redact-dim text-redact",
  REQUIRE_APPROVAL: "border-approval/40 bg-approval-dim text-approval",
  WARN: "border-warn/40 bg-warn-dim text-warn",
  ALLOW: "border-line-strong bg-surface-2 text-ink-4",
};

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: "bg-critical",
  HIGH: "bg-high",
  MEDIUM: "bg-medium",
  LOW: "bg-low",
  INFO: "bg-line-strong",
};

export interface FlowRow {
  id: string;
  at: string;
  user: string;
  application: string;
  agent: string | null;
  request: string;
  decision: string;
  severity: string;
  riskScore: number;
  threats: string[];
  stoppedAt: string | null;
  live: boolean;
}

/** Live bus events and server rows are the same thing wearing different shapes. */
export function toFlowRows(seed: RecentRequest[], live: LiveSecurityEvent[]): FlowRow[] {
  const fromLive: FlowRow[] = live.map((e) => ({
    id: e.id,
    at: e.createdAt,
    user: e.user,
    application: e.application,
    agent: e.agent ?? null,
    request: e.request,
    decision: e.decision,
    severity: e.severity,
    riskScore: e.riskScore,
    threats: e.threatTypes,
    stoppedAt: e.stoppedAt ?? null,
    live: true,
  }));

  const fromSeed: FlowRow[] = seed.map((r) => ({
    id: r.id,
    at: typeof r.at === "string" ? r.at : r.at.toISOString(),
    user: r.user,
    application: r.application,
    agent: r.agent,
    request: r.request,
    decision: r.decision,
    severity: r.severity,
    riskScore: r.riskScore,
    threats: r.threats,
    stoppedAt: r.stoppedAt,
    live: false,
  }));

  /* A live event can also be in the server-rendered seed: the bus replays and
     the page was queried from the same rows. Newest copy wins. */
  return [...fromLive, ...fromSeed]
    .filter((row, i, all) => all.findIndex((o) => o.id === row.id) === i)
    .slice(0, 60);
}

function clock(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("en-GB", { hour12: false });
}

export function Flow({
  rows,
  selectedId,
  onSelect,
  className,
}: {
  rows: FlowRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <section
      className={cn("ds-panel flex min-h-0 flex-col overflow-hidden", className)}
      aria-label="Request flow"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          The flow
        </h2>
        <p className="truncate font-mono text-[9.5px] text-ink-4">
          every request as the pipeline judged it · select one to open it
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="px-3.5 py-6 text-[12px] text-ink-4">
          No traffic yet. Press Burst to push requests through the pipeline.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {rows.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  aria-current={active}
                  className={cn(
                    "group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand/60",
                    active ? "bg-brand-dim/35" : "hover:bg-surface-2/70",
                  )}
                >
                  {/* severity as a rail, so the eye can scan the column alone */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 h-8 w-0.5 shrink-0 rounded-full",
                      SEVERITY_BAR[r.severity] ?? "bg-line-strong",
                    )}
                  />

                  <span className="mt-0.5 w-[58px] shrink-0 font-mono text-[10px] tabular text-ink-4">
                    {clock(r.at)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] leading-snug text-ink-2 group-hover:text-ink">
                      {r.request || <span className="text-ink-4">(empty prompt)</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9.5px] text-ink-4">
                      <span className="truncate">{r.application}</span>
                      {r.agent && (
                        <>
                          <span aria-hidden="true">›</span>
                          <span className="truncate">{r.agent}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{r.user}</span>
                      {r.stoppedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-critical">stopped at {r.stoppedAt}</span>
                        </>
                      )}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span className="w-7 text-right font-mono text-[10px] tabular text-ink-4">
                      {r.riskScore}
                    </span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide",
                        DECISION_TONE[r.decision] ?? DECISION_TONE.ALLOW,
                      )}
                    >
                      {r.decision === "REQUIRE_APPROVAL" ? "approval" : r.decision.toLowerCase()}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
