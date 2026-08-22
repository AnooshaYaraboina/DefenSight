import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getIncidentDetail } from "@/lib/queries/incidents";
import { IncidentReport } from "@/lib/reports/incident-report";
import { incidentEmail } from "@/lib/email/template";
import { sendReport, isEmailConfigured } from "@/lib/email/ses";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One incident, as a PDF.
 *
 * GET downloads it. POST also emails it to the signed-in analyst — their
 * address comes from the session, never from the request body, so this endpoint
 * cannot be used to post someone else's incident evidence to an arbitrary
 * mailbox.
 */

async function build(id: string, preparedFor: string) {
  const incident = await getIncidentDetail(id);
  if (!incident) return null;

  const pdf = await renderToBuffer(
    IncidentReport({
      incident,
      org: "Northwind Group",
      preparedFor,
      generatedAt: new Date(),
    }),
  );

  return { incident, pdf: Buffer.from(pdf) };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "incidents:read");

    const { id } = await params;
    const built = await build(id, user.name);
    if (!built) return NextResponse.json({ error: "Incident not found." }, { status: 404 });

    return new NextResponse(new Uint8Array(built.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${built.incident.ref}-report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, "Could not build the report");
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const built = await build(id, user.name);
    if (!built) return NextResponse.json({ error: "Incident not found." }, { status: 404 });

    const { incident, pdf } = built;
    const primary = incident.events[0];
    const stopped = incident.attackChain.find((st) => st.interventionPoint)?.label ?? null;

    const mail = incidentEmail({
      recipientName: user.name,
      ref: incident.ref,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      threat: incident.threatType,
      riskScore: primary?.riskScore ?? 0,
      stoppedAt: stopped,
      org: "Northwind Group",
    });

    const result = await sendReport({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      filename: `${incident.ref}-report.pdf`,
      pdf,
    });

    /* Recorded either way. "A report was sent" and "a report was attempted" are
       different facts, and an audit trail that only keeps the happy path is not
       an audit trail. */
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: result.sent ? "report.emailed" : "report.email_failed",
        category: "DATA_ACCESS",
        targetType: "Incident",
        targetId: incident.id,
        targetLabel: incident.ref,
        description: result.sent
          ? `Incident report for ${incident.ref} emailed to ${user.email}.`
          : `Incident report for ${incident.ref} could not be delivered: ${result.reason}`,
        metadata: { recipient: user.email, messageId: result.messageId ?? null },
        outcome: result.sent ? "SUCCESS" : "FAILURE",
      },
    });

    if (!result.sent) {
      return NextResponse.json({ error: result.reason ?? "Delivery failed." }, { status: 502 });
    }

    return NextResponse.json({
      sent: true,
      to: user.email,
      ref: incident.ref,
      bytes: pdf.length,
      messageId: result.messageId,
    });
  } catch (error) {
    return apiError(error, "Could not send the report");
  }
}
