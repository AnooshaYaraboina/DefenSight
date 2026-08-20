import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Database, FileText, Siren } from "lucide-react";
import { getApplicationDetail } from "@/lib/queries/estate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/progress";
import { StatTile } from "@/components/security/stat-tile";
import { BarList } from "@/components/charts/bar-charts";
import { RiskPill } from "@/components/security/risk-score";
import {
  ClassificationBadge, DecisionBadge, IncidentStatusBadge, SeverityBadge,
} from "@/components/security/indicators";
import { CodePanel, KeyValue } from "@/components/security/evidence";
import { formatRelative, truncate } from "@/lib/utils/format";
import { THREAT_META, type ThreatType } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await getApplicationDetail(slug);
  return { title: app ? app.name : "Application" };
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = await getApplicationDetail(slug);
  if (!app) notFound();

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/applications">
            <ArrowLeft />
            Applications
          </Link>
        </Button>
      </div>

      <PageHeader
        title={app.name}
        description={app.description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/monitor?application=${app.slug}`}>View all events</Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Security Score" value={app.securityScore} emphasis hint="Derived from blocked-request rate, critical activity and average risk." />
        <StatTile label="Requests (7d)" value={app.stats.requests} />
        <StatTile label="Threats" value={app.stats.threats} polarity="higher-is-worse" />
        <StatTile label="Blocked" value={app.stats.blocked} polarity="higher-is-worse" />
        <StatTile label="Average Risk" value={app.stats.avgRisk} polarity="higher-is-worse" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-3.5 text-ink-4" />
                  Agents
                </CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Each agent&apos;s grants define the blast radius if this application is manipulated.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {app.agents.map((agent) => (
                  <li key={agent.id}>
                    <Link
                      href={`/agents/${agent.slug}`}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2/40 p-3 transition-colors hover:border-line-strong hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink-2">
                          {agent.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-4">
                          {agent.purpose}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <ClassificationBadge classification={agent.dataClearance} />
                        <Badge tone="neutral" size="xs">{agent._count.toolGrants} grants</Badge>
                        <Badge
                          tone={
                            agent.riskLevel === "CRITICAL" ? "critical"
                              : agent.riskLevel === "HIGH" ? "high"
                                : agent.riskLevel === "MEDIUM" ? "medium" : "low"
                          }
                          size="xs"
                        >
                          {agent.riskLevel}
                        </Badge>
                        <span className="w-16">
                          <Meter
                            value={agent.securityScore}
                            tone={agent.securityScore >= 80 ? "allow" : agent.securityScore >= 65 ? "medium" : "critical"}
                            aria-label={`Security score ${agent.securityScore}`}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <Link href={`/monitor?application=${app.slug}`} className="text-[11px] text-brand hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {app.events.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink-4">No activity in the last 7 days.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {app.events.slice(0, 12).map((e) => (
                    <li key={e.id}>
                      <Link href={`/monitor/${e.id}`} className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-2/50">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-ink-2">{e.user?.name}</span>
                            {e.agent && (
                              <span className="font-mono text-[10px] text-ink-4">{e.agent.name}</span>
                            )}
                            <span className="text-[10px] text-ink-4">{formatRelative(e.createdAt)}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-ink-3">
                            {truncate(e.requestText, 96)}
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
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <BarList
              title="Threats detected"
              subtitle="Across this application in the last 7 days."
              data={app.topThreats.map((t) => ({
                label: THREAT_META[t.type as ThreatType]?.label ?? t.type,
                value: t.count,
                color: "var(--color-viz-2)",
              }))}
              maxRows={6}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                <KeyValue label="Owner">{app.owner}</KeyValue>
                <KeyValue label="Contact" mono>{app.ownerEmail}</KeyValue>
                <KeyValue label="Environment">{app.environment}</KeyValue>
                <KeyValue label="Model" mono>{app.model.name}</KeyValue>
                <KeyValue label="Provider">{app.model.provider}</KeyValue>
                <KeyValue label="Context window" mono>
                  {app.model.contextWindow.toLocaleString()}
                </KeyValue>
                <KeyValue label="Status">
                  <Badge tone="allow" size="xs">{app.status}</Badge>
                </KeyValue>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-3.5 text-ink-4" />
                Knowledge sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {app.vectorStores.map((v) => (
                  <li key={v.vectorStoreId} className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2/40 px-2.5 py-2">
                    <span className="truncate text-[11px] text-ink-2">{v.vectorStore.name}</span>
                    <span className="font-mono text-[10px] text-ink-4">{v.vectorStore.provider}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-3.5 text-ink-4" />
                System prompt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodePanel copyValue={app.systemPrompt}>
                <p className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-2">
                  {app.systemPrompt}
                </p>
              </CodePanel>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
                Output guardrails compare responses against this text to catch system-prompt
                disclosure even when the request looked benign.
              </p>
            </CardContent>
          </Card>

          {app.incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Siren className="size-3.5 text-critical" />
                  Incidents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {app.incidents.map((i) => (
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
