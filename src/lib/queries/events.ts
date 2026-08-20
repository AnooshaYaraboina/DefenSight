import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";
import type { Decision, Severity, ThreatType } from "@/lib/engine/taxonomy";

/** Server-rendered seed for the live feed, in the same shape the stream emits. */
export async function getRecentEvents(limit = 30): Promise<LiveSecurityEvent[]> {
  const events = await prisma.securityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      application: { select: { name: true, slug: true } },
      agent: { select: { name: true } },
      user: { select: { name: true, role: true } },
      model: { select: { name: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    ref: e.ref,
    createdAt: e.createdAt.toISOString(),
    application: e.application?.name ?? "—",
    applicationSlug: e.application?.slug ?? "",
    agent: e.agent?.name,
    model: e.model?.name,
    user: e.user?.name ?? "—",
    userRole: e.user?.role ?? "VIEWER",
    request: e.requestText.slice(0, 240),
    riskScore: e.riskScore,
    severity: e.severity as Severity,
    decision: e.decision as Decision,
    threatTypes: jsonArray<ThreatType>(e.threatTypes),
    blocked: e.blocked,
    redacted: e.redacted,
    detectionCount: e.detectionCount,
    toolCallCount: e.toolCallCount,
    retrievalCount: e.retrievalCount,
    latencyMs: e.latencyMs,
    simulated: e.simulated,
    summary: "",
  }));
}

/** Counts backing the sidebar badges. */
export async function getNavBadges() {
  const [activeThreats, openIncidents, pendingApprovals, unreadAlerts] = await Promise.all([
    prisma.securityEvent.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        severity: { in: ["CRITICAL", "HIGH"] },
      },
    }),
    prisma.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.toolApproval.count({ where: { status: "PENDING" } }),
    prisma.alert.count({ where: { acknowledged: false } }),
  ]);
  return { activeThreats, openIncidents, pendingApprovals, unreadAlerts };
}
