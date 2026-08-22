import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One request, in full, for the dashboard inspector.
 *
 * The wall lists what happened; selecting a row has to show the thing itself —
 * the prompt as submitted, what each pipeline stage made of it, and what came
 * back. Fetching on selection rather than shipping every trace with the page
 * keeps the initial payload to the rows that are actually rendered.
 *
 * The redacted response is preferred over the raw one wherever redaction ran.
 * A console that displays the unmasked value while reporting that it was masked
 * is the leak it claims to have prevented.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "events:read");

    const { id } = await params;
    const event = await prisma.securityEvent.findUnique({
      where: { id },
      select: {
        id: true,
        ref: true,
        createdAt: true,
        requestText: true,
        responseText: true,
        redactedResponse: true,
        decision: true,
        severity: true,
        riskScore: true,
        blocked: true,
        redacted: true,
        threatTypes: true,
        stageTrace: true,
        latencyMs: true,
        user: { select: { name: true, role: true } },
        application: { select: { name: true } },
        agent: { select: { name: true } },
        incident: { select: { id: true, ref: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: event.id,
      ref: event.ref,
      at: event.createdAt,
      user: event.user?.name ?? "Unattributed",
      userRole: event.user?.role ?? null,
      application: event.application?.name ?? "Unknown",
      agent: event.agent?.name ?? null,
      request: event.requestText,
      response: event.redacted
        ? (event.redactedResponse ?? event.responseText)
        : event.responseText,
      responseWasRedacted: event.redacted,
      decision: event.decision,
      severity: event.severity,
      riskScore: event.riskScore,
      blocked: event.blocked,
      threatTypes: event.threatTypes,
      stages: event.stageTrace,
      latencyMs: event.latencyMs,
      incident: event.incident,
    });
  } catch (error) {
    return apiError(error, "Could not load the request");
  }
}
