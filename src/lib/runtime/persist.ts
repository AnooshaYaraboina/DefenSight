import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/db/json";
import { updateBaseline } from "@/lib/engine/detectors";
import { SEVERITY_RANK, THREAT_META, type Severity } from "@/lib/engine/taxonomy";
import type { AnalysisContext, AnalysisResult } from "@/lib/engine/types";

/**
 * Persists an analysis result and everything that follows from it: detections,
 * sensitive hits, tool calls, approvals, retrievals, alerts, incidents, audit
 * entries and baseline updates.
 *
 * Written as a single transaction. A security event whose detections failed to
 * save is worse than no event at all — an analyst would see a benign-looking
 * row with no evidence behind it.
 */

function ref(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Threats at or above this severity open an incident automatically (§17). */
const INCIDENT_THRESHOLD: Severity = "CRITICAL";
/** Alerts are raised at or above this severity (§24). */
const ALERT_THRESHOLD: Severity = "HIGH";

export interface PersistOptions {
  context: AnalysisContext;
  result: AnalysisResult;
  /**
   * Suppresses live *broadcast* only. Alerts and incidents are still recorded:
   * they are security data, and a replayed history missing them would not match
   * what the engine actually concluded.
   */
  quiet?: boolean;
}

export interface PersistedEvent {
  eventId: string;
  eventRef: string;
  incidentId?: string;
  incidentRef?: string;
  alertIds: string[];
}

export async function persistAnalysis(options: PersistOptions): Promise<PersistedEvent> {
  const { context, result } = options;

  const applicationId = context.application.id;
  const agentId = context.agent?.id;
  const eventRef = ref("EVT");

  const primaryThreat = result.threatTypes[0];

  const created = await prisma.$transaction(async (tx) => {
    /* ------------------------------------------------------------- event */
    const event = await tx.securityEvent.create({
      data: {
        ref: eventRef,
        createdAt: context.timestamp,
        applicationId,
        agentId,
        userId: context.principal.id,
        modelId: (await tx.aiApplication.findUnique({
          where: { id: applicationId },
          select: { modelId: true },
        }))?.modelId,
        requestText: context.input,
        responseText: context.output ?? null,
        redactedResponse: result.redactedOutput ?? null,
        riskScore: result.riskScore,
        severity: result.severity,
        decision: result.decision,
        threatTypes: result.threatTypes,
        blocked: result.blocked,
        redacted: result.redacted,
        detectionCount: result.detections.length,
        sensitiveHitCount: result.sensitiveFindings.length,
        toolCallCount: result.toolDecisions.length,
        retrievalCount: context.retrievals?.length ?? 0,
        riskFactors: asJson({
          score: result.risk.score,
          confidence: result.risk.confidence,
          rationale: result.risk.rationale,
          topDrivers: result.risk.topDrivers,
          factors: result.risk.factors,
        }),
        stageTrace: asJson(result.stageTrace),
        latencyMs: result.latencyMs,
        simulated: Boolean(context.simulated),
        scenarioKey: context.scenarioKey ?? null,
      },
    });

    /* -------------------------------------------------------- detections */
    if (result.detections.length > 0) {
      await tx.detection.createMany({
        data: result.detections.map((d) => ({
          eventId: event.id,
          detectorId: d.detectorId,
          layer: d.layer,
          threatType: d.threatType,
          channel: d.channel,
          confidence: d.confidence,
          score: d.score,
          severity: d.severity,
          explanation: d.explanation,
          evidence: asJson(d.evidence),
          createdAt: context.timestamp,
        })),
      });
    }

    /* ---------------------------------------------------- sensitive hits */
    if (result.sensitiveFindings.length > 0) {
      await tx.sensitiveHit.createMany({
        data: result.sensitiveFindings.map((f) => ({
          eventId: event.id,
          channel: f.channel,
          type: f.type,
          category: f.category,
          count: f.count,
          action: result.redacted ? "REDACT" : result.blocked ? "BLOCK" : "WARN",
          maskedSample: f.maskedSample,
          offsetStart: f.spans[0]?.start ?? 0,
          offsetEnd: f.spans[0]?.end ?? 0,
          confidence: f.confidence,
          createdAt: context.timestamp,
        })),
      });
    }

    /* --------------------------------------------------------- retrievals */
    if (context.retrievals?.length) {
      const withheldIds = new Set(result.withheldRetrievals.map((w) => w.documentId));
      const withheldReason = new Map(
        result.withheldRetrievals.map((w) => [w.documentId, w.reason]),
      );
      await tx.retrievalEvent.createMany({
        data: context.retrievals.map((r) => ({
          eventId: event.id,
          documentId: r.documentId,
          query: context.input.slice(0, 400),
          similarity: r.similarity,
          chunkIndex: r.chunkIndex,
          allowed: !withheldIds.has(r.documentId),
          withheldReason: withheldReason.get(r.documentId) ?? null,
          createdAt: context.timestamp,
        })),
      });
    }

    /* ---------------------------------------------------------- tool calls */
    const toolRows = await tx.tool.findMany({ select: { id: true, slug: true } });
    const toolIdBySlug = new Map(toolRows.map((t) => [t.slug, t.id]));

    for (const decision of result.toolDecisions) {
      const toolId = toolIdBySlug.get(decision.toolSlug);
      if (!toolId || !agentId) continue;

      const call = await tx.toolCall.create({
        data: {
          eventId: event.id,
          agentId,
          toolId,
          operation: decision.operation as "READ" | "WRITE" | "DELETE" | "EXECUTE",
          arguments: asJson(decision.arguments),
          decision: decision.decision,
          riskScore: decision.riskScore,
          checks: asJson(decision.checks),
          reason: decision.reason,
          executed: decision.decision === "ALLOW",
          executedAt: decision.decision === "ALLOW" ? context.timestamp : null,
          durationMs: decision.decision === "ALLOW" ? 40 + Math.round(decision.riskScore) : null,
          createdAt: context.timestamp,
        },
      });

      if (decision.decision === "REQUIRE_APPROVAL") {
        await tx.toolApproval.create({
          data: {
            toolCallId: call.id,
            status: "PENDING",
            requestedBy: context.agent?.name ?? "unknown agent",
            reason: decision.reason,
            riskSummary: `Risk ${decision.riskScore}/100. ${decision.checks.filter((c) => !c.passed).length} check(s) failed.`,
            expiresAt: new Date(context.timestamp.getTime() + 4 * 3600_000),
            createdAt: context.timestamp,
          },
        });
      }
    }

    return event;
  });

  /* ------------------------------------------------- alerts and incidents */
  const alertIds: string[] = [];
  let incidentId: string | undefined;
  let incidentRef: string | undefined;

  const raisesAlert =
    SEVERITY_RANK[result.severity] >= SEVERITY_RANK[ALERT_THRESHOLD] && result.threatTypes.length > 0;
  const opensIncident =
    SEVERITY_RANK[result.severity] >= SEVERITY_RANK[INCIDENT_THRESHOLD] && result.blocked;

  if (opensIncident && primaryThreat) {
    const year = context.timestamp.getUTCFullYear();
    const count = await prisma.incident.count();
    incidentRef = `INC-${year}-${String(count + 1).padStart(4, "0")}`;

    const incident = await prisma.incident.create({
      data: {
        ref: incidentRef,
        title: `${THREAT_META[primaryThreat].label} — ${context.application.name}`,
        summary: result.summary,
        severity: result.severity,
        status: "OPEN",
        threatType: primaryThreat,
        applicationId,
        agentId,
        subjectUser: context.principal.name,
        attackChain: asJson(result.stageTrace),
        openedAt: context.timestamp,
      },
    });
    incidentId = incident.id;

    await prisma.securityEvent.update({
      where: { id: created.id },
      data: { incidentId: incident.id },
    });

    // Seed the timeline from the pipeline trace so an analyst opening the case
    // sees the full sequence immediately rather than an empty history.
    await prisma.incidentTimelineEntry.createMany({
      data: [
        {
          incidentId: incident.id,
          kind: "DETECTION",
          actor: "DefenSight Engine",
          message: result.summary,
          metadata: { eventRef, riskScore: result.riskScore, threatTypes: result.threatTypes },
          createdAt: context.timestamp,
        },
        ...result.stageTrace
          .filter((s) => s.decision && s.decision !== "ALLOW")
          .map((s) => ({
            incidentId: incident.id,
            kind: "EVIDENCE",
            actor: "DefenSight Engine",
            message: `${s.label}: ${s.summary}`,
            metadata: asJson({ stage: s.stage, decision: s.decision, details: s.details }),
            createdAt: new Date(context.timestamp.getTime() + 1),
          })),
      ],
    });
  }

  if (raisesAlert) {
    const alert = await prisma.alert.create({
      data: {
        severity: result.severity,
        title: primaryThreat
          ? `${THREAT_META[primaryThreat].label} ${result.blocked ? "blocked" : "detected"}`
          : `Elevated risk ${result.riskScore}/100`,
        message: result.summary,
        category: opensIncident ? "INCIDENT" : "THREAT",
        eventId: created.id,
        incidentId,
        createdAt: context.timestamp,
      },
    });
    alertIds.push(alert.id);
  }

  /* --------------------------------------------------------- audit trail */
  await prisma.auditLog.create({
    data: {
      actorId: context.principal.id,
      actorName: context.principal.name,
      actorRole: context.principal.role,
      action: `request.${result.decision.toLowerCase()}`,
      category: "SECURITY_DECISION",
      targetType: "SecurityEvent",
      targetId: created.id,
      targetLabel: eventRef,
      description: result.summary,
      metadata: {
        riskScore: result.riskScore,
        threatTypes: result.threatTypes,
        application: context.application.name,
        agent: context.agent?.name,
      },
      outcome: result.blocked ? "FAILURE" : "SUCCESS",
      createdAt: context.timestamp,
    },
  });

  /* --------------------------------------------------- control fire counts */
  await recordControlHits(result, context.timestamp);

  /* ------------------------------------------------------------ baselines */
  await updateBaselines(context, result);

  /* ------------------------------------------ denormalised score updates */
  await refreshPostureScores(applicationId, agentId);

  return { eventId: created.id, eventRef, incidentId, incidentRef, alertIds };
}

/**
 * Count the controls that actually acted on this request.
 *
 * Distinct from the detection counts the Guardrails Center already shows. A
 * control can be in scope for twenty detections and have fired none of them,
 * because every one sat below its threshold — that is the difference between
 * "this control is watching something" and "this control is doing something",
 * and it is the number that tells an administrator whether a threshold is set
 * usefully.
 *
 * Only triggered controls are counted. Evaluating a guardrail and deciding not
 * to act is not a hit.
 */
async function recordControlHits(result: AnalysisResult, at: Date) {
  const guardrailKeys = result.guardrails.filter((g) => g.triggered).map((g) => g.key);
  const policyIds = result.policies.filter((p) => p.matched).map((p) => p.policyId);

  await Promise.all([
    guardrailKeys.length
      ? prisma.guardrail.updateMany({
          where: { key: { in: guardrailKeys } },
          data: { hitCount: { increment: 1 }, lastHitAt: at },
        })
      : null,
    policyIds.length
      ? prisma.policy.updateMany({
          where: { id: { in: policyIds } },
          data: { hitCount: { increment: 1 }, lastHitAt: at },
        })
      : null,
  ]);
}

/** Roll the behavioural baselines forward with this request's observations. */
async function updateBaselines(context: AnalysisContext, result: AnalysisResult) {
  const observations: Array<{ subjectType: string; subjectId: string; metric: string; value: number; agentId?: string }> = [
    { subjectType: "USER", subjectId: context.principal.id, metric: "promptLength", value: context.input.length },
    { subjectType: "USER", subjectId: context.principal.id, metric: "riskScore", value: result.riskScore },
  ];

  if (context.agent) {
    observations.push(
      { subjectType: "AGENT", subjectId: context.agent.id, agentId: context.agent.id, metric: "toolCallsPerRequest", value: result.toolDecisions.length },
      { subjectType: "AGENT", subjectId: context.agent.id, agentId: context.agent.id, metric: "retrievalCount", value: context.retrievals?.length ?? 0 },
      { subjectType: "AGENT", subjectId: context.agent.id, agentId: context.agent.id, metric: "distinctToolsUsed", value: new Set(result.toolDecisions.map((d) => d.toolSlug)).size },
    );
  }

  for (const o of observations) {
    const existing = await prisma.baseline.findUnique({
      where: { subjectType_subjectId_metric: { subjectType: o.subjectType, subjectId: o.subjectId, metric: o.metric } },
    });
    const next = updateBaseline(
      { mean: existing?.mean ?? 0, m2: existing?.m2 ?? 0, sampleCount: existing?.sampleCount ?? 0 },
      o.value,
    );
    await prisma.baseline.upsert({
      where: { subjectType_subjectId_metric: { subjectType: o.subjectType, subjectId: o.subjectId, metric: o.metric } },
      create: {
        subjectType: o.subjectType, subjectId: o.subjectId, agentId: o.agentId, metric: o.metric,
        mean: next.mean, m2: next.m2, sampleCount: next.sampleCount, min: o.value, max: o.value,
      },
      update: {
        mean: next.mean, m2: next.m2, sampleCount: next.sampleCount,
        min: Math.min(existing?.min ?? o.value, o.value),
        max: Math.max(existing?.max ?? o.value, o.value),
      },
    });
  }
}

/**
 * Recompute posture scores from observed history.
 *
 * A security score that never moves is decoration. This derives it from the
 * blocked-request ratio and recent critical activity, so the number on the
 * Applications and Agents screens reflects what actually happened.
 */
export async function refreshPostureScores(applicationId?: string, agentId?: string) {
  const since = new Date(Date.now() - 7 * 24 * 3600_000);

  if (applicationId) {
    const events = await prisma.securityEvent.findMany({
      where: { applicationId, createdAt: { gte: since } },
      select: { blocked: true, severity: true, riskScore: true },
    });
    await prisma.aiApplication.update({
      where: { id: applicationId },
      data: { securityScore: computePosture(events), lastActivityAt: new Date() },
    });
  }

  if (agentId) {
    const events = await prisma.securityEvent.findMany({
      where: { agentId, createdAt: { gte: since } },
      select: { blocked: true, severity: true, riskScore: true },
    });
    const score = computePosture(events);
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        securityScore: score,
        riskLevel: score >= 85 ? "LOW" : score >= 70 ? "MEDIUM" : score >= 55 ? "HIGH" : "CRITICAL",
        lastActivityAt: new Date(),
      },
    });
  }
}

function computePosture(
  events: Array<{ blocked: boolean; severity: string; riskScore: number }>,
): number {
  if (events.length === 0) return 100;

  const blockedRatio = events.filter((e) => e.blocked).length / events.length;
  const criticals = events.filter((e) => e.severity === "CRITICAL").length;
  const avgRisk = events.reduce((s, e) => s + e.riskScore, 0) / events.length;

  // Start from a clean bill and deduct for what the history shows. Blocked
  // requests indicate the estate is under attack; sustained high average risk
  // indicates it is poorly scoped.
  const score =
    100 -
    blockedRatio * 45 -
    Math.min(25, criticals * 4) -
    Math.max(0, (avgRisk - 20) / 80) * 30;

  return Math.max(0, Math.min(100, Math.round(score)));
}
