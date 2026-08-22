import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingest } from "@/lib/runtime/ingest";
import { scenarioByKey } from "@/lib/simulator/scenarios";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";
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
    const user = await requireApiUser();
    assertCan(user.role, "simulator:run");

    const body = (await request.json()) as {
      scenarioKey: string;
      /** Text to run instead of the scenario's own prompt. */
      prompt?: string;
      /** Model reply to screen, for exercising the outbound controls. */
      output?: string;
    };

    const scenario = scenarioByKey(body.scenarioKey);
    if (!scenario) {
      return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
    }

    /* A supplied prompt borrows the scenario's estate — its application, agent,
       retrieved documents and proposed tool calls — and replaces only the text.
       That is the useful half to vary: the same setup, your wording, so the
       result is comparable to the canned run beside it. */
    const custom = Boolean(body.prompt?.trim());
    const input = custom ? body.prompt!.trim() : scenario.prompt;
    const output = custom ? (body.output?.trim() || undefined) : scenario.output;

    if (custom && input.length > 4000) {
      return NextResponse.json(
        { error: "Input is limited to 4000 characters." },
        { status: 400 },
      );
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
      input,
      output,
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

    /* Outbound side. The inbound checks above say the request was recognised;
       these say the reply was screened before it could be delivered. Both
       matter independently — a control that only works when the input gives
       it away has not been tested. */
    const expectedControls = scenario.expected.outputControls ?? [];
    const firedControls = result.guardrails
      .filter((g) => g.triggered && g.direction === "OUTPUT")
      .map((g) => g.key);
    const controlsMet = expectedControls.filter((k) => firedControls.includes(k));
    const controlsPassed = expectedControls.length === 0 || controlsMet.length > 0;

    const redactionExpected = scenario.expected.redacted === true;
    const redactionPassed = !redactionExpected || result.redacted;

    /* The expectation describes the scenario's own text. Grading someone else's
       wording against it would report a failure for a prompt that never claimed
       to be that attack, so a custom run is reported rather than marked. */
    const passed = custom
      ? null
      : threatsMet.length > 0 && decisionMet && riskMet && controlsPassed && redactionPassed;

    return NextResponse.json({
      scenarioKey: scenario.key,
      eventId: outcome.eventId,
      eventRef: outcome.eventRef,
      incidentRef: outcome.incidentRef,
      durationMs: Date.now() - started,
      custom,
      input,
      passed,
      grading: custom ? null : {
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
        outputControls: expectedControls.length
          ? {
              expected: expectedControls,
              fired: firedControls,
              met: controlsMet,
              passed: controlsPassed,
            }
          : null,
        redaction: redactionExpected
          ? { expected: true, actual: result.redacted, passed: redactionPassed }
          : null,
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
    return apiError(error, "Simulation failed");
  }
}
