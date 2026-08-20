import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import type { IncidentStatus, Severity, ThreatType } from "@/lib/engine/taxonomy";
import type { StageTrace } from "@/lib/engine/types";

export async function getIncidents(filters: { status?: string; severity?: string; q?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { ref: { contains: filters.q } },
      { summary: { contains: filters.q } },
    ];
  }

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    include: {
      application: { select: { name: true, slug: true } },
      agent: { select: { name: true, slug: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { events: true, timeline: true } },
    },
  });

  const counts = await prisma.incident.groupBy({ by: ["status"], _count: true });

  return {
    incidents: incidents.map((i) => ({
      ...i,
      attackChain: jsonArray<StageTrace>(i.attackChain),
      severity: i.severity as Severity,
      status: i.status as IncidentStatus,
      threatType: i.threatType as ThreatType,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>,
  };
}

export async function getIncidentDetail(id: string) {
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      application: { select: { name: true, slug: true } },
      agent: { select: { name: true, slug: true, purpose: true, riskLevel: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      timeline: { orderBy: { createdAt: "asc" } },
      alerts: true,
      events: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { name: true } },
          detections: { orderBy: { confidence: "desc" } },
          toolCalls: { include: { tool: true, approval: true } },
          retrievals: {
            include: {
              document: {
                select: {
                  id: true, title: true, classification: true, trustScore: true,
                  quarantined: true, scanStatus: true,
                  source: { select: { name: true, isExternal: true } },
                },
              },
            },
          },
          sensitiveHits: true,
        },
      },
    },
  });

  if (!incident) return null;

  return {
    ...incident,
    severity: incident.severity as Severity,
    status: incident.status as IncidentStatus,
    threatType: incident.threatType as ThreatType,
    attackChain: jsonArray<StageTrace>(incident.attackChain),
    aiRecommendations: jsonArray<string>(incident.aiRecommendations),
    events: incident.events.map((e) => ({
      ...e,
      threatTypes: jsonArray<ThreatType>(e.threatTypes),
      stageTrace: jsonArray<StageTrace>(e.stageTrace),
    })),
  };
}

export type IncidentDetail = NonNullable<Awaited<ReturnType<typeof getIncidentDetail>>>;
