import "server-only";
import { prisma } from "@/lib/db";
import { jsonObject } from "@/lib/db/json";
import type { Classification, Severity } from "@/lib/engine/taxonomy";

export interface DocumentScanSummary {
  status: string;
  riskScore: number;
  trustScore: number;
  obfuscation: number;
  reasoning: string[];
  threats: Array<{ type: string; confidence: number; layers: string[]; agreement: number }>;
  sensitive: Array<{ type: string; category: string; count: number; sample: string }>;
  durationMs: number;
}

export async function getRagOverview(filters: { status?: string; source?: string; q?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (filters.status === "quarantined") where.quarantined = true;
  else if (filters.status) where.scanStatus = filters.status;
  if (filters.source) where.source = { id: filters.source };
  if (filters.q) where.title = { contains: filters.q };

  const [documents, sources, stores, counts, retrievalStats] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ quarantined: "desc" }, { trustScore: "asc" }, { title: "asc" }],
      include: {
        source: { select: { id: true, name: true, isExternal: true, trustLevel: true } },
        vectorStore: { select: { name: true } },
        _count: { select: { findings: true, retrievals: true } },
      },
    }),
    prisma.dataSource.findMany({
      orderBy: { trustLevel: "asc" },
      include: { _count: { select: { documents: true } } },
    }),
    prisma.vectorStore.findMany({
      include: { _count: { select: { documents: true } } },
    }),
    prisma.document.groupBy({ by: ["scanStatus"], _count: true }),
    prisma.retrievalEvent.groupBy({ by: ["allowed"], _count: true }),
  ]);

  const quarantined = documents.filter((d) => d.quarantined).length;
  const withheldRetrievals = retrievalStats.find((r) => !r.allowed)?._count ?? 0;
  const totalRetrievals = retrievalStats.reduce((s, r) => s + r._count, 0);

  return {
    documents: documents.map((d) => ({
      ...d,
      classification: d.classification as Classification,
      scanSummary: d.scanResult
        ? jsonObject<DocumentScanSummary>(d.scanResult, {
            status: d.scanStatus, riskScore: 0, trustScore: d.trustScore,
            obfuscation: 0, reasoning: [], threats: [], sensitive: [], durationMs: 0,
          })
        : null,
    })),
    sources,
    stores,
    counts: Object.fromEntries(counts.map((c) => [c.scanStatus, c._count])) as Record<string, number>,
    stats: {
      total: documents.length,
      quarantined,
      withheldRetrievals,
      totalRetrievals,
      externalDocuments: documents.filter((d) => d.source.isExternal).length,
    },
  };
}

export async function getDocumentDetail(id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      source: true,
      vectorStore: true,
      uploadedBy: { select: { name: true, email: true } },
      findings: { orderBy: [{ severity: "asc" }, { confidence: "desc" }] },
      retrievals: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          event: {
            select: {
              id: true, ref: true, createdAt: true, riskScore: true,
              severity: true, decision: true, blocked: true,
              user: { select: { name: true } },
              agent: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!document) return null;

  return {
    ...document,
    classification: document.classification as Classification,
    findings: document.findings.map((f) => ({ ...f, severity: f.severity as Severity })),
    scanSummary: document.scanResult
      ? jsonObject<DocumentScanSummary>(document.scanResult, {
          status: document.scanStatus, riskScore: 0, trustScore: document.trustScore,
          obfuscation: 0, reasoning: [], threats: [], sensitive: [], durationMs: 0,
        })
      : null,
  };
}

export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof getDocumentDetail>>>;
