import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Database, FileText, HardDrive, ShieldOff, User } from "lucide-react";
import { getDocumentDetail } from "@/lib/queries/rag";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassificationBadge, DecisionBadge, SeverityBadge, ThreatBadge } from "@/components/security/indicators";
import { ScanStatusBadge, TrustPill } from "@/components/security/document-badges";
import { QuarantineToggle } from "@/components/security/quarantine-toggle";
import { HighlightedText, KeyValue } from "@/components/security/evidence";
import { RiskPill } from "@/components/security/risk-score";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/utils/format";
import type { ThreatType } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocumentDetail(id);
  return { title: doc ? doc.title : "Document" };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getDocumentDetail(id);
  if (!doc) notFound();

  const scan = doc.scanSummary;
  // Findings are anchored to character offsets so the passage can be highlighted
  // in the document body itself — the point of §11 is showing *why*.
  const spans = doc.findings
    .filter((f) => f.offsetEnd > f.offsetStart)
    .map((f) => ({
      start: f.offsetStart,
      end: f.offsetEnd,
      text: f.snippet,
      label: f.threatType.replace(/_/g, " ").toLowerCase(),
      severity: f.severity.toLowerCase() as never,
    }));

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/rag">
            <ArrowLeft />
            RAG Security
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-base">{doc.title}</span>
            <ScanStatusBadge status={doc.scanStatus} quarantined={doc.quarantined} size="sm" />
            <ClassificationBadge classification={doc.classification} size="sm" />
          </span>
        }
        description={`${doc.source.name} · ${formatBytes(doc.sizeBytes)} · ${doc.chunkCount} chunk${doc.chunkCount === 1 ? "" : "s"}`}
        actions={
          <QuarantineToggle
            documentId={doc.id}
            quarantined={doc.quarantined}
            title={doc.title}
          />
        }
      />

      {doc.quarantined && doc.quarantineReason && (
        <Card className="mb-4 border-critical/40 bg-critical-dim/25">
          <CardContent className="flex gap-3">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-critical" />
            <div>
              <p className="text-xs font-semibold text-critical">Quarantined</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{doc.quarantineReason}</p>
              <p className="mt-1.5 text-[10px] text-ink-4">
                This document is withheld from every retrieval. It cannot reach a model context
                until an administrator releases it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Scan analysis</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Run with the same detection layers applied to live traffic.
                </p>
              </div>
              {scan && (
                <span className="font-mono text-[10px] text-ink-4">{scan.durationMs}ms</span>
              )}
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="reasoning">
                <TabsList className="mb-4">
                  <TabsTrigger value="reasoning">Why this verdict</TabsTrigger>
                  <TabsTrigger value="findings">
                    Findings
                    {doc.findings.length > 0 && (
                      <Badge tone="neutral" size="xs">{doc.findings.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="retrievals">
                    Retrievals
                    {doc.retrievals.length > 0 && (
                      <Badge tone="neutral" size="xs">{doc.retrievals.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="reasoning">
                  {scan?.reasoning?.length ? (
                    <ol className="space-y-2">
                      {scan.reasoning.map((r, i) => (
                        <li
                          key={i}
                          className="flex gap-3 rounded-md border border-line bg-surface-2/40 px-3 py-2.5"
                        >
                          <span className="font-mono text-[10px] text-ink-4">{i + 1}</span>
                          <span className="text-[11px] leading-relaxed text-ink-2">{r}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="py-8 text-center text-xs text-ink-4">
                      This document has not been scanned yet.
                    </p>
                  )}

                  {scan?.sensitive?.length ? (
                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                        Sensitive data found in this document
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {scan.sensitive.map((s) => (
                          <li key={s.type}>
                            <Badge tone={s.category === "CREDENTIAL" ? "critical" : "medium"} size="sm">
                              {s.type.replace(/_/g, " ").toLowerCase()}
                              <span className="font-mono">×{s.count}</span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
                        Anything retrievable is disclosable. Sensitive values in an indexed
                        document are treated as an exposure regardless of intent.
                      </p>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="findings">
                  {doc.findings.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      No findings were recorded for this document.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {doc.findings.map((f) => (
                        <li key={f.id} className="rounded-md border border-line bg-surface-2/40 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <ThreatBadge threat={f.threatType as ThreatType} size="xs" severity={f.severity} />
                            <SeverityBadge severity={f.severity} size="xs" showIcon={false} withTooltip={false} />
                            <span className="font-mono text-[10px] text-ink-4">
                              {(f.confidence * 100).toFixed(0)}% confidence
                            </span>
                            <span className="ml-auto font-mono text-[9px] text-ink-4">
                              offset {f.offsetStart}–{f.offsetEnd}
                            </span>
                          </div>
                          {f.snippet && (
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded border border-critical/25 bg-critical-dim/25 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-critical">
                              {f.snippet}
                            </pre>
                          )}
                          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{f.explanation}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="content">
                  <div className="rounded-md border border-line bg-inset p-3">
                    {spans.length > 0 && (
                      <p className="mb-2.5 flex items-center gap-1.5 border-b border-line pb-2 text-[10px] text-ink-4">
                        <span className="inline-block size-2 rounded-sm bg-critical/40" />
                        Highlighted passages are what the detectors matched.
                      </p>
                    )}
                    <div className="max-h-[32rem] overflow-y-auto">
                      <HighlightedText text={doc.content} spans={spans} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="retrievals">
                  {doc.retrievals.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-4">
                      This document has never been retrieved.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {doc.retrievals.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/monitor/${r.event.id}`}
                            className={
                              r.allowed
                                ? "block rounded-md border border-line bg-surface-2/40 p-3 transition-colors hover:border-line-strong"
                                : "block rounded-md border border-critical/30 bg-critical-dim/20 p-3 transition-colors hover:border-critical/50"
                            }
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-ink-4">{r.event.ref}</span>
                                <span className="text-[11px] text-ink-2">{r.event.user?.name}</span>
                                {r.event.agent && (
                                  <span className="font-mono text-[10px] text-ink-4">
                                    {r.event.agent.name}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2">
                                <Badge tone={r.allowed ? "allow" : "block"} size="xs">
                                  {r.allowed ? "Delivered" : "Withheld"}
                                </Badge>
                                <RiskPill score={r.event.riskScore} />
                                <DecisionBadge decision={r.event.decision} size="xs" showIcon={false} withTooltip={false} />
                              </span>
                            </div>
                            <p className="mt-1.5 truncate text-[11px] text-ink-3">{r.query}</p>
                            <p className="mt-1 font-mono text-[10px] text-ink-4">
                              similarity {r.similarity.toFixed(3)} · {formatRelative(r.event.createdAt)}
                            </p>
                            {r.withheldReason && (
                              <p className="mt-1.5 text-[10px] leading-relaxed text-critical">
                                {r.withheldReason}
                              </p>
                            )}
                          </Link>
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
              <CardTitle>Trust</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] text-ink-3">Document trust</span>
                  <TrustPill trust={doc.trustScore} ceiling={doc.source.trustLevel} />
                </div>
                <Meter
                  value={doc.trustScore}
                  tone={doc.trustScore >= 70 ? "allow" : doc.trustScore >= 40 ? "medium" : "critical"}
                  aria-label={`Document trust ${doc.trustScore} of 100`}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] text-ink-3">Source ceiling</span>
                  <span className="font-mono text-[11px] tabular text-ink-2">
                    {doc.source.trustLevel}/100
                  </span>
                </div>
                <Meter value={doc.source.trustLevel} tone="info" aria-label="Source trust ceiling" />
              </div>

              <p className="rounded-md border border-line bg-surface-2/50 p-2.5 text-[10px] leading-relaxed text-ink-3">
                Trust is inherited from provenance and can only fall. Content never earns
                credibility its origin does not justify — which is what stops hostile material
                being laundered by looking official.
              </p>

              {scan && (
                <dl className="divide-y divide-line border-t border-line pt-2">
                  <KeyValue label="Scan risk score" mono>{scan.riskScore}/100</KeyValue>
                  <KeyValue label="Obfuscation" mono>
                    {(scan.obfuscation * 100).toFixed(0)}%
                  </KeyValue>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Provenance</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                <KeyValue label="Source">
                  <span className="flex items-center gap-1.5">
                    <Database className="size-3 text-ink-4" />
                    {doc.source.name}
                  </span>
                </KeyValue>
                <KeyValue label="Origin">
                  {doc.source.isExternal ? (
                    <Badge tone="critical" size="xs">External — untrusted</Badge>
                  ) : (
                    <Badge tone="allow" size="xs">Internal</Badge>
                  )}
                </KeyValue>
                <KeyValue label="Owner">
                  <span className="flex items-center gap-1.5">
                    <User className="size-3 text-ink-4" />
                    {doc.owner}
                  </span>
                </KeyValue>
                <KeyValue label="Vector store">
                  {doc.vectorStore ? (
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="size-3 text-ink-4" />
                      {doc.vectorStore.name}
                    </span>
                  ) : (
                    <span className="text-critical">Not indexed</span>
                  )}
                </KeyValue>
                <KeyValue label="Indexed" mono>{doc.chunkCount} chunks</KeyValue>
                <KeyValue label="Size" mono>{formatBytes(doc.sizeBytes)}</KeyValue>
                <KeyValue label="Content hash" mono>{doc.contentHash.slice(0, 16)}…</KeyValue>
                <KeyValue label="Added">{formatDateTime(doc.createdAt)}</KeyValue>
                {doc.scannedAt && (
                  <KeyValue label="Last scanned">{formatDateTime(doc.scannedAt)}</KeyValue>
                )}
              </dl>
            </CardContent>
          </Card>

          {scan?.threats?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-3.5 text-critical" />
                  Threats identified
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {scan.threats.map((t) => (
                  <div key={t.type} className="rounded-md border border-line bg-surface-2/40 p-2.5">
                    <ThreatBadge threat={t.type as ThreatType} size="xs" />
                    <p className="mt-1.5 font-mono text-[10px] text-ink-4">
                      {(t.confidence * 100).toFixed(0)}% confidence · {t.agreement} layer
                      {t.agreement === 1 ? "" : "s"} agreed
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
