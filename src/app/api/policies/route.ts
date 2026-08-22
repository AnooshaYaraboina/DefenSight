import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/**
 * Policy configuration (§20).
 *
 * Policies are data, so enabling, disabling and reprioritising one is a
 * database write — no deployment, no code change. Because the pipeline reads
 * the policy set per request, the effect is immediate.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "policies:write");

    const body = (await request.json()) as {
      key: string;
      enabled?: boolean;
      priority?: number;
    };

    const policy = await prisma.policy.findUnique({ where: { key: body.key } });
    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const changes: string[] = [];

    if (body.enabled !== undefined && body.enabled !== policy.enabled) {
      updates.enabled = body.enabled;
      changes.push(body.enabled ? "enabled" : "disabled");
    }
    if (body.priority !== undefined && body.priority !== policy.priority) {
      updates.priority = Math.max(1, Math.min(999, body.priority));
      changes.push(`priority ${policy.priority} → ${updates.priority}`);
    }

    if (changes.length === 0) return NextResponse.json({ policy });

    const updated = await prisma.policy.update({ where: { key: body.key }, data: updates });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "policy.update",
        category: "CONFIG",
        targetType: "Policy",
        targetId: policy.id,
        targetLabel: policy.name,
        description: `${policy.name}: ${changes.join(", ")}.`,
        outcome: body.enabled === false ? "FAILURE" : "SUCCESS",
      },
    });

    return NextResponse.json({ policy: updated });
  } catch (error) {
    return apiError(error, "Update failed");
  }
}
