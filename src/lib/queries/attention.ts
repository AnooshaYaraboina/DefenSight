import "server-only";
import { prisma } from "@/lib/db";
import type { Severity } from "@/lib/engine/taxonomy";

/**
 * The work queue: things a human must actually do something about.
 *
 * A dashboard's right rail should answer "what needs me?", not "what is the
 * largest number?". Every item here has an owner-shaped action behind it —
 * triage this case, authorise this call, review this document — and links
 * straight to where that action is taken.
 */

export interface AttentionItem {
  id: string;
  kind: "incident" | "approval" | "document" | "alert";
  title: string;
  detail: string;
  severity: Severity;
  href: string;
  at: Date;
  /** Shown when the item has a deadline. */
  expiresAt?: Date;
}

export async function getAttentionQueue(limit = 8): Promise<{
  items: AttentionItem[];
  counts: { incidents: number; approvals: number; documents: number; alerts: number };
}> {
  const [incidents, approvals, documents, alerts] = await Promise.all([
    prisma.incident.findMany({
      where: { status: { in: ["OPEN", "INVESTIGATING"] } },
      orderBy: [{ severity: "asc" }, { openedAt: "desc" }],
      take: 6,
      select: {
        id: true, ref: true, title: true, severity: true, status: true,
        openedAt: true, assignedToId: true,
      },
    }),
    prisma.toolApproval.findMany({
      where: { status: "PENDING" },
      orderBy: { expiresAt: "asc" },
      take: 5,
      include: {
        toolCall: {
          include: {
            tool: { select: { name: true, riskTier: true } },
            agent: { select: { name: true } },
          },
        },
      },
    }),
    prisma.document.findMany({
      where: { quarantined: true },
      orderBy: { quarantinedAt: "desc" },
      take: 4,
      select: {
        id: true, title: true, quarantineReason: true, quarantinedAt: true,
        source: { select: { name: true } },
      },
    }),
    prisma.alert.findMany({
      where: { acknowledged: false, severity: "CRITICAL" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, message: true, severity: true, createdAt: true },
    }),
  ]);

  const items: AttentionItem[] = [
    ...incidents.map((i) => ({
      id: i.id,
      kind: "incident" as const,
      title: i.title,
      detail: i.assignedToId
        ? `${i.ref} · under investigation`
        : `${i.ref} · unassigned`,
      severity: i.severity as Severity,
      href: `/incidents/${i.id}`,
      at: i.openedAt,
    })),
    ...approvals.map((a) => ({
      id: a.id,
      kind: "approval" as const,
      title: `${a.toolCall.tool.name} awaiting authorisation`,
      detail: `Requested by ${a.toolCall.agent.name} · tier ${a.toolCall.tool.riskTier}`,
      severity: (a.toolCall.tool.riskTier >= 5 ? "CRITICAL" : "HIGH") as Severity,
      href: "/tools",
      at: a.createdAt,
      expiresAt: a.expiresAt,
    })),
    ...documents.map((d) => ({
      id: d.id,
      kind: "document" as const,
      title: d.title,
      detail: `Quarantined from ${d.source.name}`,
      severity: "HIGH" as Severity,
      href: `/rag/documents/${d.id}`,
      at: d.quarantinedAt ?? new Date(),
    })),
    ...alerts.map((a) => ({
      id: a.id,
      kind: "alert" as const,
      title: a.title,
      detail: a.message.slice(0, 90),
      severity: a.severity as Severity,
      href: "/alerts",
      at: a.createdAt,
    })),
  ];

  // Deadline first, then severity, then recency — an expiring approval is more
  // urgent than an older incident of the same severity.
  const rank: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  items.sort((a, b) => {
    if (a.expiresAt && !b.expiresAt) return -1;
    if (!a.expiresAt && b.expiresAt) return 1;
    const bySeverity = rank[a.severity] - rank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.at.getTime() - a.at.getTime();
  });

  const [incidentCount, approvalCount, documentCount, alertCount] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.toolApproval.count({ where: { status: "PENDING" } }),
    prisma.document.count({ where: { quarantined: true } }),
    prisma.alert.count({ where: { acknowledged: false } }),
  ]);

  return {
    items: items.slice(0, limit),
    counts: {
      incidents: incidentCount,
      approvals: approvalCount,
      documents: documentCount,
      alerts: alertCount,
    },
  };
}
