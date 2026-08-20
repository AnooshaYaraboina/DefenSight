"use client";

import * as React from "react";
import {
  Ban, ChevronDown, CircleCheck, CircleDot, ShieldAlert, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils/format";
import { DECISION_META, STAGE_META, type Decision, type PipelineStage } from "@/lib/engine/taxonomy";
import { DecisionBadge } from "./indicators";

export interface ChainStage {
  stage: PipelineStage;
  label: string;
  summary: string;
  decision?: Decision;
  durationMs: number;
  details?: Record<string, unknown>;
  interventionPoint?: boolean;
}

/**
 * The attack chain (§18).
 *
 * A vertical spine with one node per pipeline stage, showing what was known at
 * each point and what the platform did about it. The intervention point — where
 * the attack was actually stopped — is called out explicitly, because "we
 * blocked it" is not useful to an analyst without "and here is exactly where".
 *
 * Stages expand to reveal the evidence the engine recorded. Nothing is
 * summarised away: an investigation that cannot reach the underlying evidence
 * is a story, not an analysis.
 */
export function AttackChain({
  stages,
  className,
  defaultExpanded,
}: {
  stages: ChainStage[];
  className?: string;
  defaultExpanded?: PipelineStage[];
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(defaultExpanded ?? stages.filter((s) => s.interventionPoint).map((s) => s.stage)),
  );

  const toggle = (stage: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });

  return (
    <ol className={cn("relative", className)}>
      {stages.map((stage, index) => {
        const isOpen = expanded.has(stage.stage);
        const isLast = index === stages.length - 1;
        const acted = stage.decision && stage.decision !== "ALLOW";
        const hasDetails = stage.details && Object.keys(stage.details).length > 0;

        return (
          <li key={`${stage.stage}-${index}`} className="relative pl-8">
            {/* Spine */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[11px] top-6 w-px",
                  acted ? "bg-critical/40" : "bg-line",
                )}
                style={{ height: "calc(100% - 0.5rem)" }}
              />
            )}

            {/* Node */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1.5 flex size-[23px] items-center justify-center rounded-full border-2",
                stage.interventionPoint
                  ? "border-critical bg-critical-dim text-critical"
                  : acted
                    ? "border-medium/60 bg-medium-dim text-medium"
                    : "border-line-strong bg-surface text-ink-4",
              )}
            >
              {stage.interventionPoint ? (
                <Ban className="size-3" />
              ) : acted ? (
                <ShieldAlert className="size-3" />
              ) : (
                <CircleCheck className="size-3" />
              )}
            </span>

            <div className={cn("pb-4", isLast && "pb-0")}>
              <button
                type="button"
                onClick={() => hasDetails && toggle(stage.stage)}
                disabled={!hasDetails}
                className={cn(
                  "group w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  stage.interventionPoint
                    ? "border-critical/40 bg-critical-dim/30"
                    : "border-line bg-surface-2/40",
                  hasDetails && "hover:border-line-strong hover:bg-surface-2 cursor-pointer",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ink">{stage.label}</span>
                  {stage.interventionPoint && (
                    <span className="inline-flex items-center gap-1 rounded bg-critical px-1.5 py-px text-[10px] font-semibold text-white">
                      <Zap className="size-2.5" />
                      ATTACK STOPPED HERE
                    </span>
                  )}
                  {stage.decision && stage.decision !== "ALLOW" && !stage.interventionPoint && (
                    <DecisionBadge decision={stage.decision} size="xs" withTooltip={false} />
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-4">
                      {formatDuration(stage.durationMs)}
                    </span>
                    {hasDetails && (
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-ink-4 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    )}
                  </span>
                </div>

                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{stage.summary}</p>
              </button>

              {isOpen && hasDetails && (
                <div className="mt-1.5 rounded-md border border-line bg-inset p-3">
                  <StageDetails details={stage.details!} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Renders stage evidence.
 *
 * Stage details are heterogeneous by design — each stage records what is
 * meaningful for it — so this walks the structure rather than assuming a fixed
 * shape, and falls back to formatted JSON only where the data genuinely has no
 * better presentation.
 */
function StageDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );

  return (
    <dl className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
            {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
          </dt>
          <dd className="text-[11px] text-ink-2">
            <DetailValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-medium" : "text-ink-3"}>{value ? "yes" : "no"}</span>
    );
  }
  if (typeof value === "number" || typeof value === "string") {
    return <span className="font-mono text-[11px]">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return (
        <span className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="rounded bg-surface-2 px-1.5 py-px font-mono text-[10px] text-ink-2">
              {String(v)}
            </span>
          ))}
        </span>
      );
    }
    return (
      <ul className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="rounded border border-line bg-surface px-2 py-1.5">
            <DetailValue value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === "object") {
    return (
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-[10px] text-ink-4">{k}</dt>
            <dd className="min-w-0 break-words font-mono text-[10px] text-ink-2">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <span className="text-ink-4">—</span>;
}

/** Compact horizontal variant for incident cards and list views. */
export function AttackChainStrip({
  stages,
  className,
}: {
  stages: ChainStage[];
  className?: string;
}) {
  const significant = stages.filter(
    (s) => s.interventionPoint || (s.decision && s.decision !== "ALLOW") || s.stage === "INGEST",
  );
  const shown = significant.length >= 3 ? significant : stages.slice(0, 6);

  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-1.5", className)}>
      {shown.map((stage, i) => (
        <React.Fragment key={`${stage.stage}-${i}`}>
          {i > 0 && <li aria-hidden="true" className="text-ink-4">→</li>}
          <li
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
              stage.interventionPoint
                ? "border-critical/40 bg-critical-dim text-critical"
                : stage.decision && stage.decision !== "ALLOW"
                  ? "border-medium/35 bg-medium-dim text-medium"
                  : "border-line bg-surface-2 text-ink-3",
            )}
          >
            {stage.interventionPoint ? <Ban className="size-2.5" /> : <CircleDot className="size-2.5" />}
            {STAGE_META[stage.stage]?.label ?? stage.label}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

export { DECISION_META };
