import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/** Acknowledge one alert, or every unacknowledged alert (§24). */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "alerts:acknowledge");

    const { alertId, all } = (await request.json()) as { alertId?: string; all?: boolean };

    if (all) {
      const { count } = await prisma.alert.updateMany({
        where: { acknowledged: false },
        data: { acknowledged: true, acknowledgedById: user.id, acknowledgedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          actorId: user.id, actorName: user.name, actorRole: user.role,
          action: "alert.acknowledge_all", category: "SECURITY_DECISION",
          description: `Acknowledged ${count} outstanding alert${count === 1 ? "" : "s"}.`,
          outcome: "SUCCESS",
        },
      });
      return NextResponse.json({ acknowledged: count });
    }

    if (!alertId) {
      return NextResponse.json({ error: "alertId is required" }, { status: 400 });
    }

    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

    await prisma.alert.update({
      where: { id: alertId },
      data: { acknowledged: true, acknowledgedById: user.id, acknowledgedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id, actorName: user.name, actorRole: user.role,
        action: "alert.acknowledge", category: "SECURITY_DECISION",
        targetType: "Alert", targetId: alertId, targetLabel: alert.title,
        description: `Acknowledged: ${alert.title}`,
        outcome: "SUCCESS",
      },
    });

    return NextResponse.json({ acknowledged: 1 });
  } catch (error) {
    return apiError(error, "Acknowledge failed");
  }
}
