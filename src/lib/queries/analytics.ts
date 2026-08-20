import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { THREAT_META, type Severity, type ThreatType } from "@/lib/engine/taxonomy";
import { rangeFor, RANGES } from "./dashboard";

export { RANGES };

export interface AnalyticsFilters {
  range?: string;
  application?: string;
  agent?: string;
  severity?: string;
}

export async function getAnalytics(filters: AnalyticsFilters = {}) {
  const range = rangeFor(filters.range);
  const since = new Date(Date.now() - range.hours * 3600_000);

  const where: Record<string, unknown> = { createdAt: { gte: since } };
  if (filters.application) where.application = { slug: filters.application };
  if (filters.agent) where.agent = { slug: filters.agent };
  if (filters.severity) where.severity = filters.severity;

  const [events, applications, agents, toolCalls, sensitiveHits, incidents] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      select: {
        createdAt: true, riskScore: true, severity: true, decision: true,
        blocked: true, redacted: true, threatTypes: true,
        applicationId: true, agentId: true, userId: true,
        application: { select: { name: true, slug: true } },
        agent: { select: { name: true, slug: true } },
        user: { select: { name: true, department: true } },
      },
    }),
    prisma.aiApplication.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.agent.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.toolCall.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true, tool: { select: { name: true } } },
    }),
    prisma.sensitiveHit.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, category: true, count: true },
    }),
    prisma.incident.findMany({
      where: { openedAt: { gte: since } },
      select: { severity: true, status: true, threatType: true, openedAt: true, resolvedAt: true },
    }),
  ]);

  const useHours = range.hours <= 48;
  const bucketMs = useHours ? 3600_000 : 86_400_000;
  const bucketCount = useHours ? Math.min(24, range.hours) : Math.ceil(range.hours / 24);
  const end = useHours
    ? Math.ceil(Date.now() / bucketMs) * bucketMs
    : new Date(new Date().setHours(24, 0, 0, 0)).getTime();

  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const start = end - (bucketCount - i) * bucketMs;
    return {
      start: new Date(start),
      end: new Date(start + bucketMs),
      label: useHours
        ? `${String(new Date(start).getHours()).padStart(2, "0")}:00`
        : new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const threatsOf = (e: { threatTypes: unknown }) => jsonArray<ThreatType>(e.threatTypes);

  const overTime = buckets.map((b) => {
    const inBucket = events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end);
    const withThreat = inBucket.filter((e) => threatsOf(e).length > 0);
    return {
      label: b.label,
      total: withThreat.length,
      critical: withThreat.filter((e) => e.severity === "CRITICAL").length,
      requests: inBucket.length,
      blocked: inBucket.filter((e) => e.blocked).length,
    };
  });

  const injectionTrend = buckets.map((b) => {
    const inBucket = events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end);
    return {
      label: b.label,
      total: inBucket.filter((e) => threatsOf(e).some((t) => t.includes("INJECTION"))).length,
      critical: inBucket.filter(
        (e) => e.severity === "CRITICAL" && threatsOf(e).some((t) => t.includes("INJECTION")),
      ).length,
    };
  });

  const leakageTrend = buckets.map((b) => {
    const inBucket = sensitiveHits.filter((h) => h.createdAt >= b.start && h.createdAt < b.end);
    return {
      label: b.label,
      total: inBucket.reduce((s, h) => s + h.count, 0),
      critical: inBucket.filter((h) => h.category === "CREDENTIAL").reduce((s, h) => s + h.count, 0),
    };
  });

  const tally = <K extends string>(items: Array<K | undefined | null>) => {
    const m = new Map<K, number>();
    for (const i of items) if (i) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const threatCounts = new Map<ThreatType, number>();
  for (const e of events) for (const t of threatsOf(e)) threatCounts.set(t, (threatCounts.get(t) ?? 0) + 1);

  const severityCounts = tally(events.map((e) => e.severity as Severity));

  const byApplication = applications
    .map((a) => {
      const own = events.filter((e) => e.application?.slug === a.slug);
      return {
        name: a.name,
        slug: a.slug,
        requests: own.length,
        threats: own.filter((e) => threatsOf(e).length > 0).length,
        blocked: own.filter((e) => e.blocked).length,
        avgRisk: own.length ? Math.round(own.reduce((s, e) => s + e.riskScore, 0) / own.length) : 0,
      };
    })
    .filter((a) => a.requests > 0)
    .sort((a, b) => b.threats - a.threats);

  const byAgent = agents
    .map((a) => {
      const own = events.filter((e) => e.agent?.slug === a.slug);
      return {
        name: a.name,
        slug: a.slug,
        requests: own.length,
        threats: own.filter((e) => threatsOf(e).length > 0).length,
        blocked: own.filter((e) => e.blocked).length,
        avgRisk: own.length ? Math.round(own.reduce((s, e) => s + e.riskScore, 0) / own.length) : 0,
      };
    })
    .filter((a) => a.requests > 0)
    .sort((a, b) => b.threats - a.threats);

  const userMap = new Map<string, { name: string; department: string; requests: number; threats: number; blocked: number }>();
  for (const e of events) {
    if (!e.userId || !e.user) continue;
    const entry = userMap.get(e.userId) ?? {
      name: e.user.name, department: e.user.department, requests: 0, threats: 0, blocked: 0,
    };
    entry.requests++;
    if (threatsOf(e).length > 0) entry.threats++;
    if (e.blocked) entry.blocked++;
    userMap.set(e.userId, entry);
  }

  const blockedTools = tally(
    toolCalls.filter((c) => c.decision === "BLOCK").map((c) => c.tool.name),
  );

  const resolved = incidents.filter((i) => i.resolvedAt);
  const meanTimeToResolve = resolved.length
    ? resolved.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.openedAt.getTime()), 0) /
      resolved.length /
      3600_000
    : null;

  return {
    range,
    filters,
    applications,
    agents,
    overTime,
    injectionTrend,
    leakageTrend,
    threatCategories: [...threatCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, label: THREAT_META[type]?.label ?? type })),
    severityCounts: severityCounts.map(([severity, count]) => ({ severity, count })),
    byApplication,
    byAgent,
    byUser: [...userMap.values()].sort((a, b) => b.threats - a.threats).slice(0, 10),
    blockedTools: blockedTools.map(([name, count]) => ({ name, count })),
    totals: {
      requests: events.length,
      threats: events.filter((e) => threatsOf(e).length > 0).length,
      blocked: events.filter((e) => e.blocked).length,
      redacted: events.filter((e) => e.redacted).length,
      incidents: incidents.length,
      sensitiveValues: sensitiveHits.reduce((s, h) => s + h.count, 0),
      avgRisk: events.length ? events.reduce((s, e) => s + e.riskScore, 0) / events.length : 0,
      meanTimeToResolve,
    },
  };
}
