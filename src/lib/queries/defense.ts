import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import {
  THREAT_FAMILIES, THREAT_META, threatsInFamily,
  type Severity, type ThreatFamily, type ThreatType,
} from "@/lib/engine/taxonomy";

const WINDOW_MS = 7 * 24 * 3600_000;

export async function getThreatCenter(family?: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [events, detections, incidents] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, ref: true, createdAt: true, riskScore: true, severity: true,
        decision: true, blocked: true, threatTypes: true, requestText: true,
        application: { select: { name: true } },
        agent: { select: { name: true } },
        user: { select: { name: true } },
        incidentId: true,
      },
    }),
    prisma.detection.groupBy({
      by: ["threatType", "layer"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { confidence: true },
    }),
    prisma.incident.groupBy({ by: ["threatType"], _count: true }),
  ]);

  const withThreats = events
    .map((e) => ({ ...e, threatTypes: jsonArray<ThreatType>(e.threatTypes) }))
    .filter((e) => e.threatTypes.length > 0);

  const counts = new Map<ThreatType, { events: number; blocked: number; critical: number }>();
  for (const e of withThreats) {
    for (const t of e.threatTypes) {
      const entry = counts.get(t) ?? { events: 0, blocked: 0, critical: 0 };
      entry.events++;
      if (e.blocked) entry.blocked++;
      if (e.severity === "CRITICAL") entry.critical++;
      counts.set(t, entry);
    }
  }

  const incidentCounts = Object.fromEntries(incidents.map((i) => [i.threatType, i._count]));

  const families = THREAT_FAMILIES.map((f) => {
    const types = threatsInFamily(f);
    return {
      family: f,
      types: types.map((t) => ({
        type: t,
        meta: THREAT_META[t],
        events: counts.get(t)?.events ?? 0,
        blocked: counts.get(t)?.blocked ?? 0,
        critical: counts.get(t)?.critical ?? 0,
        incidents: incidentCounts[t] ?? 0,
        layers: detections
          .filter((d) => d.threatType === t)
          .map((d) => ({ layer: d.layer, count: d._count, avgConfidence: d._avg.confidence ?? 0 })),
      })),
      total: types.reduce((s, t) => s + (counts.get(t)?.events ?? 0), 0),
    };
  });

  const selected = family && THREAT_FAMILIES.includes(family as ThreatFamily)
    ? (family as ThreatFamily)
    : undefined;

  const recent = withThreats
    .filter((e) => !selected || e.threatTypes.some((t) => THREAT_META[t].family === selected))
    .slice(0, 40);

  return {
    families,
    selected,
    recent,
    totals: {
      events: withThreats.length,
      blocked: withThreats.filter((e) => e.blocked).length,
      critical: withThreats.filter((e) => e.severity === "CRITICAL").length,
      incidents: incidents.reduce((s, i) => s + i._count, 0),
    },
  };
}

export async function getGuardrails() {
  const guardrails = await prisma.guardrail.findMany({ orderBy: [{ direction: "asc" }, { key: "asc" }] });
  const since = new Date(Date.now() - WINDOW_MS);
  const detections = await prisma.detection.groupBy({
    by: ["threatType"],
    where: { createdAt: { gte: since } },
    _count: true,
  });
  return {
    guardrails: guardrails.map((g) => ({
      ...g,
      config: (g.config as Record<string, unknown>) ?? {},
    })),
    detectionCounts: Object.fromEntries(detections.map((d) => [d.threatType, d._count])),
  };
}

export async function getPolicies() {
  const [policies, events] = await Promise.all([
    prisma.policy.findMany({ orderBy: [{ priority: "asc" }] }),
    prisma.securityEvent.count({ where: { createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } }),
  ]);
  return { policies, evaluatedAgainst: events };
}

export async function getDataProtection() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [hits, byChannel, byType] = await Promise.all([
    prisma.sensitiveHit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        event: {
          select: {
            id: true, ref: true, decision: true, severity: true,
            application: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.sensitiveHit.groupBy({
      by: ["channel"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { count: true },
    }),
    prisma.sensitiveHit.groupBy({
      by: ["type", "category"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { count: true },
    }),
  ]);

  return {
    hits,
    byChannel: byChannel.map((c) => ({ channel: c.channel, events: c._count, values: c._sum.count ?? 0 })),
    byType: byType
      .map((t) => ({ type: t.type, category: t.category, events: t._count, values: t._sum.count ?? 0 }))
      .sort((a, b) => b.values - a.values),
    totalValues: byType.reduce((s, t) => s + (t._sum.count ?? 0), 0),
  };
}

export async function getRiskEngineData() {
  const since = new Date(Date.now() - WINDOW_MS);
  const events = await prisma.securityEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { riskScore: true, severity: true, decision: true, riskFactors: true },
  });

  // Aggregate how often each factor contributes, and how much, so the weights
  // page reflects the model's real behaviour rather than only its declared
  // configuration.
  const factorStats = new Map<string, { label: string; count: number; total: number; max: number }>();
  for (const e of events) {
    const rf = e.riskFactors as { factors?: Array<{ key: string; label: string; contribution: number }> } | null;
    for (const f of rf?.factors ?? []) {
      if (f.contribution <= 0) continue;
      const entry = factorStats.get(f.key) ?? { label: f.label, count: 0, total: 0, max: 0 };
      entry.count++;
      entry.total += f.contribution;
      entry.max = Math.max(entry.max, f.contribution);
      factorStats.set(f.key, entry);
    }
  }

  const bands = [
    { band: "0-14", min: 0, max: 15, severity: "INFO" as Severity },
    { band: "15-39", min: 15, max: 40, severity: "LOW" as Severity },
    { band: "40-64", min: 40, max: 65, severity: "MEDIUM" as Severity },
    { band: "65-84", min: 65, max: 85, severity: "HIGH" as Severity },
    { band: "85-100", min: 85, max: 101, severity: "CRITICAL" as Severity },
  ];

  return {
    distribution: bands.map((b) => ({
      band: b.band,
      severity: b.severity,
      count: events.filter((e) => e.riskScore >= b.min && e.riskScore < b.max).length,
    })),
    factorStats: [...factorStats.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        occurrences: v.count,
        averageContribution: v.count ? v.total / v.count : 0,
        maxContribution: v.max,
      }))
      .sort((a, b) => b.occurrences - a.occurrences),
    scored: events.length,
    averageScore: events.length ? events.reduce((s, e) => s + e.riskScore, 0) / events.length : 0,
  };
}
