import Link from "next/link";
import { Globe, KeyRound, ShieldCheck, UserCheck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getTools } from "@/lib/queries/estate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { MetricStrip } from "@/components/security/metric-strip";
import { ApprovalQueue } from "@/components/security/approval-queue";
import { CompositionBar } from "@/components/charts/bar-charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool Gateway" };

const TIER_NOTE: Record<number, string> = {
  1: "Benign lookup. No side effects.",
  2: "Read access to internal data.",
  3: "Broad read, or a write with a narrow blast radius.",
  4: "Modifies business data. Reversible with effort.",
  5: "Irreversible or externally visible. Always requires human authorisation.",
};

export default async function ToolsPage() {
  const { tools, approvals } = await getTools();

  const totals = tools.reduce(
    (acc, t) => ({
      calls: acc.calls + t.calls,
      blocked: acc.blocked + t.blocked,
      allowed: acc.allowed + t.allowed,
      held: acc.held + t.pendingApproval,
    }),
    { calls: 0, blocked: 0, allowed: 0, held: 0 },
  );

  return (
    <>
      <PageHeader
        title="Tool Security Gateway"
        description="Every tool invocation is authorised before it executes. The gateway defaults closed — a tool an agent was never granted is refused, however the request is framed."
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          {
            label: "Registered Tools",
            value: tools.length,
            hint: "Capabilities available to agents, each with its own risk tier.",
          },
          {
            label: "Calls Evaluated (7d)",
            value: totals.calls,
            hint: "Tool requests that passed through the gateway.",
          },
          {
            label: "Calls Refused",
            value: totals.blocked,
            polarity: "higher-is-worse",
            hint: "Requests the gateway denied before execution.",
          },
          {
            label: "Awaiting Approval",
            value: approvals.length,
            polarity: "higher-is-worse",
            hint: "High-impact actions held for a named human.",
            href: "#approvals",
          },
        ]}
      />

      <Tabs defaultValue={approvals.length > 0 ? "approvals" : "catalogue"}>
        <TabsList className="mb-4">
          <TabsTrigger value="catalogue">
            <Wrench />
            Tool catalogue
            <Badge tone="neutral" size="xs">{tools.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <UserCheck />
            Approval queue
            {approvals.length > 0 && <Badge tone="approval" size="xs">{approvals.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue">
          <div className="mb-4">
            <Card className="p-4">
              <div className="mb-2.5">
                <h3 className="text-[13px] font-semibold tracking-tight text-ink">
                  Gateway decisions
                </h3>
                <p className="mt-0.5 text-[11px] text-ink-4">
                  Across all {totals.calls.toLocaleString()} tool calls in the last 7 days.
                </p>
              </div>
              <CompositionBar
                segments={[
                  { label: "Executed", value: totals.allowed, color: "var(--color-viz-allow)" },
                  { label: "Held for approval", value: totals.held, color: "var(--color-viz-1)" },
                  { label: "Refused", value: totals.blocked, color: "var(--color-viz-block)" },
                ]}
              />
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {tools.map((tool) => (
              <Card
                key={tool.id}
                className={tool.riskTier >= 5 ? "border-critical/25 p-4" : "p-4"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2.5">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                      <Wrench className="size-4 text-brand" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-ink">{tool.name}</h3>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-4">
                        {tool.category.toLowerCase()} · {tool.operations.join(", ")}
                      </p>
                    </div>
                  </div>
                  <Tooltip content={TIER_NOTE[tool.riskTier]}>
                    <Badge
                      tone={tool.riskTier >= 5 ? "critical" : tool.riskTier >= 4 ? "high" : tool.riskTier >= 3 ? "medium" : "neutral"}
                      size="xs"
                    >
                      Tier {tool.riskTier}
                    </Badge>
                  </Tooltip>
                </div>

                <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">{tool.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {tool.requiresApproval && (
                    <Tooltip content="Every call to this tool stops for a named human before it executes.">
                      <Badge tone="approval" size="xs">
                        <UserCheck />
                        Human approval
                      </Badge>
                    </Tooltip>
                  )}
                  {tool.allowedDomains && (
                    <Tooltip content={`Egress restricted to: ${tool.allowedDomains.join(", ")}`}>
                      <Badge tone="brand" size="xs">
                        <Globe />
                        {tool.allowedDomains.length} allowed domain
                        {tool.allowedDomains.length === 1 ? "" : "s"}
                      </Badge>
                    </Tooltip>
                  )}
                  {tool.parameterSchema ? (
                    <Tooltip content="Arguments are validated against a declared schema before execution, not after.">
                      <Badge tone="allow" size="xs">
                        <ShieldCheck />
                        Schema enforced
                      </Badge>
                    </Tooltip>
                  ) : null}
                  <Badge tone="outline" size="xs">{tool.rateLimitPerMinute}/min</Badge>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-2.5">
                  <Stat label="Calls" value={tool.calls} />
                  <Stat label="Executed" value={tool.allowed} />
                  <Stat label="Refused" value={tool.blocked} tone={tool.blocked > 0 ? "critical" : undefined} />
                  <Stat label="Granted to" value={tool.grantedTo.length} />
                </dl>

                {tool.grantedTo.length > 0 && (
                  <div className="mt-3 border-t border-line pt-2.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                      <KeyRound className="size-3" />
                      Granted agents
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tool.grantedTo.map((g) => (
                        <Link
                          key={g.slug}
                          href={`/agents/${g.slug}`}
                          className={
                            g.denied
                              ? "rounded border border-critical/30 bg-critical-dim px-1.5 py-0.5 text-[10px] text-critical line-through"
                              : "rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3 transition-colors hover:border-brand/40 hover:text-brand-text"
                          }
                        >
                          {g.agent}
                          <span className="ml-1 font-mono text-[9px] text-ink-4">
                            {g.operations.join("/")}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="approvals" id="approvals">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Human authorisation queue</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Calls held because their effect is irreversible or leaves the trust boundary.
                  Approving does not bypass a failed gateway check — those were refused before
                  reaching this queue.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ApprovalQueue approvals={approvals} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "critical" }) {
  return (
    <div>
      <dt className="text-[10px] text-ink-4">{label}</dt>
      <dd
        className={
          tone === "critical"
            ? "mt-0.5 font-mono text-sm font-semibold tabular text-critical"
            : "mt-0.5 font-mono text-sm font-semibold tabular text-ink-2"
        }
      >
        {value}
      </dd>
    </div>
  );
}
