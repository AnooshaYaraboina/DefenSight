import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray, jsonObject } from "@/lib/db/json";
import type { Decision, Severity, ThreatType } from "@/lib/engine/taxonomy";
import type { RiskFactor, StageTrace } from "@/lib/engine/types";

export interface EventFilters {
  q?: string;
  severity?: string;
  decision?: string;
  application?: string;
  agent?: string;
  threat?: string;
  page?: number;
}

const PAGE_SIZE = 40;

export async function getEvents(filters: EventFilters) {
  const page = Math.max(1, filters.page ?? 1);

  const where: Record<string, unknown> = {};
  if (filters.severity) where.severity = filters.severity;
  if (filters.decision) where.decision = filters.decision;
  if (filters.application) where.application = { slug: filters.application };
  if (filters.agent) where.agent = { slug: filters.agent };
  if (filters.q) {
    where.OR = [
      { requestText: { contains: filters.q } },
      { ref: { contains: filters.q } },
      { user: { name: { contains: filters.q } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        application: { select: { name: true, slug: true } },
        agent: { select: { name: true, slug: true } },
        user: { select: { name: true, role: true } },
        model: { select: { name: true } },
      },
    }),
    prisma.securityEvent.count({ where }),
  ]);

  // Threat filtering happens after the query: SQLite cannot index inside a Json
  // array, and the alternative — a join table duplicating the denormalised
  // column — would be a second source of truth for the same fact.
  const events = rows
    .map((e) => ({
      id: e.id,
      ref: e.ref,
      createdAt: e.createdAt,
      application: e.application?.name ?? "—",
      applicationSlug: e.application?.slug ?? "",
      agent: e.agent?.name,
      agentSlug: e.agent?.slug,
      model: e.model?.name ?? "—",
      user: e.user?.name ?? "—",
      userRole: e.user?.role ?? "VIEWER",
      request: e.requestText,
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
      incidentId: e.incidentId,
    }))
    .filter((e) => !filters.threat || e.threatTypes.includes(filters.threat as ThreatType));

  return {
    events,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getFilterOptions() {
  const [applications, agents] = await Promise.all([
    prisma.aiApplication.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.agent.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  return { applications, agents };
}

export async function getEventDetail(id: string) {
  const event = await prisma.securityEvent.findUnique({
    where: { id },
    include: {
      application: { select: { name: true, slug: true, systemPrompt: true } },
      agent: { select: { name: true, slug: true, purpose: true, riskLevel: true, securityScore: true } },
      user: { select: { name: true, email: true, role: true, clearance: true, department: true, riskScore: true } },
      model: { select: { name: true, provider: true } },
      detections: { orderBy: { confidence: "desc" } },
      sensitiveHits: true,
      toolCalls: { include: { tool: true, approval: true }, orderBy: { createdAt: "asc" } },
      retrievals: {
        include: {
          document: {
            select: {
              id: true, title: true, classification: true, trustScore: true,
              quarantined: true, scanStatus: true,
              source: { select: { name: true, isExternal: true, trustLevel: true } },
            },
          },
        },
      },
      incident: { select: { id: true, ref: true, status: true, severity: true } },
      alerts: true,
    },
  });

  if (!event) return null;

  const riskFactors = jsonObject<{
    score: number; confidence: number; rationale: string;
    topDrivers: string[]; factors: RiskFactor[];
  }>(event.riskFactors, { score: event.riskScore, confidence: 0, rationale: "", topDrivers: [], factors: [] });

  return {
    ...event,
    threatTypes: jsonArray<ThreatType>(event.threatTypes),
    stageTrace: jsonArray<StageTrace>(event.stageTrace),
    riskAssessment: riskFactors,
  };
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEventDetail>>>;
