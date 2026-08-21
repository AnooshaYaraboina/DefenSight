"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RiskPill } from "./risk-score";
import { formatRelative } from "@/lib/utils/format";

export interface ApprovalRow {
  id: string;
  requestedBy: string;
  reason: string;
  riskSummary: string;
  expiresAt: Date;
  createdAt: Date;
  toolCall: {
    id: string;
    operation: string;
    arguments: unknown;
    riskScore: number;
    tool: { name: string; slug: string; riskTier: number; category: string };
    agent: { name: string; slug: string };
    event: { id: string; ref: string; requestText: string; user: { name: string } | null } | null;
  };
}

/**
 * Human-in-the-loop approval queue (§14).
 *
 * Everything an approver needs sits on one card: what the agent wants to do,
 * with which arguments, why it was held, and what the user originally asked
 * for. Approving a tool call without seeing the originating request is how a
 * rubber-stamp culture starts.
 */
export function ApprovalQueue({ approvals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<{ id: string; decision: "APPROVED" | "DENIED" } | null>(null);
  const [justification, setJustification] = React.useState("");

  /*
   * "Expiring soon" depends on the current time, which the server and the
   * client do not agree on. Computing it during render produces a hydration
   * mismatch, so it is resolved after mount and refreshed each minute.
   *
   * Declared before any early return: hooks must run unconditionally.
   */
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(id);
      clearInterval(timer);
    };
  }, []);

  async function decide() {
    if (!pending) return;
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: pending.id, decision: pending.decision, justification }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Decision failed", { description: data.error });
      return;
    }
    toast.success(pending.decision === "APPROVED" ? "Tool call authorised" : "Tool call refused");
    setJustification("");
    router.refresh();
  }

  if (approvals.length === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title="No approvals waiting"
        description="High-impact tool calls stop here for a named human before they execute. Nothing is currently held."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {approvals.map((a) => {
          const expiring = now !== null && a.expiresAt.getTime() - now < 3600_000;
          return (
            <li
              key={a.id}
              className="overflow-hidden rounded-panel border border-approval/30 bg-approval-dim/15"
            >
              <div className="border-b border-line/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <UserCheck className="size-4 shrink-0 text-approval" />
                  <span className="text-sm font-medium text-ink">{a.toolCall.tool.name}</span>
                  <Badge tone="outline" size="xs">{a.toolCall.operation}</Badge>
                  <Badge tone={a.toolCall.tool.riskTier >= 5 ? "critical" : "high"} size="xs">
                    Tier {a.toolCall.tool.riskTier}
                  </Badge>
                  <RiskPill score={a.toolCall.riskScore} />
                  <span
                    className={cn(
                      "ml-auto flex items-center gap-1 text-[10px]",
                      expiring ? "text-high" : "text-ink-4",
                    )}
                  >
                    <Clock className="size-3" />
                    expires {formatRelative(a.expiresAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-2">{a.reason}</p>
              </div>

              <div className="grid gap-3 px-4 py-3 lg:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Requested by
                  </p>
                  <Link
                    href={`/agents/${a.toolCall.agent.slug}`}
                    className="text-[11px] text-ink-2 hover:text-brand-text"
                  >
                    {a.toolCall.agent.name}
                  </Link>
                  <p className="mt-0.5 text-[10px] text-ink-4">{a.riskSummary}</p>

                  {a.toolCall.event && (
                    <>
                      <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                        Originating request
                      </p>
                      <Link
                        href={`/monitor/${a.toolCall.event.id}`}
                        className="block rounded border border-line bg-surface px-2.5 py-2 transition-colors hover:border-line-strong"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-ink-4">
                            {a.toolCall.event.ref}
                          </span>
                          <span className="text-[10px] text-ink-3">
                            {a.toolCall.event.user?.name}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-ink-2">
                          {a.toolCall.event.requestText.slice(0, 180)}
                        </span>
                      </Link>
                    </>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Arguments to be executed
                  </p>
                  <pre className="max-h-40 overflow-auto rounded border border-line bg-inset px-2.5 py-2 font-mono text-[10px] leading-relaxed text-ink-2">
                    {JSON.stringify(a.toolCall.arguments, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line/60 px-4 py-2.5">
                <Button
                  variant="dangerOutline"
                  size="sm"
                  onClick={() => setPending({ id: a.id, decision: "DENIED" })}
                >
                  <X />
                  Refuse
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => setPending({ id: a.id, decision: "APPROVED" })}
                >
                  <Check />
                  Authorise
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => { if (!o) { setPending(null); setJustification(""); } }}
        destructive={pending?.decision === "APPROVED"}
        title={pending?.decision === "APPROVED" ? "Authorise this tool call?" : "Refuse this tool call?"}
        confirmLabel={pending?.decision === "APPROVED" ? "Authorise execution" : "Refuse"}
        onConfirm={decide}
        description={
          <div className="space-y-2.5">
            <p>
              {pending?.decision === "APPROVED"
                ? "The tool will execute with the arguments shown. Tier-5 actions are irreversible or externally visible once run."
                : "The agent will be told the action was refused. Nothing executes."}
            </p>
            <p className="text-ink-3">
              Your name and this decision are written to the audit log.
            </p>
            <div>
              <label htmlFor="justification" className="mb-1 block text-[11px] text-ink-3">
                Justification (optional)
              </label>
              <Textarea
                id="justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Why is this the right call?"
                className="min-h-16"
              />
            </div>
          </div>
        }
      />
    </>
  );
}
