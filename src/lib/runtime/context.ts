import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import type {
  AgentContext,
  AnalysisContext,
  ApplicationContext,
  BaselineContext,
  GuardrailConfig,
  HistoryContext,
  PolicyConfig,
  PrincipalContext,
  RetrievedChunk,
  ToolDefinitionContext,
  ToolGrantContext,
} from "@/lib/engine/types";

/**
 * Materialises an AnalysisContext from the database.
 *
 * The engine is pure and knows nothing about persistence, so this is the only
 * place that translates rows into the shapes it expects. Everything the engine
 * needs is loaded up front: it must never reach back for more data mid-analysis,
 * because a decision that depends on I/O ordering is not reproducible.
 */

export interface ContextRequest {
  requestId: string;
  userId: string;
  applicationSlug: string;
  agentSlug?: string;
  input: string;
  output?: string;
  /** Document ids to treat as retrieved, in rank order. */
  retrievedDocumentIds?: string[];
  proposedToolCalls?: AnalysisContext["proposedToolCalls"];
  timestamp?: Date;
  simulated?: boolean;
  scenarioKey?: string;
}

/** Trailing window used for behavioural history. */
const HISTORY_WINDOW_MS = 60 * 60 * 1000;

export async function buildAnalysisContext(
  request: ContextRequest,
): Promise<AnalysisContext> {
  const timestamp = request.timestamp ?? new Date();

  const [user, app, guardrailRows, policyRows, toolRows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: request.userId } }),
    prisma.aiApplication.findUniqueOrThrow({
      where: { slug: request.applicationSlug },
      include: { model: true },
    }),
    prisma.guardrail.findMany({ orderBy: { key: "asc" } }),
    prisma.policy.findMany({ orderBy: { priority: "asc" } }),
    prisma.tool.findMany(),
  ]);

  const agentRow = request.agentSlug
    ? await prisma.agent.findUnique({
        where: { slug: request.agentSlug },
        include: { toolGrants: { include: { tool: true } } },
      })
    : null;

  const principal: PrincipalContext = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clearance: user.clearance,
    department: user.department,
    riskScore: user.riskScore,
  };

  const application: ApplicationContext = {
    id: app.id,
    name: app.name,
    slug: app.slug,
    systemPrompt: app.systemPrompt,
    securityScore: app.securityScore,
  };

  const tools: Record<string, ToolDefinitionContext> = {};
  for (const t of toolRows) {
    tools[t.slug] = {
      slug: t.slug,
      name: t.name,
      category: t.category,
      description: t.description,
      operations: jsonArray<string>(t.operations),
      riskTier: t.riskTier,
      requiresApproval: t.requiresApproval,
      approvalThreshold: t.approvalThreshold,
      rateLimitPerMinute: t.rateLimitPerMinute,
      parameterSchema: (t.parameterSchema as Record<string, unknown> | null) ?? null,
      allowedDomains: t.allowedDomains ? jsonArray<string>(t.allowedDomains) : null,
      enabled: t.enabled,
    };
  }

  let agent: AgentContext | undefined;
  if (agentRow) {
    const grants: Record<string, ToolGrantContext> = {};
    for (const g of agentRow.toolGrants) {
      grants[g.tool.slug] = {
        toolSlug: g.tool.slug,
        operations: jsonArray<string>(g.operations),
        denied: g.denied,
        maxCallsPerRequest: g.maxCallsPerRequest,
      };
    }
    agent = {
      id: agentRow.id,
      name: agentRow.name,
      slug: agentRow.slug,
      purpose: agentRow.purpose,
      systemPrompt: agentRow.systemPrompt,
      maxToolCallsPerRequest: agentRow.maxToolCallsPerRequest,
      dataClearance: agentRow.dataClearance,
      riskLevel: agentRow.riskLevel,
      securityScore: agentRow.securityScore,
      grants,
    };
  }

  /* ------------------------------------------------------------ retrieval */
  let retrievals: RetrievedChunk[] | undefined;
  if (request.retrievedDocumentIds?.length) {
    const docs = await prisma.document.findMany({
      where: { id: { in: request.retrievedDocumentIds } },
      include: { source: true },
    });
    // Preserve the caller's rank order rather than the database's.
    const byId = new Map(docs.map((d) => [d.id, d]));
    retrievals = request.retrievedDocumentIds
      .map((id, rank) => {
        const d = byId.get(id);
        if (!d) return null;
        return {
          documentId: d.id,
          title: d.title,
          content: d.content,
          similarity: Number((0.94 - rank * 0.06).toFixed(3)),
          chunkIndex: 0,
          classification: d.classification,
          trustScore: d.trustScore,
          sourceTrust: d.source.trustLevel,
          sourceName: d.source.name,
          sourceIsExternal: d.source.isExternal,
          quarantined: d.quarantined,
          scanStatus: d.scanStatus,
        } satisfies RetrievedChunk;
      })
      .filter((c): c is RetrievedChunk => c !== null);
  }

  /* -------------------------------------------------------------- history */
  const since = new Date(timestamp.getTime() - HISTORY_WINDOW_MS);
  const recentEvents = await prisma.securityEvent.findMany({
    where: { userId: user.id, createdAt: { gte: since, lt: timestamp } },
    select: { blocked: true, applicationId: true, threatTypes: true },
  });

  const toolCallsInWindow: Record<string, number> = {};
  if (agentRow) {
    const recentCalls = await prisma.toolCall.findMany({
      where: {
        agentId: agentRow.id,
        createdAt: { gte: new Date(timestamp.getTime() - 60_000), lt: timestamp },
      },
      include: { tool: { select: { slug: true } } },
    });
    for (const c of recentCalls) {
      toolCallsInWindow[c.tool.slug] = (toolCallsInWindow[c.tool.slug] ?? 0) + 1;
    }
  }

  const history: HistoryContext = {
    recentRequests: recentEvents.length,
    recentBlocked: recentEvents.filter((e) => e.blocked).length,
    recentThreats: recentEvents.filter((e) => jsonArray(e.threatTypes).length > 0).length,
    distinctApplications: new Set(recentEvents.map((e) => e.applicationId)).size,
    toolCallsInWindow,
  };

  /* ------------------------------------------------------------ baselines */
  const baselineRows = await prisma.baseline.findMany({
    where: agentRow
      ? { OR: [{ subjectType: "AGENT", subjectId: agentRow.id }, { subjectType: "USER", subjectId: user.id }] }
      : { subjectType: "USER", subjectId: user.id },
  });
  const baselines: BaselineContext = {};
  for (const b of baselineRows) {
    const variance = b.sampleCount > 1 ? b.m2 / (b.sampleCount - 1) : 0;
    baselines[b.metric] = {
      mean: b.mean,
      stddev: Math.sqrt(variance),
      sampleCount: b.sampleCount,
    };
  }

  const guardrails: GuardrailConfig[] = guardrailRows.map((g) => ({
    key: g.key,
    name: g.name,
    direction: g.direction,
    controlType: g.controlType,
    enabled: g.enabled,
    threshold: g.threshold,
    action: g.action,
    config: (g.config as Record<string, unknown>) ?? {},
  }));

  const policies: PolicyConfig[] = policyRows.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    category: p.category,
    enabled: p.enabled,
    priority: p.priority,
    condition: p.condition,
    action: p.action,
    severity: p.severity,
    requiresApproval: p.requiresApproval,
  }));

  return {
    requestId: request.requestId,
    timestamp,
    principal,
    application,
    agent,
    model: {
      name: app.model.name,
      provider: app.model.provider,
      sensitivityTier: app.model.sensitivityTier,
    },
    input: request.input,
    output: request.output,
    retrievals,
    proposedToolCalls: request.proposedToolCalls,
    tools,
    history,
    baselines,
    guardrails,
    policies,
    simulated: request.simulated,
    scenarioKey: request.scenarioKey,
  };
}
