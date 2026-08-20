import { Database, FileWarning, HardDrive, Library, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getRagOverview } from "@/lib/queries/rag";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatTile } from "@/components/security/stat-tile";
import { DocumentTable } from "@/components/security/document-table";
import { DocumentUpload } from "@/components/security/document-upload";
import { Tooltip } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";
export const metadata = { title: "RAG Security" };

export default async function RagPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; q?: string }>;
}) {
  const params = await searchParams;
  const { documents, sources, stores, counts, stats } = await getRagOverview(params);

  return (
    <>
      <PageHeader
        title="RAG Security Center"
        description="Documents, data sources and vector stores feeding the AI estate. Trust is a property of provenance: content from an unreviewed source is treated as hostile input no matter how legitimate it looks."
        actions={<DocumentUpload sources={sources.map((s) => ({ id: s.id, name: s.name }))} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Documents Indexed" value={stats.total} hint="Documents available to retrieval across all vector stores." />
        <StatTile label="Quarantined" value={stats.quarantined} polarity="higher-is-worse" hint="Withheld from every retrieval after the scanner flagged them." />
        <StatTile label="From External Sources" value={stats.externalDocuments} polarity="higher-is-worse" hint="Documents authored outside the organisation. The primary indirect-injection surface." />
        <StatTile label="Retrievals Withheld" value={stats.withheldRetrievals} polarity="higher-is-worse" hint="Times a retrieval was blocked before reaching the model." />
        <StatTile label="Total Retrievals" value={stats.totalRetrievals} hint="Document lookups evaluated by the pipeline." />
      </div>

      <Tabs defaultValue="documents">
        <TabsList className="mb-4">
          <TabsTrigger value="documents">
            <FileWarning />
            Documents
            <Badge tone="neutral" size="xs">{documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sources">
            <Database />
            Data sources
            <Badge tone="neutral" size="xs">{sources.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="stores">
            <HardDrive />
            Vector stores
            <Badge tone="neutral" size="xs">{stores.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentTable
            documents={documents.map((d) => ({
              id: d.id,
              title: d.title,
              classification: d.classification,
              trustScore: d.trustScore,
              riskLevel: d.riskLevel,
              scanStatus: d.scanStatus,
              quarantined: d.quarantined,
              quarantineReason: d.quarantineReason,
              sourceName: d.source.name,
              sourceIsExternal: d.source.isExternal,
              sourceTrust: d.source.trustLevel,
              owner: d.owner,
              sizeBytes: d.sizeBytes,
              findingCount: d._count.findings,
              retrievalCount: d._count.retrievals,
              vectorStore: d.vectorStore?.name ?? null,
              topThreat: d.scanSummary?.threats?.[0]?.type ?? null,
            }))}
            counts={counts}
          />
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => (
              <Card key={source.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink">{source.name}</h3>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-4">{source.type}</p>
                  </div>
                  {source.isExternal ? (
                    <Tooltip content="Content originates outside the organisation and is never implicitly trusted.">
                      <Badge tone="critical" size="xs">
                        <ShieldOff />
                        External
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Badge tone="allow" size="xs">Internal</Badge>
                  )}
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{source.description}</p>

                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                      Trust ceiling
                    </span>
                    <span className="font-mono text-[11px] tabular text-ink-2">
                      {source.trustLevel}/100
                    </span>
                  </div>
                  <Meter
                    value={source.trustLevel}
                    tone={source.trustLevel >= 70 ? "allow" : source.trustLevel >= 40 ? "medium" : "critical"}
                    aria-label={`Trust level ${source.trustLevel} of 100`}
                  />
                  <p className="mt-1.5 text-[10px] leading-snug text-ink-4">
                    No document from this source can exceed this trust score, whatever its content.
                  </p>
                </div>

                <dl className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[10px]">
                  <dt className="text-ink-4">Documents</dt>
                  <dd className="font-mono text-ink-2">{source._count.documents}</dd>
                </dl>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="stores">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <Card key={store.id} className="p-4">
                <div className="flex items-start gap-2.5">
                  <Library className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink">{store.name}</h3>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-4">
                      {store.provider} · {store.indexName}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[11px]">
                  <div className="flex justify-between">
                    <dt className="text-ink-4">Embedding dimensions</dt>
                    <dd className="font-mono text-ink-2">{store.dimensions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-4">Documents indexed</dt>
                    <dd className="font-mono text-ink-2">{store._count.documents}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-4">Status</dt>
                    <dd><Badge tone="allow" size="xs">{store.status}</Badge></dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
