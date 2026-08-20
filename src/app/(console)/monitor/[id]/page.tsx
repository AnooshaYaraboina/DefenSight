import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Boxes, FileText, Gauge, Layers, Lock, ScanSearch, ShieldAlert, Siren, Wrench,
} from "lucide-react";
import { getEventDetail } from "@/lib/queries/monitor";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClassificationBadge, DecisionBadge, IncidentStatusBadge, SeverityBadge, ThreatBadge,
} from "@/components/security/indicators";
import { RiskPill } from "@/components/security/risk-score";
import { RiskBreakdown } from "@/components/security/risk-breakdown";
import { AttackChain } from "@/components/security/attack-chain";
import { DetectionList } from "@/components/security/detection-list";
import { ToolCallList } from "@/components/security/tool-call-list";
import { CodePanel, KeyValue } from "@/components/security/evidence";
import { formatDateTime, formatDuration } from "@/lib/utils/format";
import { CHANNEL_META, ROLE_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `${event.ref} — Event` : "Event" };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) notFound();

  const withheld = event.retrievals.filter((r) => !r.allowed);
  const deniedTools = event.toolCalls.filter((t) => t.decision === "BLOCK");

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/monitor">
            <ArrowLeft />
            Live Monitor
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-base">{event.ref}</span>
            <SeverityBadge severity={event.severity} />
            <DecisionBadge decision={event.decision} />
          </span>
        }
        description={formatDateTime(event.createdAt)}
        actions={
          event.incident ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/incidents/${event.incident.id}`}>
                <Siren />
                {event.incident.ref}
                <IncidentStatusBadge status={event.incident.status} size="xs" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Verdict strip: the answer before the evidence. */}
      <Card className="mb-4 overflow-hidden">
        <div className="grid divide-y divide-line md:grid-cols-4 md:divide-x md:divide-y-0">
          <VerdictCell icon={Gauge} label="Risk score" value={<RiskPill score={event.riskScore} showLabel />} />
          <VerdictCell
            icon={ScanSearch}
            label="Detections"
            value={<span className="font-mono text-sm text-ink">{event.detections.length}</span>}
            hint={`${new Set(event.detections.map((d) => d.layer)).size} analysis layers fired`}
          />
          <VerdictCell
            icon={Wrench}
            label="Tool calls"
            value={
              <span className="font-mono text-sm text-ink">
                {event.toolCalls.length}
                {deniedTools.length > 0 && (
                  <span className="ml-1.5 text-xs text-critical">{deniedTools.length} denied</span>
                )}
              </span>
            }
          />
          <VerdictCell
            icon={FileText}
            label="Documents retrieved"
            value={
              <span className="font-mono text-sm text-ink">
                {event.retrievals.length}
                {withheld.length > 0 && (
                  <span className="ml-1.5 text-xs text-medium">{withheld.length} withheld</span>
                )}
              </span>
            }
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Request</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  {CHANNEL_META.USER_INPUT.description}
                </p>
              </div>
              {event.threatTypes.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {event.threatTypes.map((t) => (
                    <ThreatBadge key={t} threat={t} size="xs" severity={event.severity} />
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <CodePanel
                label="User input"
                copyValue={event.requestText}
                tone={event.blocked ? "danger" : "neutral"}
              >
                <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
                  {event.requestText}
                </p>
              </CodePanel>

              {event.responseText && (
                <CodePanel
                  label={event.redacted ? "Response (pre-redaction)" : "Response"}
                  copyValue={event.responseText}
                >
                  <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
                    {event.responseText}
                  </p>
                </CodePanel>
              )}

              {event.redactedResponse && (
                <CodePanel label="Response delivered (redacted)" tone="safe" copyValue={event.redactedResponse}>
                  <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
                    {event.redactedResponse}
                  </p>
                </CodePanel>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Investigation</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  What the pipeline observed, in the order it observed it.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="chain">
                <TabsList className="mb-4">
                  <TabsTrigger value="chain">
                    <Layers />
                    Attack chain
                  </TabsTrigger>
                  <TabsTrigger value="detections">
                    <ScanSearch />
                    Detections
                    {event.detections.length > 0 && (
                      <Badge tone="neutral" size="xs">{event.detections.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    <Wrench />
                    Tool calls
                    {event.toolCalls.length > 0 && (
                      <Badge tone="neutral" size="xs">{event.toolCalls.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="retrieval">
                    <FileText />
                    Retrieval
                    {event.retrievals.length > 0 && (
                      <Badge tone="neutral" size="xs">{event.retrievals.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="data">
                    <Lock />
                    Sensitive data
                    {event.sensitiveHits.length > 0 && (
                      <Badge tone="neutral" size="xs">{event.sensitiveHits.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chain">
                  <AttackChain stages={event.stageTrace} />
                </TabsContent>

                <TabsContent value="detections">
                  <DetectionList detections={event.detections} requestText={event.requestText} />
                </TabsContent>

                <TabsContent value="tools">
                  <ToolCallList calls={event.toolCalls} />
                </TabsContent>

                <TabsContent value="retrieval">
                  {event.retrievals.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      This request did not retrieve any documents.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {event.retrievals.map((r) => (
                        <li
                          key={r.id}
                          className={cnRetrieval(r.allowed)}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                href={`/rag/documents/${r.document.id}`}
                                className="text-xs font-medium text-ink-2 hover:text-brand"
                              >
                                {r.document.title}
                              </Link>
                              <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-4">
                                <span>{r.document.source.name}</span>
                                {r.document.source.isExternal && (
                                  <Badge tone="high" size="xs">External source</Badge>
                                )}
                                <span className="font-mono">similarity {r.similarity.toFixed(2)}</span>
                                <span className="font-mono">trust {r.document.trustScore}/100</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <ClassificationBadge classification={r.document.classification} />
                              {r.allowed ? (
                                <Badge tone="allow" size="xs">Delivered</Badge>
                              ) : (
                                <Badge tone="block" size="xs">Withheld</Badge>
                              )}
                            </div>
                          </div>
                          {r.withheldReason && (
                            <p className="mt-2 rounded border border-critical/25 bg-critical-dim/40 px-2 py-1.5 text-[11px] leading-relaxed text-critical">
                              {r.withheldReason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="data">
                  {event.sensitiveHits.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      No sensitive data was detected in any monitored channel.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {event.sensitiveHits.map((h) => (
                        <li key={h.id} className="rounded-md border border-line bg-surface-2/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Lock className="size-3.5 text-medium" />
                              <span className="text-xs font-medium text-ink-2">
                                {h.type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                              </span>
                              <Badge tone="neutral" size="xs">{h.category}</Badge>
                              <span className="font-mono text-[10px] text-ink-4">×{h.count}</span>
                            </div>
                            <DecisionBadge decision={h.action} size="xs" withTooltip={false} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span className="text-[10px] text-ink-4">
                              {CHANNEL_META[h.channel]?.label ?? h.channel}
                            </span>
                            <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                              {h.maskedSample}
                            </code>
                            <span className="font-mono text-[10px] text-ink-4">
                              {(h.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <RiskBreakdown
                score={event.riskAssessment.score}
                confidence={event.riskAssessment.confidence}
                rationale={event.riskAssessment.rationale}
                factors={event.riskAssessment.factors}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                <KeyValue label="Principal">{event.user?.name ?? "—"}</KeyValue>
                <KeyValue label="Role">
                  {event.user ? ROLE_META[event.user.role].label : "—"}
                </KeyValue>
                <KeyValue label="Clearance">
                  {event.user && <ClassificationBadge classification={event.user.clearance} />}
                </KeyValue>
                <KeyValue label="Department">{event.user?.department ?? "—"}</KeyValue>
                <KeyValue label="Principal risk" mono>{event.user?.riskScore ?? 0}/100</KeyValue>
                <KeyValue label="Application">
                  <Link href={`/applications/${event.application?.slug}`} className="hover:text-brand">
                    {event.application?.name ?? "—"}
                  </Link>
                </KeyValue>
                <KeyValue label="Agent">
                  {event.agent ? (
                    <Link href={`/agents/${event.agent.slug}`} className="hover:text-brand">
                      {event.agent.name}
                    </Link>
                  ) : "—"}
                </KeyValue>
                <KeyValue label="Model" mono>{event.model?.name ?? "—"}</KeyValue>
                <KeyValue label="Pipeline latency" mono>{formatDuration(event.latencyMs)}</KeyValue>
                <KeyValue label="Event reference" mono>{event.ref}</KeyValue>
              </dl>
            </CardContent>
          </Card>

          {event.agent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-3.5 text-ink-4" />
                  Acting agent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-ink-3">{event.agent.purpose}</p>
                <dl className="mt-3 divide-y divide-line">
                  <KeyValue label="Risk level">
                    <Badge tone={event.agent.riskLevel === "CRITICAL" ? "critical" : event.agent.riskLevel === "HIGH" ? "high" : event.agent.riskLevel === "MEDIUM" ? "medium" : "low"} size="xs">
                      {event.agent.riskLevel}
                    </Badge>
                  </KeyValue>
                  <KeyValue label="Security score" mono>{event.agent.securityScore}/100</KeyValue>
                </dl>
              </CardContent>
            </Card>
          )}

          {event.alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-3.5 text-critical" />
                  Alerts raised
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {event.alerts.map((a) => (
                  <div key={a.id} className="rounded-md border border-line bg-surface-2/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-ink-2">{a.title}</span>
                      <SeverityBadge severity={a.severity} size="xs" showIcon={false} withTooltip={false} />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-4">{a.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function VerdictCell({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-4" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">{label}</p>
        <div className="mt-1.5">{value}</div>
        {hint && <p className="mt-1 text-[10px] text-ink-4">{hint}</p>}
      </div>
    </div>
  );
}

function cnRetrieval(allowed: boolean) {
  return allowed
    ? "rounded-md border border-line bg-surface-2/40 p-3"
    : "rounded-md border border-critical/30 bg-critical-dim/20 p-3";
}
