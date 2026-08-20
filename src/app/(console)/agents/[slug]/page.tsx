import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, KeyRound, Siren, Sigma, TriangleAlert, Wrench } from "lucide-react";
import { getAgentDetail } from "@/lib/queries/estate";
import { jsonArray } from "@/lib/db/json";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { StatTile } from "@/components/security/stat-tile";
import { ToolCallList } from "@/components/security/tool-call-list";
import { RiskPill } from "@/components/security/risk-score";
import {
  ClassificationBadge, DecisionBadge, IncidentStatusBadge, SeverityBadge,
} from "@/components/security/indicators";
import { CodePanel, KeyValue } from "@/components/security/evidence";
import { formatRelative, truncate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await getAgentDetail(slug);
  return { title: agent ? agent.name : "Agent" };
}

const RISK_TONE = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = await getAgentDetail(slug);
  if (!agent) notFound();

  const overProvisioned = agent.permissions.filter((p) => p.useCount < 10);
  const highRiskGrants = agent.toolGrants.filter((g) => g.tool.riskTier >= 4);

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agents">
            <ArrowLeft />
            Agents
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{agent.name}</span>
            <Badge tone={RISK_TONE[agent.riskLevel as keyof typeof RISK_TONE]} size="sm">
              {agent.riskLevel} RISK
            </Badge>
          </span>
        }
        description={agent.purpose}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/monitor?agent=${agent.slug}`}>View all events</Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Security Score" value={agent.securityScore} emphasis hint="Recomputed from this agent's observed behaviour." />
        <StatTile label="Requests (7d)" value={agent.stats.requests} />
        <StatTile label="Blocked" value={agent.stats.blocked} polarity="higher-is-worse" />
        <StatTile label="Tool Calls" value={agent.stats.toolCalls} />
        <StatTile label="Calls Denied" value={agent.stats.deniedCalls} polarity="higher-is-worse" hint="Refused by the gateway." />
      </div>

      {overProvisioned.length > 0 && (
        <Card className="mb-4 border-medium/30 bg-medium-dim/15">
          <CardContent className="flex gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-medium" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-medium">
                {overProvisioned.length} least-privilege finding
                {overProvisioned.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                This agent holds permissions it barely exercises. Each one widens what an attacker
                gains from compromising it, without giving the agent anything it actually uses.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {overProvisioned.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2.5 rounded border border-medium/20 bg-surface/60 px-2.5 py-1.5">
                    <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                      {p.resource}
                    </code>
                    <span className="font-mono text-[10px] text-ink-3">
                      {jsonArray<string>(p.actions).join(", ")}
                    </span>
                    <span className="text-[10px] text-ink-4">
                      exercised {p.useCount} time{p.useCount === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto max-w-sm truncate text-[10px] italic text-ink-4">
                      &ldquo;{p.justification}&rdquo;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tools">
                <TabsList className="mb-4">
                  <TabsTrigger value="tools">
                    <Wrench />
                    Tool calls
                    <Badge tone="neutral" size="xs">{agent.toolCalls.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="events">
                    <Bot />
                    Requests
                    <Badge tone="neutral" size="xs">{agent.events.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="baselines">
                    <Sigma />
                    Baselines
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tools">
                  <ToolCallList calls={agent.toolCalls} />
                </TabsContent>

                <TabsContent value="events">
                  {agent.events.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      No requests in the last 7 days.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {agent.events.map((e) => (
                        <li key={e.id}>
                          <Link href={`/monitor/${e.id}`} className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-2/50">
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-ink-2">{e.user?.name}</span>
                                <span className="text-[10px] text-ink-4">{formatRelative(e.createdAt)}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-ink-3">
                                {truncate(e.requestText, 100)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <RiskPill score={e.riskScore} />
                              <DecisionBadge decision={e.decision} size="xs" showIcon={false} withTooltip={false} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="baselines">
                  {agent.baselines.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      No baselines established yet. The behavioural layer needs at least 12 samples
                      per metric before it will judge deviation.
                    </p>
                  ) : (
                    <>
                      <p className="mb-3 text-[11px] leading-relaxed text-ink-3">
                        The behavioural layer scores deviation against this agent&apos;s own
                        history, not a global threshold — so an agent that legitimately makes
                        heavy use of a tool is not penalised for doing its job.
                      </p>
                      <ul className="space-y-2">
                        {agent.baselines.map((b) => {
                          const variance = b.sampleCount > 1 ? b.m2 / (b.sampleCount - 1) : 0;
                          const stddev = Math.sqrt(variance);
                          return (
                            <li key={b.id} className="rounded-md border border-line bg-surface-2/40 p-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[11px] font-medium text-ink-2">
                                  {b.metric.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                                </span>
                                <span className="font-mono text-[11px] tabular text-ink">
                                  μ {b.mean.toFixed(2)}
                                </span>
                              </div>
                              <dl className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
                                <div><dt className="text-ink-4">σ</dt><dd className="font-mono text-ink-3">{stddev.toFixed(2)}</dd></div>
                                <div><dt className="text-ink-4">Samples</dt><dd className="font-mono text-ink-3">{b.sampleCount}</dd></div>
                                <div><dt className="text-ink-4">Min</dt><dd className="font-mono text-ink-3">{b.min.toFixed(0)}</dd></div>
                                <div><dt className="text-ink-4">Max</dt><dd className="font-mono text-ink-3">{b.max.toFixed(0)}</dd></div>
                              </dl>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-3.5 text-ink-4" />
                Tool grants
              </CardTitle>
              <Badge tone="neutral" size="xs">{agent.toolGrants.length}</Badge>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-[10px] leading-relaxed text-ink-4">
                The gateway defaults closed: a tool without a grant is refused, however the
                request is framed.
              </p>
              <ul className="space-y-1.5">
                {agent.toolGrants.map((grant) => (
                  <li
                    key={grant.id}
                    className={
                      grant.tool.riskTier >= 4
                        ? "rounded-md border border-high/25 bg-high-dim/20 p-2.5"
                        : "rounded-md border border-line bg-surface-2/40 p-2.5"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-ink-2">
                        {grant.tool.name}
                      </span>
                      <Tooltip content={`Risk tier ${grant.tool.riskTier} of 5`}>
                        <Badge
                          tone={grant.tool.riskTier >= 5 ? "critical" : grant.tool.riskTier >= 4 ? "high" : "neutral"}
                          size="xs"
                        >
                          T{grant.tool.riskTier}
                        </Badge>
                      </Tooltip>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {jsonArray<string>(grant.operations).map((op) => (
                        <span key={op} className="rounded bg-inset px-1.5 py-px font-mono text-[9px] text-ink-3">
                          {op}
                        </span>
                      ))}
                      <span className="ml-auto font-mono text-[9px] text-ink-4">
                        max {grant.maxCallsPerRequest}/req
                      </span>
                    </div>
                    {grant.justification && (
                      <p className="mt-1.5 text-[10px] italic leading-snug text-ink-4">
                        {grant.justification}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {highRiskGrants.length > 0 && (
                <p className="mt-3 rounded border border-high/25 bg-high-dim/25 px-2.5 py-2 text-[10px] leading-relaxed text-high">
                  {highRiskGrants.length} grant{highRiskGrants.length === 1 ? " is" : "s are"} tier 4
                  or above — irreversible or externally visible effects. Every one requires human
                  approval before execution.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                <KeyValue label="Application">
                  <Link href={`/applications/${agent.application.slug}`} className="hover:text-brand">
                    {agent.application.name}
                  </Link>
                </KeyValue>
                <KeyValue label="Model" mono>{agent.model.name}</KeyValue>
                <KeyValue label="Data clearance">
                  <ClassificationBadge classification={agent.dataClearance} />
                </KeyValue>
                <KeyValue label="Max tool calls" mono>{agent.maxToolCallsPerRequest}/request</KeyValue>
                <KeyValue label="Max tokens" mono>{agent.maxTokensPerRequest.toLocaleString()}</KeyValue>
                <KeyValue label="Status">
                  <Badge tone={agent.status === "ACTIVE" ? "allow" : "neutral"} size="xs">
                    {agent.status}
                  </Badge>
                </KeyValue>
                <KeyValue label="Last active">{formatRelative(agent.lastActivityAt)}</KeyValue>
              </dl>

              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Security score
                  </span>
                  <span className="font-mono text-[11px] text-ink-2">{agent.securityScore}/100</span>
                </div>
                <Meter
                  value={agent.securityScore}
                  tone={agent.securityScore >= 80 ? "allow" : agent.securityScore >= 65 ? "medium" : "critical"}
                  aria-label={`Security score ${agent.securityScore}`}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <CodePanel copyValue={agent.systemPrompt}>
                <p className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-2">
                  {agent.systemPrompt}
                </p>
              </CodePanel>
            </CardContent>
          </Card>

          {agent.incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Siren className="size-3.5 text-critical" />
                  Incidents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {agent.incidents.map((i) => (
                  <Link
                    key={i.id}
                    href={`/incidents/${i.id}`}
                    className="block rounded-md border border-line bg-surface-2/40 p-2.5 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-ink-4">{i.ref}</span>
                      <span className="flex items-center gap-1.5">
                        <SeverityBadge severity={i.severity} size="xs" showIcon={false} withTooltip={false} />
                        <IncidentStatusBadge status={i.status} size="xs" />
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-2">{i.title}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
