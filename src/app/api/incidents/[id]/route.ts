import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/db/json";
import { canTransition, type IncidentStatus } from "@/lib/engine/taxonomy";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/**
 * Incident lifecycle transitions (§17).
 *
 * The permitted-transition table is enforced here, server-side. The UI only
 * offers valid moves as a usability affordance; this is the boundary that
 * actually holds, and every transition writes both a timeline entry and an
 * audit record.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "incidents:write");

    const { id } = await params;
    const body = (await request.json()) as {
      status?: IncidentStatus;
      assignedToId?: string | null;
      resolution?: string;
      note?: string;
    };

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const timeline: Array<{ kind: string; message: string; metadata?: object }> = [];

    if (body.status && body.status !== incident.status) {
      if (!canTransition(incident.status as IncidentStatus, body.status)) {
        return NextResponse.json(
          {
            error: `Cannot move an incident from ${incident.status} to ${body.status}.`,
          },
          { status: 422 },
        );
      }
      updates.status = body.status;
      if (body.status === "CONTAINED") updates.containedAt = new Date();
      if (body.status === "RESOLVED") updates.resolvedAt = new Date();
      if (body.status === "INVESTIGATING" && !incident.assignedToId) {
        updates.assignedToId = user.id;
      }
      timeline.push({
        kind: "STATUS_CHANGE",
        message: `Status changed from ${incident.status.toLowerCase()} to ${body.status.toLowerCase()}.`,
        metadata: { from: incident.status, to: body.status },
      });
    }

    if (body.assignedToId !== undefined) {
      updates.assignedToId = body.assignedToId;
      const assignee = body.assignedToId
        ? await prisma.user.findUnique({ where: { id: body.assignedToId }, select: { name: true } })
        : null;
      timeline.push({
        kind: "ACTION",
        message: assignee ? `Assigned to ${assignee.name}.` : "Assignment cleared.",
      });
    }

    if (body.resolution) {
      updates.resolution = body.resolution;
      timeline.push({ kind: "NOTE", message: `Resolution recorded: ${body.resolution}` });
    }

    if (body.note) {
      timeline.push({ kind: "NOTE", message: body.note });
    }

    const updated = Object.keys(updates).length
      ? await prisma.incident.update({ where: { id }, data: updates })
      : incident;

    for (const entry of timeline) {
      await prisma.incidentTimelineEntry.create({
        data: {
          incidentId: id,
          kind: entry.kind,
          actor: user.name,
          message: entry.message,
          metadata: entry.metadata ? asJson(entry.metadata) : undefined,
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: `incident.${entry.kind.toLowerCase()}`,
          category: "INCIDENT",
          targetType: "Incident",
          targetId: id,
          targetLabel: incident.ref,
          description: entry.message,
          outcome: "SUCCESS",
        },
      });
    }

    return NextResponse.json({ incident: updated });
  } catch (error) {
    return apiError(error, "Update failed");
  }
}
