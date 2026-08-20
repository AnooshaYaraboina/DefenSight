import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { THREAT_META, type ThreatType } from "@/lib/engine/taxonomy";

/**
 * Headline figures for the landing page.
 *
 * Real numbers from the running engine rather than marketing placeholders. A
 * security product that fabricates its own statistics on its front page has
 * already told you something about how it treats evidence.
 */
export async function getLandingStats() {
  const [events, detections, incidents, quarantined, blocked, agents, tools, documents] =
    await Promise.all([
      prisma.securityEvent.count(),
      prisma.detection.count(),
      prisma.incident.count(),
      prisma.document.count({ where: { quarantined: true } }),
      prisma.securityEvent.count({ where: { blocked: true } }),
      prisma.agent.count(),
      prisma.tool.count(),
      prisma.document.count(),
    ]);

  const threatRows = await prisma.securityEvent.findMany({
    where: { severity: { in: ["CRITICAL", "HIGH"] } },
    select: { threatTypes: true },
    take: 500,
  });

  const counts = new Map<ThreatType, number>();
  for (const row of threatRows) {
    for (const t of jsonArray<ThreatType>(row.threatTypes)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const topThreats = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({
      type,
      count,
      label: THREAT_META[type]?.label ?? type,
      owasp: THREAT_META[type]?.owasp,
    }));

  const latencies = await prisma.securityEvent.findMany({
    select: { latencyMs: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const medianLatency = latencies.length
    ? [...latencies].sort((a, b) => a.latencyMs - b.latencyMs)[Math.floor(latencies.length / 2)]
        .latencyMs
    : 0;

  return {
    events,
    detections,
    incidents,
    quarantined,
    blocked,
    agents,
    tools,
    documents,
    topThreats,
    medianLatency,
    detectionRate: events > 0 ? (blocked / events) * 100 : 0,
  };
}
