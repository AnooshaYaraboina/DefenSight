"use client";

import * as React from "react";
import { Check, ChevronDown, ShieldX, UserCheck, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DecisionBadge } from "./indicators";
import { RiskPill } from "./risk-score";
import { CodePanel } from "./evidence";
import type { Decision, Severity } from "@/lib/engine/taxonomy";

export interface ToolCallRow {
  id: string;
  operation: string;
  arguments: unknown;
  decision: string;
  riskScore: number;
  checks: unknown;
  reason: string;
  executed: boolean;
  durationMs: number | null;
  tool: { name: string; slug: string; category: string; riskTier: number };
  approval?: { status: string; expiresAt: Date } | null;
}

interface Check {
  check: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: Severity;
}

/**
 * Tool gateway decisions for one request (§14).
 *
 * Shows every check the gateway ran, not just the failing ones. An analyst
 * asking "why was this allowed?" needs the same evidence as one asking "why was
 * this blocked?" — a gateway that only explains its refusals is unauditable.
 */
export function ToolCallList({ calls }: { calls: ToolCallRow[] }) {
  if (calls.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-ink-4">
        This request proposed no tool calls.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {calls.map((call) => (
        <ToolCallItem key={call.id} call={call} />
      ))}
    </ul>
  );
}

function ToolCallItem({ call }: { call: ToolCallRow }) {
  const [open, setOpen] = React.useState(call.decision === "BLOCK");
  const checks = (Array.isArray(call.checks) ? call.checks : []) as Check[];
  const failed = checks.filter((c) => !c.passed);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-md border",
        call.decision === "BLOCK"
          ? "border-critical/35 bg-critical-dim/20"
          : call.decision === "REQUIRE_APPROVAL"
            ? "border-approval/35 bg-approval-dim/20"
            : "border-line bg-surface-2/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2.5 text-left transition-colors hover:bg-surface-2/60"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Wrench className="size-3.5 shrink-0 text-ink-4" />
          <span className="text-xs font-medium text-ink-2">{call.tool.name}</span>
          <Badge tone="outline" size="xs">{call.operation}</Badge>
          <Badge tone={call.tool.riskTier >= 5 ? "critical" : call.tool.riskTier >= 4 ? "high" : "neutral"} size="xs">
            Tier {call.tool.riskTier}
          </Badge>
          <span className="ml-auto flex items-center gap-2">
            <RiskPill score={call.riskScore} />
            <DecisionBadge decision={call.decision as Decision} size="xs" withTooltip={false} />
            <ChevronDown className={cn("size-3.5 text-ink-4 transition-transform", open && "rotate-180")} />
          </span>
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{call.reason}</p>

        {failed.length > 0 && (
          <p className="mt-1.5 font-mono text-[10px] text-critical">
            {failed.length} of {checks.length} gateway checks failed
          </p>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-line bg-inset/50 p-3">
          <CodePanel label="Arguments" copyValue={JSON.stringify(call.arguments, null, 2)}>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-2">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </CodePanel>

          {checks.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Gateway checks
              </p>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li
                    key={c.check}
                    className={cn(
                      "flex items-start gap-2 rounded border px-2 py-1.5",
                      c.passed
                        ? "border-line bg-surface"
                        : "border-critical/30 bg-critical-dim/30",
                    )}
                  >
                    {c.passed ? (
                      <Check className="mt-0.5 size-3 shrink-0 text-allow" />
                    ) : (
                      <X className="mt-0.5 size-3 shrink-0 text-critical" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("text-[11px] font-medium", c.passed ? "text-ink-3" : "text-critical")}>
                          {c.label}
                        </span>
                        {!c.passed && (
                          <Badge tone={c.severity === "CRITICAL" ? "critical" : c.severity === "HIGH" ? "high" : "medium"} size="xs">
                            {c.severity}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-4">
                        {c.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {call.approval && (
            <div className="flex items-center gap-2 rounded border border-approval/30 bg-approval-dim/30 px-2.5 py-2">
              <UserCheck className="size-3.5 text-approval" />
              <span className="text-[11px] text-ink-2">
                Held for human authorisation — status {call.approval.status.toLowerCase()}
              </span>
            </div>
          )}

          {!call.executed && call.decision === "BLOCK" && (
            <p className="flex items-center gap-1.5 text-[11px] text-critical">
              <ShieldX className="size-3.5" />
              This tool was never executed. The gateway refused it before the call left the agent.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
