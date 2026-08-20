import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/db/json";
import { scanDocument } from "@/lib/engine";
import { getCurrentUser } from "@/lib/rbac/session";
import { assertCan, ForbiddenError } from "@/lib/rbac/permissions";
import { bus } from "@/lib/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ingest a document and run it through the real scanner (§11). */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    assertCan(user.role, "documents:upload");

    const body = (await request.json()) as {
      title?: string;
      content?: string;
      sourceId?: string;
      classification?: string;
    };

    if (!body.title?.trim() || !body.content?.trim() || !body.sourceId) {
      return NextResponse.json(
        { error: "Title, content and data source are required." },
        { status: 400 },
      );
    }

    const source = await prisma.dataSource.findUnique({ where: { id: body.sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Unknown data source." }, { status: 404 });
    }

    const scan = scanDocument({
      title: body.title,
      content: body.content,
      classification: (body.classification ?? "INTERNAL") as never,
      sourceTrust: source.trustLevel,
      sourceName: source.name,
      sourceIsExternal: source.isExternal,
    });

    const store = await prisma.vectorStore.findFirst();

    const document = await prisma.document.create({
      data: {
        title: body.title,
        content: body.content,
        sourceId: source.id,
        // A quarantined document is never indexed. Scanning after indexing
        // would leave a window in which the payload is retrievable.
        vectorStoreId: scan.quarantine ? null : store?.id ?? null,
        owner: user.name,
        classification: (body.classification ?? "INTERNAL") as never,
        trustScore: scan.trustScore,
        riskLevel: scan.riskLevel,
        scanStatus: scan.status,
        scanResult: asJson({
          status: scan.status,
          riskScore: scan.riskScore,
          trustScore: scan.trustScore,
          obfuscation: scan.obfuscation,
          reasoning: scan.reasoning,
          threats: scan.fusion.threats.map((t) => ({
            type: t.threatType, confidence: t.confidence, layers: t.layers, agreement: t.agreement,
          })),
          sensitive: scan.sensitiveFindings.map((f) => ({
            type: f.type, category: f.category, count: f.count, sample: f.maskedSample,
          })),
          durationMs: scan.durationMs,
        }),
        scannedAt: new Date(),
        quarantined: scan.quarantine,
        quarantineReason: scan.quarantineReason ?? null,
        quarantinedAt: scan.quarantine ? new Date() : null,
        contentHash: createHash("sha256").update(body.content).digest("hex").slice(0, 32),
        sizeBytes: Buffer.byteLength(body.content, "utf8"),
        chunkCount: Math.max(1, Math.ceil(body.content.length / 1200)),
        uploadedById: user.id,
      },
    });

    const findings = scan.detections.flatMap((d) => {
      const spans = d.evidence.spans ?? [];
      const anchors = spans.length
        ? spans.slice(0, 4)
        : [{ start: 0, end: 0, text: "", label: d.threatType }];
      return anchors.map((span) => ({
        documentId: document.id,
        detectorId: d.detectorId,
        threatType: d.threatType,
        severity: d.severity,
        confidence: d.confidence,
        snippet: (span.text || body.content!.slice(0, 160)).slice(0, 300),
        offsetStart: span.start,
        offsetEnd: span.end,
        explanation: d.explanation,
        evidence: asJson(d.evidence),
      }));
    });
    if (findings.length) await prisma.documentFinding.createMany({ data: findings });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "document.scan",
        category: "DOCUMENT",
        targetType: "Document",
        targetId: document.id,
        targetLabel: document.title,
        description: `Scanned "${document.title}" from ${source.name}. Verdict: ${scan.status}${scan.quarantine ? " — quarantined" : ""}.`,
        metadata: asJson({ riskScore: scan.riskScore, trustScore: scan.trustScore }),
        outcome: scan.quarantine ? "FAILURE" : "SUCCESS",
      },
    });

    bus.publish({
      type: "document_scan",
      id: document.id,
      timestamp: new Date().toISOString(),
      payload: {
        title: document.title,
        status: scan.status,
        quarantined: scan.quarantine,
        riskScore: scan.riskScore,
      },
    });

    return NextResponse.json({
      documentId: document.id,
      status: scan.status,
      riskScore: scan.riskScore,
      trustScore: scan.trustScore,
      quarantined: scan.quarantine,
      quarantineReason: scan.quarantineReason,
      reasoning: scan.reasoning,
      threats: scan.fusion.threats.map((t) => ({
        type: t.threatType, confidence: t.confidence, agreement: t.agreement,
      })),
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
