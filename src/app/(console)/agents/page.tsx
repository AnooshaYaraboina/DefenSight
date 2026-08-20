import Link from "next/link";
import { Bot, KeyRound, ShieldAlert, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getAgents } from "@/lib/queries/estate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { StatTile } from "@/components/security/stat-tile";
import { ClassificationBadge } from "@/components/security/indicators";
import { formatRelative } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent Security" };

const RISK_TONE = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;

export default async function AgentsPage() {
  const agents = await getAgents();

  const highRisk = agents.filter((a) => a.riskLevel === "CRITICAL" || a.riskLevel === "HIGH").length;
  const findings = agents.reduce((s, a) => s + a.unusedPermissions, 0);
  const denied = agents.reduce((s, a) => s + a.deniedCalls, 0);

  return (
    <>
      <PageHeader
        title="Agent Security"
        description="Every agent's permissions, behaviour and posture. An agent's grants define its blast radius if it is ever manipulated — so the grants matter as much as the guardrails."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Agents Monitored" value={agents.length} hint="Registered agents across all AI applications." />
        <StatTile label="High-Risk Agents" value={highRisk} polarity="higher-is-worse" hint="Agents rated high or critical risk by observed behaviour." />
        <StatTile label="Least-Privilege Findings" value={findings} polarity="higher-is-worse" hint="Granted permissions the agent has barely exercised — candidates for revocation." />
        <StatTile label="Tool Calls Denied" value={denied} polarity="higher-is-worse" hint="Tool requests the gateway refused in the last 7 days." />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {agents.map((agent) => (
          <Link key={agent.id} href={`/agents/${agent.slug}`}>
            <Card
              interactive
              className={
                agent.riskLevel === "CRITICAL"
                  ? "h-full border-critical/30 p-4"
                  : "h-full p-4"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2.5">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                    <Bot className="size-4 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink">{agent.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-ink-4">
                      {agent.application.name} · {agent.model.name}
                    </p>
                  </div>
                </div>
                <Badge tone={RISK_TONE[agent.riskLevel as keyof typeof RISK_TONE]} size="xs">
                  {agent.riskLevel}
                </Badge>
              </div>

              <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">
                {agent.purpose}
              </p>

              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Security score
                  </span>
                  <span className="font-mono text-[11px] tabular text-ink-2">
                    {agent.securityScore}/100
                  </span>
                </div>
                <Meter
                  value={agent.securityScore}
                  tone={agent.securityScore >= 80 ? "allow" : agent.securityScore >= 65 ? "medium" : "critical"}
                  aria-label={`Security score ${agent.securityScore} of 100`}
                />
              </div>

              <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-2.5">
                <Metric label="Requests" value={agent.requests} />
                <Metric label="Blocked" value={agent.blocked} tone={agent.blocked > 0 ? "critical" : undefined} />
                <Metric label="Tool calls" value={agent.toolCalls} />
                <Metric label="Denied" value={agent.deniedCalls} tone={agent.deniedCalls > 0 ? "critical" : undefined} />
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                <Tooltip content={`Cleared to retrieve up to ${agent.dataClearance.toLowerCase()} content.`}>
                  <span><ClassificationBadge classification={agent.dataClearance} /></span>
                </Tooltip>
                <Tooltip content={`${agent.grantCount} tool grants, ${agent.highRiskGrants} of them tier 4 or above.`}>
                  <Badge tone="neutral" size="xs">
                    <KeyRound />
                    {agent.grantCount} grants
                  </Badge>
                </Tooltip>
                <Badge tone="outline" size="xs">
                  max {agent.maxToolCallsPerRequest} calls/request
                </Badge>
                {agent.unusedPermissions > 0 && (
                  <Tooltip content="Permissions granted but barely used. Each widens the blast radius of a compromise for no operational benefit.">
                    <Badge tone="medium" size="xs">
                      <TriangleAlert />
                      {agent.unusedPermissions} over-provisioned
                    </Badge>
                  </Tooltip>
                )}
                <span className="ml-auto text-[10px] text-ink-4">
                  {formatRelative(agent.lastActivityAt)}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {findings > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-3.5 text-medium" />
                Least-privilege findings
              </CardTitle>
              <p className="mt-0.5 text-xs text-ink-3">
                Permissions that were granted but are barely exercised. Each one widens what an
                attacker gains from compromising the agent, without giving the agent anything it
                actually uses.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {agents.flatMap((a) =>
                a.leastPrivilegeFindings.map((f) => (
                  <li
                    key={`${a.id}-${f.resource}`}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-medium/25 bg-medium-dim/20 px-3 py-2.5"
                  >
                    <Link href={`/agents/${a.slug}`} className="text-[11px] font-medium text-ink-2 hover:text-brand">
                      {a.name}
                    </Link>
                    <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                      {f.resource}
                    </code>
                    <span className="text-[11px] text-ink-4">
                      exercised {f.useCount} time{f.useCount === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto max-w-md truncate text-[10px] italic text-ink-4">
                      &ldquo;{f.justification}&rdquo;
                    </span>
                  </li>
                )),
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "critical";
}) {
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
