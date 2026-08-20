import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import type { ThreatType } from "@/lib/engine/taxonomy";

/** Trailing window used for activity figures across estate views. */
const WINDOW_MS = 7 * 24 * 3600_000;

export async function getApplications() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [apps, events] = await Promise.all([
    prisma.aiApplication.findMany({
      orderBy: { securityScore: "asc" },
      include: {
        model: { select: { name: true, provider: true } },
        _count: { select: { agents: true, incidents: true } },
        vectorStores: { include: { vectorStore: { select: { name: true } } } },
      },
    }),
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { applicationId: true, blocked: true, severity: true, riskScore: true, threatTypes: true },
    }),
  ]);

  return apps.map((app) => {
    const own = events.filter((e) => e.applicationId === app.id);
    const threats = own.filter((e) => jsonArray(e.threatTypes).length > 0);
    return {
      ...app,
      requests: own.length,
      blocked: own.filter((e) => e.blocked).length,
      threats: threats.length,
      criticals: own.filter((e) => e.severity === "CRITICAL").length,
      avgRisk: own.length ? Math.round(own.reduce((s, e) => s + e.riskScore, 0) / own.length) : 0,
    };
  });
}

export async function getApplicationDetail(slug: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const app = await prisma.aiApplication.findUnique({
    where: { slug },
    include: {
      model: true,
      agents: {
        include: { _count: { select: { toolGrants: true, permissions: true } } },
        orderBy: { securityScore: "asc" },
      },
      vectorStores: { include: { vectorStore: true } },
      incidents: {
        orderBy: { openedAt: "desc" },
        take: 10,
        select: { id: true, ref: true, title: true, severity: true, status: true, openedAt: true },
      },
    },
  });
  if (!app) return null;

  const events = await prisma.securityEvent.findMany({
    where: { applicationId: app.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, ref: true, createdAt: true, riskScore: true, severity: true,
      decision: true, blocked: true, threatTypes: true, requestText: true,
      user: { select: { name: true } },
      agent: { select: { name: true } },
    },
  });

  const threatCounts = new Map<ThreatType, number>();
  for (const e of events) {
    for (const t of jsonArray<ThreatType>(e.threatTypes)) {
      threatCounts.set(t, (threatCounts.get(t) ?? 0) + 1);
    }
  }

  return {
    ...app,
    events: events.map((e) => ({ ...e, threatTypes: jsonArray<ThreatType>(e.threatTypes) })),
    stats: {
      requests: events.length,
      blocked: events.filter((e) => e.blocked).length,
      threats: events.filter((e) => jsonArray(e.threatTypes).length > 0).length,
      avgRisk: events.length
        ? Math.round(events.reduce((s, e) => s + e.riskScore, 0) / events.length)
        : 0,
    },
    topThreats: [...threatCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count })),
  };
}

export async function getAgents() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [agents, events, toolCalls] = await Promise.all([
    prisma.agent.findMany({
      orderBy: [{ riskLevel: "asc" }, { securityScore: "asc" }],
      include: {
        application: { select: { name: true, slug: true } },
        model: { select: { name: true } },
        toolGrants: { include: { tool: { select: { name: true, slug: true, riskTier: true } } } },
        permissions: true,
      },
    }),
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { agentId: true, blocked: true, riskScore: true, threatTypes: true },
    }),
    prisma.toolCall.findMany({
      where: { createdAt: { gte: since } },
      select: { agentId: true, decision: true },
    }),
  ]);

  return agents.map((agent) => {
    const own = events.filter((e) => e.agentId === agent.id);
    const calls = toolCalls.filter((c) => c.agentId === agent.id);
    // A grant that is almost never exercised is a least-privilege finding, not
    // a bug — over-provisioning is the norm, and surfacing it is the point.
    const unusedPermissions = agent.permissions.filter((p) => p.useCount < 10);
    return {
      ...agent,
      requests: own.length,
      blocked: own.filter((e) => e.blocked).length,
      threats: own.filter((e) => jsonArray(e.threatTypes).length > 0).length,
      avgRisk: own.length ? Math.round(own.reduce((s, e) => s + e.riskScore, 0) / own.length) : 0,
      toolCalls: calls.length,
      deniedCalls: calls.filter((c) => c.decision === "BLOCK").length,
      grantCount: agent.toolGrants.length,
      highRiskGrants: agent.toolGrants.filter((g) => g.tool.riskTier >= 4).length,
      unusedPermissions: unusedPermissions.length,
      leastPrivilegeFindings: unusedPermissions.map((p) => ({
        resource: p.resource,
        useCount: p.useCount,
        justification: p.justification,
      })),
    };
  });
}

export async function getAgentDetail(slug: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const agent = await prisma.agent.findUnique({
    where: { slug },
    include: {
      application: { select: { name: true, slug: true, systemPrompt: true } },
      model: true,
      toolGrants: { include: { tool: true } },
      permissions: true,
      baselines: true,
    },
  });
  if (!agent) return null;

  const [events, toolCalls, incidents] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { agentId: agent.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, ref: true, createdAt: true, riskScore: true, severity: true,
        decision: true, blocked: true, threatTypes: true, requestText: true,
        user: { select: { name: true } },
      },
    }),
    prisma.toolCall.findMany({
      where: { agentId: agent.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { tool: true, approval: true },
    }),
    prisma.incident.findMany({
      where: { agentId: agent.id },
      orderBy: { openedAt: "desc" },
      take: 8,
      select: { id: true, ref: true, title: true, severity: true, status: true, openedAt: true },
    }),
  ]);

  return {
    ...agent,
    events: events.map((e) => ({ ...e, threatTypes: jsonArray<ThreatType>(e.threatTypes) })),
    toolCalls,
    incidents,
    stats: {
      requests: events.length,
      blocked: events.filter((e) => e.blocked).length,
      toolCalls: toolCalls.length,
      deniedCalls: toolCalls.filter((c) => c.decision === "BLOCK").length,
      approvals: toolCalls.filter((c) => c.decision === "REQUIRE_APPROVAL").length,
    },
  };
}

export async function getTools() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [tools, calls, approvals] = await Promise.all([
    prisma.tool.findMany({
      orderBy: [{ riskTier: "desc" }, { name: "asc" }],
      include: {
        grants: { include: { agent: { select: { name: true, slug: true } } } },
        _count: { select: { calls: true } },
      },
    }),
    prisma.toolCall.findMany({
      where: { createdAt: { gte: since } },
      select: { toolId: true, decision: true, riskScore: true },
    }),
    prisma.toolApproval.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        toolCall: {
          include: {
            tool: { select: { name: true, slug: true, riskTier: true, category: true } },
            agent: { select: { name: true, slug: true } },
            event: { select: { id: true, ref: true, requestText: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  return {
    tools: tools.map((t) => {
      const own = calls.filter((c) => c.toolId === t.id);
      return {
        ...t,
        operations: jsonArray<string>(t.operations),
        allowedDomains: t.allowedDomains ? jsonArray<string>(t.allowedDomains) : null,
        calls: own.length,
        allowed: own.filter((c) => c.decision === "ALLOW" || c.decision === "WARN").length,
        blocked: own.filter((c) => c.decision === "BLOCK").length,
        pendingApproval: own.filter((c) => c.decision === "REQUIRE_APPROVAL").length,
        grantedTo: t.grants.map((g) => ({
          agent: g.agent.name,
          slug: g.agent.slug,
          operations: jsonArray<string>(g.operations),
          denied: g.denied,
        })),
      };
    }),
    approvals,
  };
}
