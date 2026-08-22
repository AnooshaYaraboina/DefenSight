import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { EstateReport, type EstateRow, type EstateStats } from "@/lib/reports/estate-report";
import { estateEmail } from "@/lib/email/template";
import { sendReport, isEmailConfigured } from "@/lib/email/ses";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";
import type { StageTrace } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every incident in a window, as one PDF.
 *
 * GET downloads it. POST also emails it to the signed-in analyst, whose address
 * comes from the session rather than the request.
 */

const WINDOW_DAYS = 30;

async function build(preparedFor: string) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [incidents, events, blocked, redacted, approvals, quarantined, policyRows] =
    await Promise.all([
      prisma.incident.findMany({
        where: { openedAt: { gte: since } },
        orderBy: [{ severity: "asc" }, { openedAt: "desc" }],
        include: {
          application: { select: { name: true } },
          agent: { select: { name: true } },
          events: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: { riskScore: true, stageTrace: true },
          },
        },
      }),
      prisma.securityEvent.count({ where: { createdAt: { gte: since } } }),
      prisma.securityEvent.count({ where: { createdAt: { gte: since }, blocked: true } }),
      prisma.securityEvent.count({ where: { createdAt: { gte: since }, redacted: true } }),
      prisma.toolApproval.count({ where: { status: "PENDING" } }),
      prisma.document.count({ where: { quarantined: true } }),
      prisma.policy.findMany({
        where: { hitCount: { gt: 0 } },
        orderBy: { hitCount: "desc" },
        take: 8,
        select: { name: true, hitCount: true },
      }),
    ]);

  const threatTally = new Map<string, number>();
  for (const i of incidents) {
    threatTally.set(i.threatType, (threatTally.get(i.threatType) ?? 0) + 1);
  }

  const layers = await prisma.detection.groupBy({
    by: ["layer"],
    where: { createdAt: { gte: since } },
  });

  const rows: EstateRow[] = incidents.map((i) => {
    const trace = jsonArray<StageTrace>(i.events[0]?.stageTrace ?? null);
    return {
      id: i.id,
      ref: i.ref,
      title: i.title,
      severity: i.severity,
      status: i.status,
      threatType: i.threatType,
      openedAt: i.openedAt,
      resolvedAt: i.resolvedAt,
      application: i.application?.name ?? null,
      agent: i.agent?.name ?? null,
      resolution: i.resolution,
      riskScore: i.events[0]?.riskScore ?? 0,
      stoppedAt: trace.find((st) => st.interventionPoint)?.label ?? null,
    };
  });

  const stats: EstateStats = {
    events,
    blocked,
    redacted,
    approvals,
    quarantined,
    detectionLayers: layers.map((l) => l.layer.toLowerCase()).sort(),
    topThreats: [...threatTally]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    topControls: policyRows.map((p) => ({ label: p.name, count: p.hitCount })),
  };

  const windowLabel = `last ${WINDOW_DAYS} days`;

  const pdf = await renderToBuffer(
    EstateReport({
      rows,
      stats,
      org: "Northwind Group",
      preparedFor,
      windowLabel,
      generatedAt: new Date(),
    }),
  );

  return { rows, stats, windowLabel, pdf: Buffer.from(pdf) };
}

export async function GET() {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "incidents:read");

    const { pdf } = await build(user.name);
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="defensight-incident-review-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, "Could not build the review");
  }
}

export async function POST() {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "incidents:read");

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email delivery is not configured on this deployment." },
        { status: 503 },
      );
    }
    if (!user.email) {
      return NextResponse.json(
        { error: "Your account has no email address on file." },
        { status: 400 },
      );
    }

    const { rows, windowLabel, pdf } = await build(user.name);
    const stamp = new Date().toISOString().slice(0, 10);

    const mail = estateEmail({
      recipientName: user.name,
      org: "Northwind Group",
      total: rows.length,
      resolved: rows.filter((r) => r.status === "RESOLVED").length,
      critical: rows.filter((r) => r.severity === "CRITICAL").length,
      windowLabel,
    });

    const result = await sendReport({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      filename: `defensight-incident-review-${stamp}.pdf`,
      pdf,
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: result.sent ? "report.emailed" : "report.email_failed",
        category: "DATA_ACCESS",
        targetType: "Report",
        targetId: "estate-review",
        targetLabel: `Incident review, ${windowLabel}`,
        description: result.sent
          ? `Consolidated incident review emailed to ${user.email}.`
          : `Consolidated incident review could not be delivered: ${result.reason}`,
        metadata: { recipient: user.email, incidents: rows.length },
        outcome: result.sent ? "SUCCESS" : "FAILURE",
      },
    });

    if (!result.sent) {
      return NextResponse.json({ error: result.reason ?? "Delivery failed." }, { status: 502 });
    }

    return NextResponse.json({
      sent: true,
      to: user.email,
      incidents: rows.length,
      bytes: pdf.length,
      messageId: result.messageId,
    });
  } catch (error) {
    return apiError(error, "Could not send the review");
  }
}
