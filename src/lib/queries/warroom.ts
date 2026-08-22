import "server-only";
import { prisma } from "@/lib/db/client";
import { jsonArray } from "@/lib/db/json";
import { trailingWindow } from "@/lib/queries/window";
import { THREAT_META, type Severity, type ThreatType } from "@/lib/engine/taxonomy";

/**
 * Everything the war room shows, in one query.
 *
 * The wall renders exactly five things, so this returns exactly five things.
 * The temptation on a dashboard query is to return everything the page *could*
 * show; that is how the previous dashboard ended up carrying fourteen features.
 */

export type ThreatLevel = "LOW" | "GUARDED" | "ELEVATED" | "SEVERE";

export interface MapNode {
  id: string;
  lane: 0 | 1 | 2 | 3;
  label: string;
  /** Slug for applications and agents; category key for tools. */
  key: string;
  href?: string;
  /** Drives the persistent halo. Only agents currently carry one. */
  risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score?: number;
}

export interface MapEdge {
  from: string;
  to: string;
}

export interface WarRoomData {
  org: string;
  posture: {
    score: number;
    delta: number | null;
    verdict: string;
    pulse: number[];
  };
  threatLevel: ThreatLevel;
  vitals: {
    analysed: number;
    blocked: number;
    critical: number;
    blockRate: number;
  };
  topology: {
    nodes: MapNode[];
    edges: MapEdge[];
    /** agent display name → node id, for resolving live events. */
    agentsByName: Record<string, string>;
    /** tool slug → tool-category node id. */
    toolNodeBySlug: Record<string, string>;
  };
  needsYou: {
    incidents: number;
    approvals: number;
    quarantined: number;
    items: Array<{
      id: string;
      label: string;
      detail: string;
      severity: Severity;
      href: string;
      at: Date;
    }>;
  };
  /** Seeds the intercept wire before the stream delivers anything. */
  recentIntercepts: Array<{
    id: string;
    at: Date;
    threat: string;
    target: string;
    decision: string;
    severity: Severity;
  }>;
}

const TOOL_CATEGORY_LABEL: Record<string, string> = {
  DATABASE: "Database",
  API: "API",
  SEARCH: "Search",
  FILE: "File",
  EMAIL: "Email",
  BUSINESS: "Business",
  CODE: "Code",
  MESSAGING: "Messaging",
};

function verdictFor(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Stable";
  if (score >= 50) return "Degraded";
  return "At risk";
}

export async function getWarRoom(): Promise<WarRoomData> {
  const since = trailingWindow(7);
  const priorSince = trailingWindow(14);

  const [events, priorEvents, apps, agents, tools, grants, openIncidents, approvals, quarantined] =
    await Promise.all([
      prisma.securityEvent.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true, createdAt: true, blocked: true, severity: true,
          riskScore: true, decision: true, threatTypes: true,
          application: { select: { name: true } },
          agent: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.securityEvent.findMany({
        where: { createdAt: { gte: priorSince, lt: since } },
        select: { blocked: true, severity: true, riskScore: true },
      }),
      prisma.aiApplication.findMany({
        select: { id: true, name: true, slug: true, securityScore: true },
        orderBy: { name: "asc" },
      }),
      prisma.agent.findMany({
        select: {
          id: true, name: true, slug: true, applicationId: true,
          riskLevel: true, securityScore: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.tool.findMany({ select: { id: true, slug: true, category: true } }),
      prisma.toolGrant.findMany({ select: { agentId: true, toolId: true, denied: true } }),
      prisma.incident.findMany({
        where: { status: { in: ["OPEN", "INVESTIGATING"] } },
        select: { id: true, ref: true, title: true, severity: true, openedAt: true },
        orderBy: { openedAt: "asc" },
      }),
      prisma.toolApproval.findMany({
        where: { status: "PENDING" },
        select: {
          id: true, requestedBy: true, expiresAt: true,
          toolCall: { select: { tool: { select: { name: true } } } },
        },
        orderBy: { expiresAt: "asc" },
      }),
      prisma.document.count({ where: { quarantined: true } }),
    ]);

  /* ------------------------------------------------------------- posture */
  const rate = (list: Array<{ blocked: boolean; severity: string; riskScore: number }>) => {
    if (list.length === 0) return null;
    const blockedRate = list.filter((e) => e.blocked).length / list.length;
    const criticalRate = list.filter((e) => e.severity === "CRITICAL").length / list.length;
    const avgRisk = list.reduce((s, e) => s + e.riskScore, 0) / list.length;
    return Math.max(
      0,
      Math.min(100, Math.round(100 - blockedRate * 34 - criticalRate * 46 - (avgRisk / 100) * 20)),
    );
  };

  const score = rate(events) ?? 100;
  const prior = rate(priorEvents);

  // Throughput per hour over the last 24, oldest first — the wall's heartbeat.
  const now = Date.now();
  const pulse = Array.from({ length: 24 }, (_, i) => {
    const start = now - (24 - i) * 3_600_000;
    const end = start + 3_600_000;
    return events.filter((e) => {
      const t = e.createdAt.getTime();
      return t >= start && t < end;
    }).length;
  });

  /* -------------------------------------------------------- threat level */
  const criticalCount = events.filter((e) => e.severity === "CRITICAL").length;
  const blockedCount = events.filter((e) => e.blocked).length;
  const criticalRate = events.length ? criticalCount / events.length : 0;
  const blockedRate = events.length ? blockedCount / events.length : 0;
  const threatLevel: ThreatLevel =
    openIncidents.length >= 5 || criticalRate > 0.12
      ? "SEVERE"
      : openIncidents.length >= 2 || criticalRate > 0.05 || blockedRate > 0.2
        ? "ELEVATED"
        : events.some((e) => jsonArray<ThreatType>(e.threatTypes).length > 0)
          ? "GUARDED"
          : "LOW";

  /* ------------------------------------------------------------ topology */
  const nodes: MapNode[] = [{ id: "ingress", lane: 0, label: "Ingress", key: "ingress" }];
  const edges: MapEdge[] = [];

  for (const a of apps) {
    nodes.push({
      id: `app:${a.slug}`, lane: 1, label: a.name, key: a.slug,
      href: `/applications/${a.slug}`, score: a.securityScore,
    });
    edges.push({ from: "ingress", to: `app:${a.slug}` });
  }

  const appNodeById = new Map(apps.map((a) => [a.id, `app:${a.slug}`]));
  const agentsByName: Record<string, string> = {};

  for (const g of agents) {
    const id = `agent:${g.slug}`;
    nodes.push({
      id, lane: 2, label: g.name, key: g.slug,
      href: `/agents/${g.slug}`,
      risk: g.riskLevel as MapNode["risk"],
      score: g.securityScore,
    });
    agentsByName[g.name] = id;
    const parent = appNodeById.get(g.applicationId);
    if (parent) edges.push({ from: parent, to: id });
  }

  // Seventeen individual tools would crowd the lane and say little; the
  // category is what an analyst reasons about when a call is refused.
  const categories = [...new Set(tools.map((t) => t.category))].sort();
  for (const c of categories) {
    nodes.push({
      id: `tool:${c}`, lane: 3,
      label: TOOL_CATEGORY_LABEL[c] ?? c, key: c, href: "/tools",
    });
  }

  const toolCategoryById = new Map(tools.map((t) => [t.id, t.category]));
  const toolNodeBySlug = Object.fromEntries(
    tools.map((t) => [t.slug, `tool:${t.category}`]),
  );
  const agentNodeById = new Map(agents.map((g) => [g.id, `agent:${g.slug}`]));
  const seenEdge = new Set<string>();

  for (const grant of grants) {
    if (grant.denied) continue;
    const from = agentNodeById.get(grant.agentId);
    const category = toolCategoryById.get(grant.toolId);
    if (!from || !category) continue;
    const key = `${from}->tool:${category}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to: `tool:${category}` });
  }

  /* ------------------------------------------------------------ needs you */
  const items: WarRoomData["needsYou"]["items"] = [
    ...openIncidents.slice(0, 2).map((i) => ({
      id: i.id,
      label: i.title,
      detail: i.ref,
      severity: i.severity as Severity,
      href: `/incidents/${i.id}`,
      at: i.openedAt,
    })),
    ...approvals.slice(0, 2).map((a) => ({
      id: a.id,
      label: `${a.toolCall.tool.name} awaiting authorisation`,
      detail: `Requested by ${a.requestedBy}`,
      severity: "HIGH" as Severity,
      href: "/tools#approvals",
      at: a.expiresAt ?? new Date(),
    })),
  ].slice(0, 3);

  /* ------------------------------------------------------------- the wire */
  const recentIntercepts = events
    .filter((e) => e.blocked || e.severity === "CRITICAL" || e.severity === "HIGH")
    .slice(0, 12)
    .map((e) => {
      const threats = jsonArray<ThreatType>(e.threatTypes);
      return {
        id: e.id,
        at: e.createdAt,
        threat: threats.length ? (THREAT_META[threats[0]]?.label ?? threats[0]) : "Anomaly",
        target: e.agent?.name ?? e.application?.name ?? "Unknown",
        decision: e.decision,
        severity: e.severity as Severity,
      };
    });

  return {
    org: "Northwind Group",
    posture: {
      score,
      delta: prior === null ? null : score - prior,
      verdict: verdictFor(score),
      pulse,
    },
    threatLevel,
    vitals: {
      analysed: events.length,
      blocked: blockedCount,
      critical: openIncidents.filter((i) => i.severity === "CRITICAL").length,
      blockRate: events.length ? (blockedCount / events.length) * 100 : 0,
    },
    topology: { nodes, edges, agentsByName, toolNodeBySlug },
    needsYou: {
      incidents: openIncidents.length,
      approvals: approvals.length,
      quarantined,
      items,
    },
    recentIntercepts,
  };
}
