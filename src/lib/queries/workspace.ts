import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { THREAT_META, type Severity, type ThreatType } from "@/lib/engine/taxonomy";
import { trailingWindow } from "./window";

/**
 * Data for the dashboard's segmented workspace.
 *
 * Four focused views rather than one wall. Each answers a different question, so
 * only one is on screen at a time: what is happening now, are the controls
 * holding, is the estate healthy, and is data leaving.
 */

export interface WorkspaceData {
  defense: {
    guardrails: { total: number; enabled: number; triggered7d: number };
    policies: { total: number; enabled: number; blocking: number };
    layers: Array<{ layer: string; detections: number; avgConfidence: number }>;
    decisions: Array<{ decision: string; count: number }>;
    topPolicies: Array<{ name: string; action: string; hits: number }>;
    /** What was actually detected, named. Prompt injection leads by design. */
    topThreats: Array<{ type: string; label: string; count: number; severity: Severity }>;
  };
  estate: {
    applications: Array<{ name: string; slug: string; score: number; requests: number; blocked: number }>;
    agents: Array<{ name: string; slug: string; score: number; riskLevel: string; blocked: number; denied: number }>;
    tools: { total: number; tier5: number; denied7d: number; pendingApprovals: number };
    leastPrivilege: number;
  };
  data: {
    sensitiveTotal: number;
    credentials: number;
    byCategory: Array<{ category: string; values: number }>;
    byChannel: Array<{ channel: string; values: number }>;
    rag: {
      documents: number;
      quarantined: number;
      external: number;
      withheld7d: number;
      lowestTrust: number;
    };
  };
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    severity: Severity;
    href: string;
    action: string;
  }>;
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const since = trailingWindow(7);

  const [
    guardrails, policies, layers, events, topPolicies,
    apps, agents, tools, toolCalls, approvals, permissions,
    sensitive, documents, retrievals, sources,
  ] = await Promise.all([
    prisma.guardrail.findMany({ select: { enabled: true, hitCount: true } }),
    prisma.policy.findMany({ select: { enabled: true, action: true, name: true, hitCount: true } }),
    prisma.detection.groupBy({
      by: ["layer"], where: { createdAt: { gte: since } },
      _count: true, _avg: { confidence: true },
    }),
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true, blocked: true, applicationId: true, agentId: true, threatTypes: true },
    }),
    prisma.policy.findMany({
      where: { hitCount: { gt: 0 } },
      orderBy: { hitCount: "desc" }, take: 5,
      select: { name: true, action: true, hitCount: true },
    }),
    prisma.aiApplication.findMany({
      orderBy: { securityScore: "asc" },
      select: { id: true, name: true, slug: true, securityScore: true },
    }),
    prisma.agent.findMany({
      orderBy: { securityScore: "asc" }, take: 6,
      select: { id: true, name: true, slug: true, securityScore: true, riskLevel: true },
    }),
    prisma.tool.findMany({ select: { riskTier: true } }),
    prisma.toolCall.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true, agentId: true },
    }),
    prisma.toolApproval.count({ where: { status: "PENDING" } }),
    prisma.agentPermission.count({ where: { useCount: { lt: 10 } } }),
    prisma.sensitiveHit.groupBy({
      by: ["category", "channel"], where: { createdAt: { gte: since } },
      _sum: { count: true },
    }),
    prisma.document.findMany({
      select: { quarantined: true, trustScore: true, source: { select: { isExternal: true } } },
    }),
    prisma.retrievalEvent.count({ where: { allowed: false, createdAt: { gte: since } } }),
    prisma.dataSource.findMany({ select: { trustLevel: true, isExternal: true } }),
  ]);

  /* ------------------------------------------------------------- defense */
  /*
   * Threat types named rather than merely counted. "36 detections" tells an
   * analyst nothing actionable; "14 prompt injection, 6 data exfiltration"
   * tells them what is being attempted against this estate.
   */
  const threatCounts = new Map<ThreatType, number>();
  for (const e of events) {
    for (const t of jsonArray<ThreatType>(e.threatTypes)) {
      threatCounts.set(t, (threatCounts.get(t) ?? 0) + 1);
    }
  }
  const topThreats = [...threatCounts.entries()]
    .map(([type, count]) => ({
      type,
      label: THREAT_META[type]?.label ?? type,
      count,
      severity: (THREAT_META[type]?.baseSeverity ?? "LOW") as Severity,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const decisionCounts = new Map<string, number>();
  for (const e of events) decisionCounts.set(e.decision, (decisionCounts.get(e.decision) ?? 0) + 1);

  /* -------------------------------------------------------------- estate */
  const appStats = apps.map((a) => {
    const own = events.filter((e) => e.applicationId === a.id);
    return {
      name: a.name, slug: a.slug, score: a.securityScore,
      requests: own.length, blocked: own.filter((e) => e.blocked).length,
    };
  }).filter((a) => a.requests > 0);

  const agentStats = agents.map((a) => {
    const own = events.filter((e) => e.agentId === a.id);
    const calls = toolCalls.filter((c) => c.agentId === a.id);
    return {
      name: a.name, slug: a.slug, score: a.securityScore, riskLevel: a.riskLevel,
      blocked: own.filter((e) => e.blocked).length,
      denied: calls.filter((c) => c.decision === "BLOCK").length,
    };
  });

  /* ---------------------------------------------------------------- data */
  const categoryTotals = new Map<string, number>();
  const channelTotals = new Map<string, number>();
  for (const row of sensitive) {
    const value = row._sum.count ?? 0;
    categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + value);
    channelTotals.set(row.channel, (channelTotals.get(row.channel) ?? 0) + value);
  }
  const sensitiveTotal = [...categoryTotals.values()].reduce((s, v) => s + v, 0);

  const quarantined = documents.filter((d) => d.quarantined).length;
  const external = documents.filter((d) => d.source.isExternal).length;
  const lowestTrust = Math.min(...sources.map((s) => s.trustLevel), 100);

  /* ----------------------------------------------------- recommendations */
  const recommendations: WorkspaceData["recommendations"] = [];

  if (approvals > 0) {
    recommendations.push({
      id: "approvals",
      title: `${approvals} tool call${approvals === 1 ? "" : "s"} awaiting authorisation`,
      detail: "High-impact actions are held until a named human decides. Anything expiring unapproved is refused by default.",
      severity: approvals > 5 ? "HIGH" : "MEDIUM",
      href: "/tools",
      action: "Review queue",
    });
  }
  if (permissions > 0) {
    recommendations.push({
      id: "least-privilege",
      title: `${permissions} over-provisioned agent permission${permissions === 1 ? "" : "s"}`,
      detail: "Granted but barely exercised. Each widens what an attacker gains from a compromise without giving the agent anything it uses.",
      severity: "MEDIUM",
      href: "/agents",
      action: "Review grants",
    });
  }
  if (quarantined > 0) {
    recommendations.push({
      id: "quarantine",
      title: `${quarantined} quarantined document${quarantined === 1 ? "" : "s"} still indexed at source`,
      detail: "Withheld from retrieval, but the originating feed has not been reviewed. A poisoned document rarely arrives alone.",
      severity: "HIGH",
      href: "/rag?status=quarantined",
      action: "Review sources",
    });
  }
  const disabledControls = guardrails.filter((g) => !g.enabled).length;
  if (disabledControls > 0) {
    recommendations.push({
      id: "disabled-guardrails",
      title: `${disabledControls} guardrail${disabledControls === 1 ? " is" : "s are"} disabled`,
      detail: "Requests that would have been caught are passing. Re-enable or record why the exception stands.",
      severity: "CRITICAL",
      href: "/guardrails",
      action: "Open guardrails",
    });
  }
  const weakAgents = agentStats.filter((a) => a.score < 65);
  if (weakAgents.length > 0) {
    recommendations.push({
      id: "weak-agents",
      title: `${weakAgents.length} agent${weakAgents.length === 1 ? "" : "s"} below a 65 security score`,
      detail: `${weakAgents.map((a) => a.name).slice(0, 2).join(", ")} — driven by blocked-request rate and average risk. Re-scope grants or tighten the acting application's prompt.`,
      severity: "MEDIUM",
      href: "/agents",
      action: "Inspect agents",
    });
  }
  if (external > 0) {
    recommendations.push({
      id: "external-sources",
      title: `${external} indexed documents come from unreviewed external feeds`,
      detail: `Lowest source trust is ${lowestTrust}/100. Externally authored content is the primary indirect-injection surface in this estate.`,
      severity: "MEDIUM",
      href: "/rag",
      action: "Review sources",
    });
  }

  return {
    defense: {
      guardrails: {
        total: guardrails.length,
        enabled: guardrails.filter((g) => g.enabled).length,
        triggered7d: guardrails.reduce((s, g) => s + g.hitCount, 0),
      },
      policies: {
        total: policies.length,
        enabled: policies.filter((p) => p.enabled).length,
        blocking: policies.filter((p) => p.action === "BLOCK").length,
      },
      layers: layers.map((l) => ({
        layer: l.layer, detections: l._count, avgConfidence: l._avg.confidence ?? 0,
      })).sort((a, b) => b.detections - a.detections),
      decisions: [...decisionCounts.entries()].map(([decision, count]) => ({ decision, count })),
      topPolicies: topPolicies.map((p) => ({ name: p.name, action: p.action, hits: p.hitCount })),
      topThreats,
    },
    estate: {
      applications: appStats,
      agents: agentStats,
      tools: {
        total: tools.length,
        tier5: tools.filter((t) => t.riskTier >= 5).length,
        denied7d: toolCalls.filter((c) => c.decision === "BLOCK").length,
        pendingApprovals: approvals,
      },
      leastPrivilege: permissions,
    },
    data: {
      sensitiveTotal,
      credentials: categoryTotals.get("CREDENTIAL") ?? 0,
      byCategory: [...categoryTotals.entries()]
        .map(([category, values]) => ({ category, values }))
        .sort((a, b) => b.values - a.values),
      byChannel: [...channelTotals.entries()]
        .map(([channel, values]) => ({ channel, values }))
        .sort((a, b) => b.values - a.values),
      rag: {
        documents: documents.length,
        quarantined,
        external,
        withheld7d: retrievals,
        lowestTrust,
      },
    },
    recommendations: recommendations.slice(0, 5),
  };
}

