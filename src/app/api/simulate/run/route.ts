import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingest } from "@/lib/runtime/ingest";
import { scenarioByKey } from "@/lib/simulator/scenarios";
import { getCurrentUser } from "@/lib/rbac/session";
import { assertCan, ForbiddenError } from "@/lib/rbac/permissions";
import { SEVERITY_RANK } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Runs one simulator scenario through the production pipeline (§19).
 *
 * The response reports Attack → Detection → Risk Score → Defense → Final Result
 * from the engine's actual output, and grades it against the scenario's stated
 * expectation. A scenario that fails is reported as a failure.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    assertCan(user.role, "simulator:run");

    const { scenarioKey } = (await request.json()) as { scenarioKey: string };
    const scenario = scenarioByKey(scenarioKey);
    if (!scenario) {
      return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
    }

    const documents = scenario.documents?.length
      ? await prisma.document.findMany({
          where: { title: { in: scenario.documents } },
          select: { id: true },
        })
      : [];

    const actor = scenario.user
      ? await prisma.user.findUnique({ where: { email: scenario.user }, select: { id: true } })
      : null;
    const fallback = await prisma.user.findFirst({
      where: { role: "VIEWER" },
      select: { id: true },
    });

    const started = Date.now();
    const outcome = await ingest({
      userId: actor?.id ?? fallback!.id,
      applicationSlug: scenario.application,
      agentSlug: scenario.agent,
      input: scenario.prompt,
      output: scenario.output,
      retrievedDocumentIds: documents.map((d) => d.id),
      proposedToolCalls: scenario.toolCalls?.map((t, index) => ({
        toolSlug: t.slug,
        operation: t.operation,
        arguments: t.args,
        index,
      })),
      simulated: true,
      scenarioKey: scenario.key,
    });

    const { result } = outcome;

    // Grade against the scenario's assertion. Detecting *more* than expected is
    // not a failure; detecting less, or letting the request through, is.
    const threatsMet = scenario.expected.threatTypes.filter((t) =>
      result.threatTypes.includes(t),
    );
    const decisionMet = scenario.expected.decisions.includes(result.decision);
    const riskMet = result.riskScore >= scenario.expected.minRisk;
    const passed = threatsMet.length > 0 && decisionMet && riskMet;

    return NextResponse.json({
      scenarioKey: scenario.key,
      eventId: outcome.eventId,
      eventRef: outcome.eventRef,
      incidentRef: outcome.incidentRef,
      durationMs: Date.now() - started,
      passed,
      grading: {
        threats: {
          expected: scenario.expected.threatTypes,
          detected: result.threatTypes,
          met: threatsMet,
          passed: threatsMet.length > 0,
        },
        decision: {
          expected: scenario.expected.decisions,
          actual: result.decision,
          passed: decisionMet,
        },
        risk: {
          minimum: scenario.expected.minRisk,
          actual: result.riskScore,
          passed: riskMet,
        },
      },
      result: {
        decision: result.decision,
        riskScore: result.riskScore,
        severity: result.severity,
        severityRank: SEVERITY_RANK[result.severity],
        threatTypes: result.threatTypes,
        blocked: result.blocked,
        redacted: result.redacted,
        summary: result.summary,
        latencyMs: result.latencyMs,
        detections: result.detections.map((d) => ({
          detectorId: d.detectorId,
          layer: d.layer,
          threatType: d.threatType,
          confidence: d.confidence,
          severity: d.severity,
          explanation: d.explanation,
        })),
        risk: {
          score: result.risk.score,
          rationale: result.risk.rationale,
          topDrivers: result.risk.topDrivers,
          factors: result.risk.factors,
        },
        policies: result.policies.filter((p) => p.matched).map((p) => ({
          key: p.policyKey,
          name: p.policyName,
          action: p.action,
          conditions: p.matchedConditions,
        })),
        toolDecisions: result.toolDecisions.map((t) => ({
          tool: t.toolName,
          operation: t.operation,
          decision: t.decision,
          riskScore: t.riskScore,
          reason: t.reason,
          failedChecks: t.checks.filter((c) => !c.passed).map((c) => c.label),
        })),
        withheldRetrievals: result.withheldRetrievals,
        intent: result.intent
          ? {
              divergence: result.intent.divergence,
              unrelatedActions: result.intent.unrelatedActions,
              explanation: result.intent.explanation,
            }
          : null,
        stageTrace: result.stageTrace,
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Simulation failed" },
      { status: 500 },
    );
  }
}
