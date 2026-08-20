import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { THREAT_META, type Severity, type ThreatType } from "@/lib/engine/taxonomy";

/**
 * Dashboard aggregation (§6).
 *
 * Every figure is derived from recorded events rather than stored as a
 * standalone counter. A dashboard whose numbers can drift from the events
 * behind them is a dashboard an analyst learns to distrust.
 */

export interface RangeOption {
  key: "24h" | "7d" | "14d" | "30d";
  label: string;
  hours: number;
}

export const RANGES: RangeOption[] = [
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 24 * 7 },
  { key: "14d", label: "14 days", hours: 24 * 14 },
  { key: "30d", label: "30 days", hours: 24 * 30 },
];

export function rangeFor(key: string | undefined): RangeOption {
  return RANGES.find((r) => r.key === key) ?? RANGES[1];
}

export interface MetricTile {
  key: string;
  label: string;
  value: number;
  /** Percentage change against the preceding window of equal length. */
  delta: number | null;
  /** Whether an increase is good or bad, for colouring the delta. */
  polarity: "higher-is-worse" | "higher-is-better" | "neutral";
  hint: string;
  href?: string;
  format?: "number" | "percent" | "score";
}

export interface DashboardData {
  range: RangeOption;
  securityScore: number;
  securityScoreDelta: number | null;
  tiles: MetricTile[];
  threatTrend: Array<{ bucket: string; label: string; total: number; critical: number; high: number; medium: number; low: number }>;
  riskDistribution: Array<{ band: string; count: number; severity: Severity }>;
  attackCategories: Array<{ threatType: ThreatType; label: string; count: number; family: string }>;
  decisionMix: Array<{ decision: string; count: number }>;
  agentActivity: Array<{ name: string; slug: string; requests: number; blocked: number; riskLevel: string; securityScore: number }>;
  toolUsage: Array<{ name: string; slug: string; allowed: number; blocked: number; approval: number; riskTier: number }>;
  dataEvents: Array<{ bucket: string; label: string; pii: number; credentials: number; customer: number; other: number }>;
  topRisks: Array<{ id: string; ref: string; severity: Severity; title: string; riskScore: number; createdAt: Date; application: string }>;
  /** Posture score per bucket, for the hero's inline trend. */
  postureTrend: number[];
  /** Per-tile series for the stat sparklines, keyed by tile key. */
  sparklines: Record<string, number[]>;
  /** Derived reading of current conditions. */
  threatLevel: "LOW" | "GUARDED" | "ELEVATED" | "SEVERE";
  /** Per-bucket severity composition for the primary canvas. */
  canvas: Array<{
    label: string; total: number; critical: number;
    high: number; medium: number; low: number; requests: number;
    /** Incidents opened inside this bucket — the response to the spike. */
    incidents: Array<{
      id: string; reference: string; title: string;
      severity: Severity; status: string;
    }>;
  }>;
}

function bucketsFor(hours: number) {
  // Hourly resolution for a day, daily beyond that — a 30-day chart with 720
  // hourly points is noise, not information.
  const useHours = hours <= 48;
  const count = useHours ? Math.min(24, hours) : Math.ceil(hours / 24);
  const sizeMs = useHours ? 3600_000 : 86_400_000;
  const now = Date.now();
  const end = useHours
    ? Math.ceil(now / sizeMs) * sizeMs
    : new Date(new Date(now).setHours(24, 0, 0, 0)).getTime();

  return Array.from({ length: count }, (_, i) => {
    const start = end - (count - i) * sizeMs;
    return {
      start: new Date(start),
      end: new Date(start + sizeMs),
      key: new Date(start).toISOString(),
      label: useHours
        ? `${String(new Date(start).getHours()).padStart(2, "0")}:00`
        : new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });
}

export async function getDashboardData(rangeKey?: string): Promise<DashboardData> {
  const range = rangeFor(rangeKey);
  const now = new Date();
  const since = new Date(now.getTime() - range.hours * 3600_000);
  const priorSince = new Date(since.getTime() - range.hours * 3600_000);

  const [events, priorEvents, agents, toolCalls, sensitiveHits] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true, ref: true, createdAt: true, riskScore: true, severity: true,
        decision: true, blocked: true, redacted: true, threatTypes: true,
        agentId: true, applicationId: true,
        application: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.securityEvent.findMany({
      where: { createdAt: { gte: priorSince, lt: since } },
      select: { riskScore: true, blocked: true, severity: true, threatTypes: true },
    }),
    prisma.agent.findMany({
      select: { id: true, name: true, slug: true, riskLevel: true, securityScore: true },
    }),
    prisma.toolCall.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true, tool: { select: { name: true, slug: true, riskTier: true } } },
    }),
    prisma.sensitiveHit.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, category: true, count: true },
    }),
  ]);

  const threatsOf = (e: { threatTypes: unknown }) => jsonArray<ThreatType>(e.threatTypes);

  /* --------------------------------------------------------- headline score */
  const blockedCount = events.filter((e) => e.blocked).length;
  const criticalCount = events.filter((e) => e.severity === "CRITICAL").length;
  const avgRisk = events.length
    ? events.reduce((s, e) => s + e.riskScore, 0) / events.length
    : 0;

  /**
   * Posture score.
   *
   * Every term is a *rate*, never a raw count. A count-based penalty makes a
   * busy estate look permanently degraded purely for handling more traffic,
   * which inverts the metric: the platform would score worse precisely when it
   * is doing more work. Rates keep a quiet week and a busy week comparable.
   */
  const scoreFor = (blocked: number, total: number, criticals: number, risk: number) => {
    if (total === 0) return 100;
    const blockedRate = blocked / total;
    const criticalRate = criticals / total;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(100 - blockedRate * 34 - criticalRate * 46 - (risk / 100) * 20),
      ),
    );
  };

  const securityScore = scoreFor(blockedCount, events.length, criticalCount, avgRisk);
  const priorScore = priorEvents.length
    ? scoreFor(
        priorEvents.filter((e) => e.blocked).length,
        priorEvents.length,
        priorEvents.filter((e) => e.severity === "CRITICAL").length,
        priorEvents.reduce((s, e) => s + e.riskScore, 0) / priorEvents.length,
      )
    : null;

  /* ----------------------------------------------------------------- tiles */
  /*
   * Percentage change is only meaningful once the baseline is large enough to
   * be stable. "+174%" against a prior window of 12 events reads as a crisis
   * and carries almost no information; below the floor the tile shows the
   * number alone.
   */
  const MIN_BASELINE = 25;
  const delta = (current: number, prior: number): number | null => {
    if (prior < MIN_BASELINE) return null;
    return Number((((current - prior) / prior) * 100).toFixed(1));
  };

  const countThreat = (list: typeof events | typeof priorEvents, match: (t: ThreatType) => boolean) =>
    list.filter((e) => threatsOf(e).some(match)).length;

  const [activeThreatCount, openIncidents, dataExposure, priorDataExposure, highRiskAgents, unauthorizedTools, priorUnauthorized] =
    await Promise.all([
      Promise.resolve(events.filter((e) => threatsOf(e).length > 0).length),
      prisma.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
      Promise.resolve(sensitiveHits.reduce((s, h) => s + h.count, 0)),
      prisma.sensitiveHit
        .findMany({ where: { createdAt: { gte: priorSince, lt: since } }, select: { count: true } })
        .then((rows) => rows.reduce((s, r) => s + r.count, 0)),
      prisma.agent.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      Promise.resolve(countThreat(events, (t) => t === "UNAUTHORIZED_TOOL_CALL" || t === "TOOL_ABUSE")),
      Promise.resolve(countThreat(priorEvents, (t) => t === "UNAUTHORIZED_TOOL_CALL" || t === "TOOL_ABUSE")),
    ]);

  const incidentsInWindow = await prisma.incident.findMany({
    where: { openedAt: { gte: since } },
    select: { id: true, ref: true, title: true, severity: true, status: true, openedAt: true },
    orderBy: { openedAt: "asc" },
  });

  const injections = countThreat(events, (t) => t.includes("INJECTION"));
  const priorInjections = countThreat(priorEvents, (t) => t.includes("INJECTION"));
  const ragThreats = countThreat(events, (t) => THREAT_META[t]?.family === "RAG");
  const priorRag = countThreat(priorEvents, (t) => THREAT_META[t]?.family === "RAG");
  const priorThreats = priorEvents.filter((e) => threatsOf(e).length > 0).length;

  const tiles: MetricTile[] = [
    { key: "requests", label: "Requests Analyzed", value: events.length, delta: delta(events.length, priorEvents.length), polarity: "neutral", hint: "AI requests evaluated by the pipeline in this window.", href: "/monitor" },
    { key: "activeThreats", label: "Active Threats", value: activeThreatCount, delta: delta(activeThreatCount, priorThreats), polarity: "higher-is-worse", hint: "Requests where the detection engine confirmed at least one threat.", href: "/threats" },
    { key: "criticalIncidents", label: "Critical Incidents", value: openIncidents, delta: null, polarity: "higher-is-worse", hint: "Incidents currently open or under investigation.", href: "/incidents" },
    { key: "blocked", label: "Requests Blocked", value: blockedCount, delta: delta(blockedCount, priorEvents.filter((e) => e.blocked).length), polarity: "neutral", hint: "Requests stopped before reaching the model, tools or user.", href: "/monitor?decision=BLOCK" },
    { key: "injections", label: "Prompt Injections", value: injections, delta: delta(injections, priorInjections), polarity: "higher-is-worse", hint: "Direct and indirect injection attempts detected.", href: "/threats?family=INJECTION" },
    { key: "ragThreats", label: "RAG Threats", value: ragThreats, delta: delta(ragThreats, priorRag), polarity: "higher-is-worse", hint: "Threats delivered through retrieved documents.", href: "/rag" },
    { key: "dataViolations", label: "Data Violations", value: dataExposure, delta: delta(dataExposure, priorDataExposure), polarity: "higher-is-worse", hint: "Sensitive values detected across monitored channels.", href: "/data-protection" },
    { key: "unauthorizedTools", label: "Unauthorized Tool Calls", value: unauthorizedTools, delta: delta(unauthorizedTools, priorUnauthorized), polarity: "higher-is-worse", hint: "Tool requests refused by the gateway.", href: "/tools" },
    { key: "highRiskAgents", label: "High-Risk Agents", value: highRiskAgents, delta: null, polarity: "higher-is-worse", hint: "Agents rated high or critical risk.", href: "/agents" },
  ];

  /* ------------------------------------------------------------- trends */
  const buckets = bucketsFor(range.hours);

  const threatTrend = buckets.map((b) => {
    const inBucket = events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end);
    const withThreat = inBucket.filter((e) => threatsOf(e).length > 0);
    return {
      bucket: b.key,
      label: b.label,
      total: withThreat.length,
      critical: withThreat.filter((e) => e.severity === "CRITICAL").length,
      high: withThreat.filter((e) => e.severity === "HIGH").length,
      medium: withThreat.filter((e) => e.severity === "MEDIUM").length,
      low: withThreat.filter((e) => e.severity === "LOW" || e.severity === "INFO").length,
    };
  });

  const canvas = buckets.map((b, i) => {
    const inBucket = events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end);
    const t = threatTrend[i];
    const opened = incidentsInWindow.filter(
      (inc) => inc.openedAt >= b.start && inc.openedAt < b.end,
    );
    return {
      label: b.label,
      total: t.total,
      critical: t.critical,
      high: t.high,
      medium: t.medium,
      low: t.low,
      requests: inBucket.length,
      incidents: opened.map((inc) => ({
        id: inc.id,
        reference: inc.ref,
        title: inc.title,
        severity: inc.severity as Severity,
        status: inc.status as string,
      })),
    };
  });

  const bands: Array<{ band: string; min: number; max: number; severity: Severity }> = [
    { band: "0-14", min: 0, max: 15, severity: "INFO" },
    { band: "15-39", min: 15, max: 40, severity: "LOW" },
    { band: "40-64", min: 40, max: 65, severity: "MEDIUM" },
    { band: "65-84", min: 65, max: 85, severity: "HIGH" },
    { band: "85-100", min: 85, max: 101, severity: "CRITICAL" },
  ];
  const riskDistribution = bands.map((b) => ({
    band: b.band,
    severity: b.severity,
    count: events.filter((e) => e.riskScore >= b.min && e.riskScore < b.max).length,
  }));

  const threatCounts = new Map<ThreatType, number>();
  for (const e of events) {
    for (const t of threatsOf(e)) threatCounts.set(t, (threatCounts.get(t) ?? 0) + 1);
  }
  const attackCategories = [...threatCounts.entries()]
    .map(([threatType, count]) => ({
      threatType,
      count,
      label: THREAT_META[threatType]?.label ?? threatType,
      family: THREAT_META[threatType]?.family ?? "INJECTION",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 9);

  const decisionCounts = new Map<string, number>();
  for (const e of events) decisionCounts.set(e.decision, (decisionCounts.get(e.decision) ?? 0) + 1);
  const decisionMix = [...decisionCounts.entries()]
    .map(([decision, count]) => ({ decision, count }))
    .sort((a, b) => b.count - a.count);

  const agentCounts = new Map<string, { requests: number; blocked: number }>();
  for (const e of events) {
    if (!e.agentId) continue;
    const entry = agentCounts.get(e.agentId) ?? { requests: 0, blocked: 0 };
    entry.requests++;
    if (e.blocked) entry.blocked++;
    agentCounts.set(e.agentId, entry);
  }
  const agentActivity = agents
    .map((a) => ({
      name: a.name,
      slug: a.slug,
      riskLevel: a.riskLevel,
      securityScore: a.securityScore,
      requests: agentCounts.get(a.id)?.requests ?? 0,
      blocked: agentCounts.get(a.id)?.blocked ?? 0,
    }))
    .filter((a) => a.requests > 0)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 8);

  const toolMap = new Map<string, { name: string; slug: string; riskTier: number; allowed: number; blocked: number; approval: number }>();
  for (const c of toolCalls) {
    const entry = toolMap.get(c.tool.slug) ?? {
      name: c.tool.name, slug: c.tool.slug, riskTier: c.tool.riskTier,
      allowed: 0, blocked: 0, approval: 0,
    };
    if (c.decision === "BLOCK") entry.blocked++;
    else if (c.decision === "REQUIRE_APPROVAL") entry.approval++;
    else entry.allowed++;
    toolMap.set(c.tool.slug, entry);
  }
  const toolUsage = [...toolMap.values()]
    .sort((a, b) => b.allowed + b.blocked + b.approval - (a.allowed + a.blocked + a.approval))
    .slice(0, 8);

  const dataEvents = buckets.map((b) => {
    const inBucket = sensitiveHits.filter((h) => h.createdAt >= b.start && h.createdAt < b.end);
    const sum = (category: string) =>
      inBucket.filter((h) => h.category === category).reduce((s, h) => s + h.count, 0);
    return {
      bucket: b.key,
      label: b.label,
      pii: sum("PII"),
      credentials: sum("CREDENTIAL"),
      customer: sum("CUSTOMER") + sum("EMPLOYEE"),
      other: inBucket.reduce((s, h) => s + h.count, 0) - sum("PII") - sum("CREDENTIAL") - sum("CUSTOMER") - sum("EMPLOYEE"),
    };
  });

  const topRisks = events
    .filter((e) => e.riskScore >= 65)
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      ref: e.ref,
      severity: e.severity,
      riskScore: e.riskScore,
      createdAt: e.createdAt,
      application: e.application?.name ?? "—",
      title:
        threatsOf(e)
          .map((t) => THREAT_META[t]?.label ?? t)
          .slice(0, 2)
          .join(" + ") || `Elevated risk ${e.riskScore}/100`,
    }));

  /*
   * Per-bucket series for the hero trend and the tile sparklines.
   *
   * Computed from the same bucket boundaries as the charts so a spark and its
   * chart can never tell different stories about the same window.
   */
  const postureTrend = buckets.map((b) => {
    const inBucket = events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end);
    if (inBucket.length === 0) return securityScore;
    return scoreFor(
      inBucket.filter((e) => e.blocked).length,
      inBucket.length,
      inBucket.filter((e) => e.severity === "CRITICAL").length,
      inBucket.reduce((s, e) => s + e.riskScore, 0) / inBucket.length,
    );
  });

  const seriesFor = (predicate: (e: (typeof events)[number]) => boolean) =>
    buckets.map(
      (b) =>
        events.filter((e) => e.createdAt >= b.start && e.createdAt < b.end && predicate(e)).length,
    );

  const sparklines: Record<string, number[]> = {
    requests: seriesFor(() => true),
    activeThreats: seriesFor((e) => threatsOf(e).length > 0),
    blocked: seriesFor((e) => e.blocked),
    injections: seriesFor((e) => threatsOf(e).some((t) => t.includes("INJECTION"))),
    ragThreats: seriesFor((e) => threatsOf(e).some((t) => THREAT_META[t]?.family === "RAG")),
    unauthorizedTools: seriesFor((e) =>
      threatsOf(e).some((t) => t === "UNAUTHORIZED_TOOL_CALL" || t === "TOOL_ABUSE"),
    ),
  };

  /*
   * Threat level is a reading of current conditions, derived rather than
   * stored: open critical incidents first, then the rate of critical events,
   * then blocked share. A level that only tracked volume would read "severe"
   * on a busy quiet day and "low" during a single devastating breach.
   */
  const criticalRate = events.length ? criticalCount / events.length : 0;
  const blockedRate = events.length ? blockedCount / events.length : 0;
  const threatLevel: "LOW" | "GUARDED" | "ELEVATED" | "SEVERE" =
    openIncidents >= 5 || criticalRate > 0.12
      ? "SEVERE"
      : openIncidents >= 2 || criticalRate > 0.05 || blockedRate > 0.2
        ? "ELEVATED"
        : activeThreatCount > 0
          ? "GUARDED"
          : "LOW";

  return {
    range,
    securityScore,
    securityScoreDelta: priorScore === null ? null : securityScore - priorScore,
    threatLevel,
    postureTrend,
    sparklines,
    canvas,
    tiles,
    threatTrend,
    riskDistribution,
    attackCategories,
    decisionMix,
    agentActivity,
    toolUsage,
    dataEvents,
    topRisks,
  };
}
