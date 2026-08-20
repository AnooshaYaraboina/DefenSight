import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac/session";
import { assertCan, ForbiddenError } from "@/lib/rbac/permissions";
import { DECISIONS, type Decision } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

/**
 * Guardrail configuration (§13).
 *
 * Administrators enable, disable and retune controls here and the change takes
 * effect on the next request — the pipeline reads guardrail configuration per
 * request rather than caching it at boot. Every change is audited, because
 * turning a control off is itself a security event.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    assertCan(user.role, "guardrails:write");

    const body = (await request.json()) as {
      key: string;
      enabled?: boolean;
      threshold?: number;
      action?: Decision;
    };

    const guardrail = await prisma.guardrail.findUnique({ where: { key: body.key } });
    if (!guardrail) {
      return NextResponse.json({ error: "Guardrail not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const changes: string[] = [];

    if (body.enabled !== undefined && body.enabled !== guardrail.enabled) {
      updates.enabled = body.enabled;
      changes.push(body.enabled ? "enabled" : "disabled");
    }
    if (body.threshold !== undefined && body.threshold !== guardrail.threshold) {
      if (body.threshold < 0 || body.threshold > 100) {
        return NextResponse.json(
          { error: "Threshold must be between 0 and 100." },
          { status: 422 },
        );
      }
      updates.threshold = body.threshold;
      changes.push(`threshold ${guardrail.threshold} → ${body.threshold}`);
    }
    if (body.action && body.action !== guardrail.action) {
      if (!DECISIONS.includes(body.action)) {
        return NextResponse.json({ error: "Unknown action." }, { status: 422 });
      }
      updates.action = body.action;
      changes.push(`action ${guardrail.action} → ${body.action}`);
    }

    if (changes.length === 0) {
      return NextResponse.json({ guardrail });
    }

    const updated = await prisma.guardrail.update({ where: { key: body.key }, data: updates });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "guardrail.update",
        category: "CONFIG",
        targetType: "Guardrail",
        targetId: guardrail.id,
        targetLabel: guardrail.name,
        description: `${guardrail.name}: ${changes.join(", ")}.`,
        // Weakening a control is recorded as a failure outcome so it stands out
        // in the audit log rather than blending into routine configuration.
        outcome: body.enabled === false ? "FAILURE" : "SUCCESS",
      },
    });

    return NextResponse.json({ guardrail: updated });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 },
    );
  }
}
