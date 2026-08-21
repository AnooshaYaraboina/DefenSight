import * as React from "react";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/assistant/history";

/**
 * A past conversation, replayed as text.
 *
 * It sits in the column the live workflow checklist normally occupies, so
 * opening history never rearranges the stage — Sentry stays exactly where it
 * was and the panel beside it changes contents.
 */
export function Transcript({ session, className }: { session: Session; className?: string }) {
  return (
    <div className={cn("ds-panel min-h-0 overflow-y-auto", className)}>
      <div className="sticky top-0 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
        <p className="ds-eyebrow">Earlier conversation</p>
        <p className="mt-1 truncate text-[11px] text-ink-3">{session.title}</p>
      </div>

      <ol className="space-y-3 p-3">
        {session.turns.map((turn) => (
          <li key={turn.id} className="space-y-1.5">
            {turn.user && (
              <p className="ml-auto w-fit max-w-[90%] rounded-lg rounded-br-sm bg-brand-dim/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink ring-1 ring-inset ring-brand/20">
                {turn.user}
              </p>
            )}

            {turn.lines.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "w-fit max-w-[92%] rounded-lg rounded-tl-sm border px-2.5 py-1.5 text-[11px] leading-relaxed",
                  line.tone === "alarm" && "border-critical/30 bg-critical-dim/25 text-critical",
                  line.tone === "good" && "border-allow/30 bg-allow-dim/25 text-allow",
                  line.tone === "ask" && "border-medium/30 bg-medium-dim/25 text-medium",
                  line.tone === "neutral" && "border-line bg-surface-2/50 text-ink-2",
                )}
              >
                {line.text}
              </p>
            ))}

            {turn.workflow && (
              <div className="ds-well px-2.5 py-2">
                <p className="ds-eyebrow">{turn.workflow.title}</p>
                <ul className="mt-1.5 space-y-1">
                  {turn.workflow.steps.map((s) => (
                    <li key={s.label} className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "size-1 shrink-0 translate-y-[-2px] rounded-full",
                          s.status === "applied" || s.status === "done" ? "bg-allow"
                            : s.status === "failed" ? "bg-critical"
                            : s.status === "awaiting" ? "bg-medium"
                            : "bg-ink-4",
                        )}
                      />
                      <span className="text-[10px] text-ink-3">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
