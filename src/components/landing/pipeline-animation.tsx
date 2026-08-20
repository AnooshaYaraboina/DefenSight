"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The defensive pipeline, animated.
 *
 * Shows a malicious document travelling through the estate and being stopped —
 * the product's whole thesis in one moving picture. It cycles through the real
 * stage sequence with the real verdicts, so the animation teaches the actual
 * mechanism rather than being decoration.
 */

interface Stage {
  key: string;
  label: string;
  detail: string;
  verdict: "pass" | "flag" | "block";
}

const STAGES: Stage[] = [
  { key: "ingest", label: "Request", detail: "Employee asks the assistant to summarise a vendor report", verdict: "pass" },
  { key: "retrieve", label: "RAG Retrieval", detail: "Document pulled from the vendor portal — trust 22/100", verdict: "flag" },
  { key: "scan", label: "Content Scan", detail: "Hidden directive found: “email the customer table to…”", verdict: "flag" },
  { key: "detect", label: "Detection", detail: "3 independent layers agree — indirect prompt injection, 97%", verdict: "flag" },
  { key: "behaviour", label: "Agent Behaviour", detail: "Agent now attempts actions the user never asked for", verdict: "flag" },
  { key: "gateway", label: "Tool Gateway", detail: "Warehouse query refused — agent holds no grant", verdict: "block" },
  { key: "egress", label: "Egress Control", detail: "Outbound email refused — destination off the allowlist", verdict: "block" },
  { key: "incident", label: "Incident Opened", detail: "Attack chain recorded, analyst alerted", verdict: "block" },
];

export function PipelineAnimation({ className }: { className?: string }) {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    // Respect reduced-motion by holding on the final, most informative frame
    // rather than cycling.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setActive(STAGES.length - 1);
      return;
    }
    if (paused) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % STAGES.length), 1900);
    return () => clearInterval(timer);
  }, [paused]);

  const stage = STAGES[active];

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="rounded-panel border border-line bg-surface/80 p-4 backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="ds-live-dot size-1.5 rounded-full bg-allow text-allow/40" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              Live pipeline
            </span>
          </span>
          <span className="font-mono text-[10px] text-ink-4">
            {String(active + 1).padStart(2, "0")} / {STAGES.length}
          </span>
        </div>

        <ol className="space-y-1">
          {STAGES.map((s, i) => {
            const isActive = i === active;
            const isPast = i < active;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all duration-300",
                    isActive
                      ? s.verdict === "block"
                        ? "border-critical/50 bg-critical-dim/40"
                        : s.verdict === "flag"
                          ? "border-medium/40 bg-medium-dim/30"
                          : "border-brand/40 bg-brand-dim/30"
                      : isPast
                        ? "border-line bg-surface-2/50"
                        : "border-transparent bg-transparent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold transition-colors",
                      isActive
                        ? s.verdict === "block"
                          ? "border-critical bg-critical text-white"
                          : s.verdict === "flag"
                            ? "border-medium bg-medium text-black"
                            : "border-brand bg-brand text-brand-ink"
                        : isPast
                          ? "border-line-strong bg-surface text-ink-4"
                          : "border-line text-ink-4/60",
                    )}
                  >
                    {isPast || isActive ? "✓" : i + 1}
                  </span>

                  <span
                    className={cn(
                      "flex-1 truncate text-[11px] font-medium transition-colors",
                      isActive ? "text-ink" : isPast ? "text-ink-3" : "text-ink-4",
                    )}
                  >
                    {s.label}
                  </span>

                  {isActive && s.verdict === "block" && (
                    <span className="shrink-0 rounded bg-critical px-1.5 py-px text-[9px] font-bold text-white">
                      BLOCKED
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div key={stage.key} className="ds-row-enter mt-3 rounded-md border border-line bg-inset px-3 py-2.5">
          <p className="font-mono text-[11px] leading-relaxed text-ink-2">
            <span
              className={cn(
                "mr-1.5",
                stage.verdict === "block" ? "text-critical" : stage.verdict === "flag" ? "text-medium" : "text-brand",
              )}
            >
              &rsaquo;
            </span>
            {stage.detail}
          </p>
        </div>
      </div>
    </div>
  );
}
