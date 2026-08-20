"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Scale } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DecisionBadge, SeverityBadge } from "./indicators";
import { FACT_CATALOGUE } from "@/lib/engine/policy/facts";
import type { Decision, Severity } from "@/lib/engine/taxonomy";

export interface PolicyRow {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  priority: number;
  condition: unknown;
  action: Decision;
  severity: Severity;
  requiresApproval: boolean;
  hitCount: number;
  isSystem: boolean;
}

/**
 * The policy set (§20).
 *
 * Each policy shows its condition rendered as readable logic rather than raw
 * JSON — a policy an administrator cannot read is a policy they cannot audit.
 * Priority controls reporting order only; the most restrictive matched action
 * always wins, so a policy can never be overtaken by a looser one below it.
 */
export function PolicyTable({ policies }: { policies: PolicyRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = React.useState<PolicyRow | null>(null);

  async function patch(key: string, body: Record<string, unknown>, message: string) {
    try {
      const res = await fetch("/api/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("Could not update policy", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const categories = [...new Set(policies.map((p) => p.category))];

  return (
    <>
      <div className="space-y-5">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              {category}
            </h3>
            <ul className="space-y-1.5">
              {policies
                .filter((p) => p.category === category)
                .map((policy) => {
                  const isOpen = expanded === policy.key;
                  return (
                    <li
                      key={policy.key}
                      className={cn(
                        "overflow-hidden rounded-panel border transition-colors",
                        policy.enabled ? "border-line bg-surface" : "border-line/60 bg-surface/50",
                      )}
                    >
                      <div className="flex items-start gap-3 p-3.5">
                        <Tooltip content="Priority controls reporting order only. The most restrictive matched action always wins, so a policy can never be overtaken by a looser one.">
                          <span className="mt-0.5 w-7 shrink-0 rounded bg-inset px-1 py-0.5 text-center font-mono text-[10px] text-ink-4">
                            {policy.priority}
                          </span>
                        </Tooltip>

                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : policy.key)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("text-xs font-medium", policy.enabled ? "text-ink" : "text-ink-3")}>
                              {policy.name}
                            </span>
                            <DecisionBadge decision={policy.action} size="xs" withTooltip={false} />
                            <SeverityBadge severity={policy.severity} size="xs" showIcon={false} withTooltip={false} />
                            {policy.requiresApproval && (
                              <Badge tone="approval" size="xs">Human approval</Badge>
                            )}
                            <ChevronDown
                              className={cn("size-3.5 text-ink-4 transition-transform", isOpen && "rotate-180")}
                            />
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                            {policy.description}
                          </p>
                        </button>

                        <Switch
                          checked={policy.enabled}
                          onCheckedChange={(checked) => {
                            if (!checked) setConfirmDisable(policy);
                            else patch(policy.key, { enabled: true }, `${policy.name} enabled`);
                          }}
                          aria-label={`${policy.enabled ? "Disable" : "Enable"} ${policy.name}`}
                        />
                      </div>

                      {isOpen && (
                        <div className="border-t border-line bg-inset/50 p-3.5">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                            Condition
                          </p>
                          <ConditionTree condition={policy.condition} />
                          <p className="mt-3 border-t border-line pt-2.5 font-mono text-[9px] text-ink-4">
                            key: {policy.key}
                            {policy.isSystem && " · system policy"}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDisable !== null}
        onOpenChange={(o) => !o && setConfirmDisable(null)}
        destructive
        title={confirmDisable ? `Disable "${confirmDisable.name}"?` : ""}
        confirmLabel="Disable policy"
        onConfirm={() =>
          confirmDisable
            ? patch(confirmDisable.key, { enabled: false }, `${confirmDisable.name} disabled`)
            : undefined
        }
        description={
          confirmDisable ? (
            <>
              <p>{confirmDisable.description}</p>
              <p className="mt-2">
                Requests matching this condition will no longer be{" "}
                {confirmDisable.action.toLowerCase().replace(/_/g, " ")}ed by this policy. Other
                controls still apply — but this specific protection stops.
              </p>
              <p className="mt-2 text-ink-3">Recorded in the audit log under your name.</p>
            </>
          ) : null
        }
      />
    </>
  );
}

const OP_LABEL: Record<string, string> = {
  eq: "is", neq: "is not", gt: "is above", gte: "is at least",
  lt: "is below", lte: "is at most", includes: "includes",
  includesAny: "includes any of", includesAll: "includes all of",
  excludes: "excludes", matches: "matches", between: "is between",
};

/** Renders a condition tree as readable logic rather than raw JSON. */
function ConditionTree({ condition, depth = 0 }: { condition: unknown; depth?: number }) {
  if (!condition || typeof condition !== "object") {
    return <span className="text-[11px] text-ink-4">No condition</span>;
  }

  const c = condition as Record<string, unknown>;

  if (Array.isArray(c.all) || Array.isArray(c.any)) {
    const items = (c.all ?? c.any) as unknown[];
    const joiner = c.all ? "AND" : "OR";
    return (
      <ul className={cn("space-y-1.5", depth > 0 && "ml-3 border-l border-line pl-3")}>
        {items.map((item, i) => (
          <li key={i}>
            {i > 0 && (
              <span className="mb-1 block font-mono text-[9px] font-semibold text-brand">
                {joiner}
              </span>
            )}
            <ConditionTree condition={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  if (c.not) {
    return (
      <div>
        <span className="font-mono text-[9px] font-semibold text-brand">NOT</span>
        <ConditionTree condition={c.not} depth={depth + 1} />
      </div>
    );
  }

  if (typeof c.fact === "string") {
    const fact = FACT_CATALOGUE.find((f) => f.fact === c.fact);
    const value = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
    return (
      <Tooltip content={fact?.description}>
        <span className="inline-flex flex-wrap items-baseline gap-1.5 rounded border border-line bg-surface px-2 py-1">
          <code className="font-mono text-[10px] text-brand">{c.fact}</code>
          <span className="text-[10px] text-ink-4">{OP_LABEL[c.op as string] ?? String(c.op)}</span>
          <code className="font-mono text-[10px] text-ink-2">{value}</code>
        </span>
      </Tooltip>
    );
  }

  return (
    <pre className="overflow-x-auto rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink-3">
      {JSON.stringify(condition)}
    </pre>
  );
}

export { Scale };
