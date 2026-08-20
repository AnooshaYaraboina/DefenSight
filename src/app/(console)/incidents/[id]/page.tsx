import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Clock, FileWarning, Layers, ListChecks, ScrollText, Siren, Sparkles, Wrench,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getIncidentDetail } from "@/lib/queries/incidents";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IncidentStatusBadge, SeverityBadge, ThreatBadge } from "@/components/security/indicators";
import { AttackChain } from "@/components/security/attack-chain";
import { DetectionList } from "@/components/security/detection-list";
import { ToolCallList } from "@/components/security/tool-call-list";
import { IncidentActions } from "@/components/security/incident-actions";
import { RiskPill } from "@/components/security/risk-score";
import { KeyValue } from "@/components/security/evidence";
import { formatDateTime, formatRelative } from "@/lib/utils/format";
import {
  buildIncidentBrief, correlateEvents, recommendMitigations, summariseIncident,
} from "@/lib/ai/automation";
import {
  AiRecommendationsCard, AiSummaryCard, CorrelatedEventsCard,
} from "@/components/security/ai-analysis";
import { THREAT_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await getIncidentDetail(id);
  return { title: incident ? `${incident.ref} — Incident` : "Incident" };
}

const TIMELINE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  DETECTION: Siren,
  EVIDENCE: FileWarning,
  STATUS_CHANGE: ListChecks,
  NOTE: ScrollText,
  ACTION: ListChecks,
  AI_ANALYSIS: Sparkles,
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [incident, analysts, brief] = await Promise.all([
    getIncidentDetail(id),
    prisma.user.findMany({
      where: { role: { in: ["SECURITY_ADMIN", "SECURITY_ANALYST"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    buildIncidentBrief(id),
  ]);

  if (!incident) notFound();

  // AI automation (§21) runs after the case exists and cannot alter it. All
  // three degrade to deterministic output when no model is configured.
  const [analysis, mitigations, correlated] = await Promise.all([
    brief ? summariseIncident(brief) : Promise.resolve(null),
    brief ? recommendMitigations(brief) : Promise.resolve(null),
    incident.events[0] ? correlateEvents(incident.events[0].id, 6) : Promise.resolve([]),
  ]);

  const allDetections = incident.events.flatMap((e) => e.detections);
  const allToolCalls = incident.events.flatMap((e) => e.toolCalls);
  const allRetrievals = incident.events.flatMap((e) => e.retrievals);
  const withheld = allRetrievals.filter((r) => !r.allowed);
  const deniedTools = allToolCalls.filter((t) => t.decision === "BLOCK");
  const meta = THREAT_META[incident.threatType];

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/incidents">
            <ArrowLeft />
            Incidents
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-3">{incident.ref}</span>
            <SeverityBadge severity={incident.severity} size="xs" />
            <IncidentStatusBadge status={incident.status} size="xs" />
          </span>
        }
        title={incident.title}
        description={`Opened ${formatRelative(incident.openedAt)}${incident.assignedTo ? ` · assigned to ${incident.assignedTo.name}` : " · unassigned"}`}
        actions={
          <IncidentActions
            incidentId={incident.id}
            status={incident.status}
            analysts={analysts}
            assignedToId={incident.assignedToId}
          />
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <ThreatBadge threat={incident.threatType} severity={incident.severity} />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-2">{incident.summary}</p>
        </div>
        <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">About this threat: </span>
          {meta.description}
          {(meta.owasp || meta.atlas) && (
            <span className="ml-1.5 font-mono text-[10px] text-ink-4">
              ({[meta.owasp && `OWASP ${meta.owasp}`, meta.atlas && `MITRE ATLAS ${meta.atlas}`].filter(Boolean).join(" · ")})
            </span>
          )}
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {analysis && (
            <AiSummaryCard
              summary={analysis.text}
              fromModel={analysis.fromModel}
              title="Incident analysis"
            />
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Attack chain</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Reconstructed from the pipeline trace, stage by stage. Expand any stage for the
                  evidence recorded there.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {incident.attackChain.length > 0 ? (
                <AttackChain stages={incident.attackChain} />
              ) : (
                <p className="py-6 text-center text-xs text-ink-4">
                  No attack chain was recorded for this incident.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evidence</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Everything the engine recorded across {incident.events.length} related event
                  {incident.events.length === 1 ? "" : "s"}.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="detections">
                <TabsList className="mb-4">
                  <TabsTrigger value="detections">
                    <Layers />
                    Detections
                    <Badge tone="neutral" size="xs">{allDetections.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    <Wrench />
                    Tool calls
                    {deniedTools.length > 0 && <Badge tone="critical" size="xs">{deniedTools.length} denied</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="documents">
                    <FileWarning />
                    Documents
                    {withheld.length > 0 && <Badge tone="medium" size="xs">{withheld.length} withheld</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="events">
                    <Siren />
                    Events
                    <Badge tone="neutral" size="xs">{incident.events.length}</Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="detections">
                  <DetectionList
                    detections={allDetections}
                    requestText={incident.events[0]?.requestText}
                  />
                </TabsContent>

                <TabsContent value="tools">
                  <ToolCallList calls={allToolCalls} />
                </TabsContent>

                <TabsContent value="documents">
                  {allRetrievals.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      No documents were retrieved during this incident.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {allRetrievals.map((r) => (
                        <li
                          key={r.id}
                          className={
                            r.allowed
                              ? "rounded-md border border-line bg-surface-2/40 p-3"
                              : "rounded-md border border-critical/30 bg-critical-dim/20 p-3"
                          }
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <Link
                              href={`/rag/documents/${r.document.id}`}
                              className="text-xs font-medium text-ink-2 hover:text-brand"
                            >
                              {r.document.title}
                            </Link>
                            <div className="flex items-center gap-1.5">
                              {r.document.quarantined && <Badge tone="critical" size="xs">Quarantined</Badge>}
                              {r.document.source.isExternal && <Badge tone="high" size="xs">External</Badge>}
                              <Badge tone={r.allowed ? "allow" : "block"} size="xs">
                                {r.allowed ? "Delivered" : "Withheld"}
                              </Badge>
                            </div>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-ink-4">
                            {r.document.source.name} · trust {r.document.trustScore}/100 · similarity {r.similarity.toFixed(2)}
                          </p>
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

                <TabsContent value="events">
                  <ul className="space-y-2">
                    {incident.events.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/monitor/${e.id}`}
                          className="block rounded-md border border-line bg-surface-2/40 p-3 transition-colors hover:border-line-strong hover:bg-surface-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-ink-4">{e.ref}</span>
                              <span className="text-[11px] text-ink-2">{e.user?.name}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <RiskPill score={e.riskScore} />
                              <span className="font-mono text-[10px] text-ink-4">
                                {formatRelative(e.createdAt)}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">
                            {e.requestText}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Case detail</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                <KeyValue label="Opened">{formatDateTime(incident.openedAt)}</KeyValue>
                {incident.containedAt && (
                  <KeyValue label="Contained">{formatDateTime(incident.containedAt)}</KeyValue>
                )}
                {incident.resolvedAt && (
                  <KeyValue label="Resolved">{formatDateTime(incident.resolvedAt)}</KeyValue>
                )}
                <KeyValue label="Assigned to">{incident.assignedTo?.name ?? "Unassigned"}</KeyValue>
                <KeyValue label="Subject">{incident.subjectUser ?? "—"}</KeyValue>
                <KeyValue label="Application">
                  {incident.application ? (
                    <Link href={`/applications/${incident.application.slug}`} className="hover:text-brand">
                      {incident.application.name}
                    </Link>
                  ) : "—"}
                </KeyValue>
                <KeyValue label="Agent">
                  {incident.agent ? (
                    <Link href={`/agents/${incident.agent.slug}`} className="hover:text-brand">
                      {incident.agent.name}
                    </Link>
                  ) : "—"}
                </KeyValue>
                <KeyValue label="Related events" mono>{incident.events.length}</KeyValue>
                <KeyValue label="Alerts raised" mono>{incident.alerts.length}</KeyValue>
              </dl>

              {incident.resolution && (
                <div className="mt-3 rounded-md border border-allow/25 bg-allow-dim/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-allow">
                    Resolution
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{incident.resolution}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-3.5 text-ink-4" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-3">
                {incident.timeline.map((entry, i) => {
                  const Icon = TIMELINE_ICON[entry.kind] ?? ScrollText;
                  const isLast = i === incident.timeline.length - 1;
                  return (
                    <li key={entry.id} className="relative pl-6">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[7px] top-5 h-full w-px bg-line"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-0.5 flex size-4 items-center justify-center rounded-full border border-line-strong bg-surface"
                      >
                        <Icon className="size-2.5 text-ink-4" />
                      </span>
                      <p className="text-[11px] leading-relaxed text-ink-2">{entry.message}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-4">
                        {entry.actor} · {formatRelative(entry.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {mitigations && (
            <AiRecommendationsCard items={mitigations.items} fromModel={mitigations.fromModel} />
          )}

          <CorrelatedEventsCard events={correlated} />

          {incident.agent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-3.5 text-ink-4" />
                  Agent involved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-ink-3">{incident.agent.purpose}</p>
                <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                  <Link href={`/agents/${incident.agent.slug}`}>Review agent security</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
