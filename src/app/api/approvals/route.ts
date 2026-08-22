import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/**
 * Human approval decisions for high-impact tool calls (§14, §20).
 *
 * Approving does not retroactively bless a call that failed its gateway checks
 * — those were refused before ever reaching this queue. Approval only releases
 * calls held *because* they were high-impact, which is the whole point of the
 * hold: a person, named in the audit log, takes responsibility for the effect.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "approvals:decide");

    const { approvalId, decision, justification } = (await request.json()) as {
      approvalId: string;
      decision: "APPROVED" | "DENIED";
      justification?: string;
    };

    const approval = await prisma.toolApproval.findUnique({
      where: { id: approvalId },
      include: { toolCall: { include: { tool: true, agent: true } } },
    });

    if (!approval) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }
    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { error: `This request was already ${approval.status.toLowerCase()}.` },
        { status: 409 },
      );
    }
    if (approval.expiresAt < new Date()) {
      await prisma.toolApproval.update({
        where: { id: approvalId },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "This request expired before it was decided." },
        { status: 410 },
      );
    }

    await prisma.toolApproval.update({
      where: { id: approvalId },
      data: {
        status: decision,
        decidedById: user.id,
        decidedAt: new Date(),
        justification: justification ?? null,
      },
    });

    await prisma.toolCall.update({
      where: { id: approval.toolCallId },
      data: {
        decision: decision === "APPROVED" ? "ALLOW" : "BLOCK",
        executed: decision === "APPROVED",
        executedAt: decision === "APPROVED" ? new Date() : null,
        reason:
          decision === "APPROVED"
            ? `${approval.toolCall.reason} Authorised by ${user.name}.`
            : `${approval.toolCall.reason} Refused by ${user.name}.`,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: decision === "APPROVED" ? "approval.grant" : "approval.deny",
        category: "TOOL",
        targetType: "ToolCall",
        targetId: approval.toolCallId,
        targetLabel: approval.toolCall.tool.name,
        description:
          decision === "APPROVED"
            ? `Authorised ${approval.toolCall.tool.name} (${approval.toolCall.operation}) for ${approval.toolCall.agent.name}.${justification ? ` Justification: ${justification}` : ""}`
            : `Refused ${approval.toolCall.tool.name} (${approval.toolCall.operation}) for ${approval.toolCall.agent.name}.${justification ? ` Justification: ${justification}` : ""}`,
        outcome: decision === "APPROVED" ? "SUCCESS" : "FAILURE",
      },
    });

    return NextResponse.json({ status: decision });
  } catch (error) {
    return apiError(error, "Decision failed");
  }
}
