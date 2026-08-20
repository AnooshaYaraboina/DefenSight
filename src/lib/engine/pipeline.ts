/**
 * The DefenSight defensive pipeline (§26, §29).
 *
 *   MONITOR → DETECT → ANALYZE → SCORE → DECIDE → BLOCK/ALLOW → ALERT
 *
 * Every request in the platform runs through this one function: live traffic,
 * the attack simulator, the historical replay that builds the demo dataset, and
 * the AI assistant's own queries. There is no second, weaker path — which is
 * what makes the simulator's results meaningful rather than theatrical.
 *
 * Two properties are load-bearing:
 *
 *  1. **Order independence.** Stages contribute findings; they do not decide.
 *     The final decision is the most restrictive outcome across guardrails,
 *     policies and the tool gateway, computed once at the end. Reordering the
 *     stages cannot change the verdict.
 *
 *  2. **Retrieved content is never instructions.** Text arriving from a
 *     document or a tool result is analysed on a stricter footing than text the
 *     user typed, and instructions found there are stripped rather than obeyed.
 *
 * Every stage appends to `stageTrace`, which is what the attack-chain view
 * (§18) renders. The trace is the audit record: it shows what was known at each
 * point and what the platform did about it.
 */
import {
  CLASSIFICATION_RANK,
  mostRestrictive,
  severityFromRisk,
  type Classification,
  type Decision,
  type PipelineStage,
  type ThreatType,
} from "./taxonomy";
import type {
  AnalysisContext,
  AnalysisResult,
  DetectionResult,
  SensitiveFinding,
  StageTrace,
  ToolDecision,
} from "./types";
import { normalize } from "./normalize";
import { runDetectors, fuseDetections, behaviouralDetections } from "./detectors";
import { scanSensitive } from "./sensitive";
import { assessRisk } from "./risk";
import { evaluatePolicies } from "./policy/engine";
import { buildFacts } from "./policy/facts";
import { evaluateGuardrails, applyRedaction } from "./guardrails";
import { authorizeToolCalls } from "./toolgw";
import { analyseAgentBehaviour } from "./agents/behavior";

/** Documents below this trust score are withheld even when nothing was found. */
const MIN_RETRIEVAL_TRUST = 20;

export function analyze(context: AnalysisContext): AnalysisResult {
  const pipelineStart = Date.now();
  const stageTrace: StageTrace[] = [];
  const detections: DetectionResult[] = [];
  const sensitiveFindings: SensitiveFinding[] = [];
  const withheldRetrievals: AnalysisResult["withheldRetrievals"] = [];

  const stage = <T>(
    name: PipelineStage,
    label: string,
    fn: () => { summary: string; details?: Record<string, unknown>; decision?: Decision; result: T },
  ): T => {
    const started = Date.now();
    const { summary, details, decision, result } = fn();
    stageTrace.push({
      stage: name,
      label,
      summary,
      decision,
      durationMs: Date.now() - started,
      details,
    });
    return result;
  };

  /* ====================================================== 1. INGEST ====== */

  const inputNormalization = stage("INGEST", "Request Ingested", () => {
    const norm = normalize(context.input);
    return {
      summary: `Request received from ${context.principal.name} (${context.principal.role.replace(/_/g, " ").toLowerCase()}) to ${context.application.name}${context.agent ? ` via ${context.agent.name}` : ""}. ${context.input.length} characters${norm.obfuscated ? `, with obfuscation detected (${(norm.obfuscationScore * 100).toFixed(0)}%)` : ""}.`,
      details: {
        principal: context.principal.name,
        clearance: context.principal.clearance,
        application: context.application.name,
        agent: context.agent?.name,
        inputLength: context.input.length,
        obfuscated: norm.obfuscated,
        obfuscationScore: Number(norm.obfuscationScore.toFixed(3)),
        decodedVariants: norm.variants.length - 1,
      },
      result: norm,
    };
  });

  /* ============================================ 2. INPUT GUARDRAILS ====== */

  const inputDetection = stage("INPUT_GUARDRAIL", "Input Screened", () => {
    const { detections: found } = runDetectors({
      raw: context.input,
      normalization: inputNormalization,
      channel: "USER_INPUT",
      context: {
        systemPrompt: context.application.systemPrompt,
        principalRole: context.principal.role,
      },
    });
    detections.push(...found);

    const sensitive = scanSensitive(context.input, "USER_INPUT");
    sensitiveFindings.push(...sensitive);

    return {
      summary: found.length
        ? `${found.length} threat indicator(s) found in the user's prompt; strongest at ${(Math.max(...found.map((d) => d.confidence)) * 100).toFixed(0)}% confidence.`
        : `No threat indicators in the user's prompt.${sensitive.length ? ` ${sensitive.length} sensitive value type(s) present.` : ""}`,
      details: {
        detections: found.length,
        sensitiveTypes: sensitive.map((s) => s.type),
        layers: [...new Set(found.map((d) => d.layer))],
      },
      result: found,
    };
  });
  void inputDetection;

  /* ============================================== 3. RAG RETRIEVAL ====== */

  const retrievals = context.retrievals ?? [];
  let minDocumentTrust: number | undefined;
  let maxRetrievedClassification: Classification | undefined;

  if (retrievals.length > 0) {
    stage("RAG_RETRIEVAL", "Documents Retrieved", () => {
      minDocumentTrust = Math.min(...retrievals.map((r) => r.trustScore));
      maxRetrievedClassification = retrievals.reduce<Classification>(
        (max, r) =>
          CLASSIFICATION_RANK[r.classification] > CLASSIFICATION_RANK[max] ? r.classification : max,
        "PUBLIC",
      );
      return {
        summary: `${retrievals.length} document(s) retrieved from ${new Set(retrievals.map((r) => r.sourceName)).size} source(s). Lowest trust ${minDocumentTrust}/100, highest classification ${maxRetrievedClassification.toLowerCase()}.`,
        details: {
          documents: retrievals.map((r) => ({
            title: r.title,
            source: r.sourceName,
            trust: r.trustScore,
            classification: r.classification,
            similarity: Number(r.similarity.toFixed(3)),
            external: r.sourceIsExternal,
          })),
        },
        result: null,
      };
    });

    /* ========================================== 4. DOCUMENT SCAN ====== */

    stage("DOCUMENT_SCAN", "Retrieved Content Analysed", () => {
      let flagged = 0;

      for (const chunk of retrievals) {
        // Access control precedes content analysis: material the requester is
        // not cleared for is withheld regardless of how clean it is.
        if (CLASSIFICATION_RANK[chunk.classification] > CLASSIFICATION_RANK[context.principal.clearance]) {
          withheldRetrievals.push({
            documentId: chunk.documentId,
            title: chunk.title,
            reason: `Classified ${chunk.classification.toLowerCase()}; ${context.principal.name} holds ${context.principal.clearance.toLowerCase()} clearance.`,
          });
          detections.push({
            detectorId: "authorization.document-clearance",
            layer: "AUTHORIZATION",
            threatType: "UNAUTHORIZED_DOCUMENT_ACCESS",
            channel: "RAG_CONTEXT",
            confidence: 1,
            score: 80,
            severity: "HIGH",
            explanation: `Retrieval returned "${chunk.title}", classified ${chunk.classification.toLowerCase()}, to a principal cleared only to ${context.principal.clearance.toLowerCase()}. The document was withheld before it reached the model.`,
            evidence: {
              documentTitle: chunk.title,
              classification: chunk.classification,
              principalClearance: context.principal.clearance,
            },
            sourceDocumentId: chunk.documentId,
          });
          flagged++;
          continue;
        }

        if (chunk.quarantined || chunk.scanStatus === "MALICIOUS") {
          withheldRetrievals.push({
            documentId: chunk.documentId,
            title: chunk.title,
            reason: chunk.quarantined
              ? "Document is quarantined and is withheld from all retrieval."
              : "Document is flagged malicious by the RAG scanner.",
          });
          detections.push({
            detectorId: "rag.quarantine-enforcement",
            layer: "AUTHORIZATION",
            threatType: "RAG_POISONING",
            channel: "RAG_CONTEXT",
            confidence: 1,
            score: 95,
            severity: "CRITICAL",
            explanation: `"${chunk.title}" is quarantined. Retrieval was blocked at the boundary, so the content never entered the model context.`,
            evidence: { documentTitle: chunk.title, scanStatus: chunk.scanStatus },
            sourceDocumentId: chunk.documentId,
          });
          flagged++;
          continue;
        }

        if (chunk.trustScore < MIN_RETRIEVAL_TRUST) {
          withheldRetrievals.push({
            documentId: chunk.documentId,
            title: chunk.title,
            reason: `Trust score ${chunk.trustScore}/100 is below the minimum of ${MIN_RETRIEVAL_TRUST} for retrieval.`,
          });
          flagged++;
          continue;
        }

        // Content analysis. Retrieved text is scanned with the same layers as
        // user input, but findings here are indirect injection by construction:
        // the user never wrote this.
        const chunkNorm = normalize(chunk.content);
        const { detections: found } = runDetectors({
          raw: chunk.content,
          normalization: chunkNorm,
          channel: "RAG_CONTEXT",
          sourceDocumentId: chunk.documentId,
          sourceTrust: chunk.trustScore,
          context: { userIntent: context.input },
        });

        if (found.length > 0) {
          detections.push(...found);
          flagged++;
          const peak = Math.max(...found.map((d) => d.confidence));
          if (peak >= 0.45) {
            withheldRetrievals.push({
              documentId: chunk.documentId,
              title: chunk.title,
              reason: `Embedded instructions detected at ${(peak * 100).toFixed(0)}% confidence. Content withheld so it cannot influence the agent.`,
            });
          }
        }

        const chunkSensitive = scanSensitive(chunk.content, "RAG_CONTEXT");
        sensitiveFindings.push(...chunkSensitive);
      }

      return {
        summary: flagged
          ? `${flagged} of ${retrievals.length} retrieved document(s) raised findings. ${withheldRetrievals.length} withheld from the model context.`
          : `All ${retrievals.length} retrieved document(s) passed content analysis.`,
        details: {
          scanned: retrievals.length,
          flagged,
          withheld: withheldRetrievals.map((w) => ({ title: w.title, reason: w.reason })),
        },
        decision: withheldRetrievals.length ? "REDACT" : undefined,
        result: null,
      };
    });
  }

  /* ========================================== 5. THREAT DETECTION ====== */

  const fusion = stage("THREAT_DETECTION", "Detection Engine", () => {
    const fused = fuseDetections(detections);
    return {
      summary: fused.primary
        ? `${fused.threats.length} threat type(s) confirmed. Primary: ${fused.primary.threatType.replace(/_/g, " ").toLowerCase()} at ${(fused.maxConfidence * 100).toFixed(0)}% confidence from ${fused.primary.agreement} independent layer(s).`
        : "No threats confirmed by the detection engine.",
      details: {
        threats: fused.threats.map((t) => ({
          type: t.threatType,
          confidence: Number(t.confidence.toFixed(3)),
          severity: t.severity,
          layers: t.layers,
          agreement: t.agreement,
        })),
        totalDetections: detections.length,
      },
      severity: fused.severity,
      result: fused,
    };
  });

  /* ============================================ 6. AGENT BEHAVIOUR ====== */

  const proposedToolCalls = context.proposedToolCalls ?? [];
  const tools = context.tools ?? {};

  const intent =
    context.agent && proposedToolCalls.length > 0
      ? stage("AGENT_BEHAVIOR", "Agent Behaviour Compared to Intent", () => {
          const analysis = analyseAgentBehaviour({
            userRequest: context.input,
            agentPurpose: context.agent!.purpose,
            proposedToolCalls,
            tools,
            retrievals,
          });
          if (analysis.divergence >= 0.5) {
            detections.push({
              detectorId: "agent.intent-divergence",
              layer: "BEHAVIORAL",
              threatType: "AGENT_GOAL_DIVERGENCE",
              channel: "USER_INPUT",
              confidence: Math.min(0.95, analysis.divergence),
              score: Math.round(analysis.divergence * 100),
              severity: severityFromRisk(analysis.divergence * 100),
              explanation: analysis.explanation,
              evidence: {
                statedIntent: analysis.statedIntent,
                observedActions: analysis.observedActions,
                unrelatedActions: analysis.unrelatedActions,
                statistics: { divergence: Number(analysis.divergence.toFixed(3)) },
              },
            });
          }
          return {
            summary: analysis.explanation,
            details: {
              divergence: Number(analysis.divergence.toFixed(3)),
              observedActions: analysis.observedActions,
              unrelatedActions: analysis.unrelatedActions,
            },
            severity: analysis.divergence >= 0.5 ? "CRITICAL" : undefined,
            result: analysis,
          };
        })
      : undefined;

  // Behavioural baselines. Runs after the actions are known so tool volume can
  // be judged against this subject's own history.
  if (context.baselines || context.history) {
    const behavioural = behaviouralDetections({
      principalId: context.principal.id,
      agentId: context.agent?.id,
      history: context.history,
      baselines: context.baselines,
      observed: {
        toolCallCount: proposedToolCalls.length,
        promptLength: context.input.length,
        retrievalCount: retrievals.length,
        distinctToolsUsed: new Set(proposedToolCalls.map((c) => c.toolSlug)).size,
      },
      hourOfDay: context.timestamp.getHours(),
      maxToolCallsPerRequest: context.agent?.maxToolCallsPerRequest,
    });
    detections.push(...behavioural);
  }

  const behaviouralDeviation = detections
    .filter((d) => d.layer === "BEHAVIORAL" && d.detectorId.startsWith("behavioral."))
    .reduce((max, d) => Math.max(max, d.confidence), 0);

  /* ========================================= 7. TOOL AUTHORIZATION ====== */

  let toolDecisions: ToolDecision[] = [];
  let toolGatewayDecision: Decision = "ALLOW";
  let maxToolRiskTier = 0;
  let deniedToolCalls = 0;

  if (context.agent && proposedToolCalls.length > 0) {
    stage("TOOL_AUTHORIZATION", "Tool Requests Authorised", () => {
      const gateway = authorizeToolCalls({
        agent: context.agent!,
        tools,
        calls: proposedToolCalls,
        callsInWindow: context.history?.toolCallsInWindow,
        userIntent: context.input,
      });

      toolDecisions = gateway.decisions;
      toolGatewayDecision = gateway.decision;
      maxToolRiskTier = gateway.maxRiskTier;
      deniedToolCalls = gateway.deniedCount;

      for (const denied of gateway.decisions.filter((d) => d.decision === "BLOCK")) {
        for (const threat of denied.threatTypes) {
          detections.push({
            detectorId: "authorization.tool-gateway",
            layer: "AUTHORIZATION",
            threatType: threat,
            channel: "TOOL_ARGUMENTS",
            confidence: 1,
            score: denied.riskScore,
            severity: denied.riskScore >= 70 ? "CRITICAL" : "HIGH",
            explanation: `Tool gateway refused ${denied.toolName} (${denied.operation}): ${denied.reason}`,
            evidence: {
              tool: denied.toolName,
              operation: denied.operation,
              failedChecks: denied.checks.filter((c) => !c.passed).map((c) => ({
                check: c.check,
                label: c.label,
                detail: c.detail,
              })),
            },
          });
        }
      }

      return {
        summary: `${gateway.decisions.length} tool request(s) evaluated: ${gateway.deniedCount} blocked, ${gateway.approvalCount} held for approval, ${gateway.decisions.filter((d) => d.decision === "ALLOW").length} permitted.`,
        details: {
          calls: gateway.decisions.map((d) => ({
            tool: d.toolName,
            operation: d.operation,
            decision: d.decision,
            riskScore: d.riskScore,
            reason: d.reason,
            failedChecks: d.checks.filter((c) => !c.passed).length,
          })),
          capExceeded: gateway.capExceeded,
        },
        decision: gateway.decision,
        result: null,
      };
    });
  }

  /* ================================================ 8. RISK SCORING ====== */

  // Re-fuse: the behaviour, authorisation and gateway stages contributed new
  // detections after the first fusion pass.
  const finalFusion = fuseDetections(detections);

  const risk = stage("RISK_SCORING", "Risk Scored", () => {
    const assessment = assessRisk({
      context,
      fusion: finalFusion,
      sensitiveFindings,
      intent,
      maxToolRiskTier: maxToolRiskTier || undefined,
      toolCallCount: proposedToolCalls.length || undefined,
      deniedToolCalls: deniedToolCalls || undefined,
      minDocumentTrust,
      maxRetrievedClassification,
      behaviouralDeviation: behaviouralDeviation || undefined,
      obfuscation: inputNormalization.obfuscationScore,
    });
    return {
      summary: assessment.rationale,
      details: {
        score: assessment.score,
        confidence: Number(assessment.confidence.toFixed(2)),
        factors: assessment.factors.map((f) => ({
          label: f.label,
          contribution: f.contribution,
          direction: f.direction,
          detail: f.detail,
        })),
      },
      severity: assessment.severity,
      result: assessment,
    };
  });

  /* ============================================= 9. INPUT GUARDRAILS ==== */

  const inputGuardrails = evaluateGuardrails({
    guardrails: context.guardrails,
    direction: "INPUT",
    detections,
    sensitiveFindings,
    channels: ["USER_INPUT", "RAG_CONTEXT", "TOOL_ARGUMENTS", "TOOL_RESULT", "AGENT_MEMORY"],
  });

  /* =========================================== 10. POLICY EVALUATION ==== */

  const policyResult = stage("POLICY_EVALUATION", "Policies Evaluated", () => {
    const facts = buildFacts({
      context,
      fusion: finalFusion,
      risk,
      sensitiveFindings,
      intent,
      toolDecisions,
      retrievals,
      maxToolRiskTier,
      minDocumentTrust,
      maxRetrievedClassification,
      obfuscationScore: inputNormalization.obfuscationScore,
    });

    const result = evaluatePolicies(context.policies, facts);
    return {
      summary: result.matched.length
        ? `${result.matched.length} of ${context.policies.filter((p) => p.enabled).length} enabled policies matched. Most restrictive action: ${result.decision.replace(/_/g, " ").toLowerCase()}. Matched: ${result.matched.map((m) => m.policyName).join(", ")}.`
        : `No policy matched. All ${context.policies.filter((p) => p.enabled).length} enabled policies evaluated.`,
      details: {
        matched: result.matched.map((m) => ({
          key: m.policyKey,
          name: m.policyName,
          action: m.action,
          conditions: m.matchedConditions,
        })),
        facts,
      },
      decision: result.decision,
      result,
    };
  });

  /* ================================================== 11. DECISION ====== */

  const decision = mostRestrictive(
    inputGuardrails.decision,
    policyResult.decision,
    toolGatewayDecision,
    // Withheld retrievals are a redaction of the model's context even when no
    // other control fired.
    withheldRetrievals.length > 0 ? "REDACT" : "ALLOW",
  );

  const blocked = decision === "BLOCK";

  /* ========================================= 12. OUTPUT GUARDRAILS ====== */

  let redactedOutput: string | undefined;
  let outputRedacted = false;
  let outputDecision: Decision = "ALLOW";

  if (context.output && !blocked) {
    stage("OUTPUT_GUARDRAIL", "Response Screened", () => {
      const outputNorm = normalize(context.output!);
      const { detections: outputDetections } = runDetectors({
        raw: context.output!,
        normalization: outputNorm,
        channel: "MODEL_OUTPUT",
        context: { systemPrompt: context.application.systemPrompt },
      });
      detections.push(...outputDetections);

      const outputSensitive = scanSensitive(context.output!, "MODEL_OUTPUT");
      sensitiveFindings.push(...outputSensitive);

      const outputGuardrails = evaluateGuardrails({
        guardrails: context.guardrails,
        direction: "OUTPUT",
        detections: [...outputDetections, ...detections.filter((d) => d.channel === "MODEL_OUTPUT")],
        sensitiveFindings: outputSensitive,
        channels: ["MODEL_OUTPUT"],
        text: context.output,
        systemPrompt: context.agent?.systemPrompt || context.application.systemPrompt,
      });

      outputDecision = outputGuardrails.decision;

      if (outputGuardrails.redactTypes.length > 0) {
        const applied = applyRedaction(context.output!, outputGuardrails.redactTypes);
        if (applied.redacted) {
          redactedOutput = applied.text;
          outputRedacted = true;
        }
      }

      return {
        summary: outputGuardrails.triggered.length
          ? `${outputGuardrails.triggered.length} output control(s) triggered: ${outputGuardrails.triggered.map((t) => t.name).join(", ")}.${outputRedacted ? " Response was redacted before delivery." : ""}`
          : "Response passed all output controls.",
        details: {
          triggered: outputGuardrails.triggered.map((t) => ({
            name: t.name,
            action: t.action,
            explanation: t.explanation,
          })),
          sensitiveInOutput: outputSensitive.map((s) => `${s.count}× ${s.type}`),
          redacted: outputRedacted,
        },
        decision: outputGuardrails.decision,
        result: null,
      };
    });
  }

  const finalDecision = mostRestrictive(decision, outputDecision);
  const finalBlocked = finalDecision === "BLOCK";
  const finalRedacted = outputRedacted || finalDecision === "REDACT";

  /* ================================================== 13. RESPONSE ====== */

  stage("RESPONSE", finalBlocked ? "Request Blocked" : "Response Delivered", () => ({
    summary: finalBlocked
      ? `Request blocked. Nothing reached the model, the tools or the user.`
      : finalRedacted
        ? `Response delivered with redaction applied.`
        : `Response delivered normally.`,
    decision: finalDecision,
    result: null,
  }));

  // Mark where the attack was actually stopped, for the attack-chain view.
  if (finalBlocked || finalRedacted) {
    const intervention = [...stageTrace]
      .reverse()
      .find((s) => s.decision && s.decision !== "ALLOW" && s.stage !== "RESPONSE");
    if (intervention) intervention.interventionPoint = true;
  }

  /* ==================================================== assemble ======== */

  const threatTypes: ThreatType[] = finalFusion.threatTypes;
  const severity = finalBlocked
    ? finalFusion.severity === "INFO"
      ? severityFromRisk(risk.score)
      : finalFusion.severity
    : severityFromRisk(risk.score);

  return {
    requestId: context.requestId,
    decision: finalDecision,
    riskScore: risk.score,
    severity,
    threatTypes,
    detections,
    sensitiveFindings,
    risk,
    policies: policyResult.evaluations,
    guardrails: inputGuardrails.evaluations,
    toolDecisions,
    intent,
    withheldRetrievals,
    redactedOutput,
    blocked: finalBlocked,
    redacted: finalRedacted,
    stageTrace,
    summary: buildSummary({
      decision: finalDecision,
      fusion: finalFusion,
      risk: risk.score,
      withheld: withheldRetrievals.length,
      deniedTools: deniedToolCalls,
      redacted: finalRedacted,
    }),
    latencyMs: Date.now() - pipelineStart,
  };
}

function buildSummary(p: {
  decision: Decision;
  fusion: ReturnType<typeof fuseDetections>;
  risk: number;
  withheld: number;
  deniedTools: number;
  redacted: boolean;
}): string {
  const parts: string[] = [];

  if (p.fusion.primary) {
    parts.push(
      `${p.fusion.primary.threatType.replace(/_/g, " ").toLowerCase()} detected at ${(p.fusion.maxConfidence * 100).toFixed(0)}% confidence`,
    );
  }

  switch (p.decision) {
    case "BLOCK":
      parts.push(`request blocked (risk ${p.risk}/100)`);
      break;
    case "REQUIRE_APPROVAL":
      parts.push(`held for human approval (risk ${p.risk}/100)`);
      break;
    case "REDACT":
      parts.push(`allowed with redaction (risk ${p.risk}/100)`);
      break;
    case "WARN":
      parts.push(`allowed with a warning (risk ${p.risk}/100)`);
      break;
    default:
      parts.push(`allowed (risk ${p.risk}/100)`);
  }

  if (p.withheld > 0) parts.push(`${p.withheld} document(s) withheld`);
  if (p.deniedTools > 0) parts.push(`${p.deniedTools} tool call(s) refused`);

  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
