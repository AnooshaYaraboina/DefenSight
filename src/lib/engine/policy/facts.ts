/**
 * Fact extraction for the policy engine.
 *
 * Flattens everything the pipeline has learned about a request into the flat
 * bag of named facts that policy conditions are written against. This is the
 * contract between the engine and the policies an administrator authors: the
 * facts below are the complete vocabulary available in the policy editor.
 *
 * Keeping extraction in one place means a new policy fact is added once, here,
 * and immediately becomes available to every policy — no per-policy plumbing.
 */
import { CLASSIFICATION_RANK, type Classification } from "../taxonomy";
import type {
  AnalysisContext,
  IntentAnalysis,
  RetrievedChunk,
  RiskAssessment,
  SensitiveFinding,
  ToolDecision,
} from "../types";
import type { FusionResult } from "../detectors/fusion";
import type { FactBag } from "./engine";

export interface FactInput {
  context: AnalysisContext;
  fusion: FusionResult;
  risk: RiskAssessment;
  sensitiveFindings: SensitiveFinding[];
  intent?: IntentAnalysis;
  toolDecisions: ToolDecision[];
  retrievals: RetrievedChunk[];
  maxToolRiskTier: number;
  minDocumentTrust?: number;
  maxRetrievedClassification?: Classification;
  /** Obfuscation strength found during normalisation, 0-1. */
  obfuscationScore: number;
}

/** Documented fact catalogue, surfaced in the policy editor UI. */
export const FACT_CATALOGUE: Array<{
  fact: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
}> = [
  { fact: "riskScore", type: "number", description: "Composite risk score for the request, 0-100." },
  { fact: "severity", type: "string", description: "Severity derived from the risk score." },
  { fact: "threatTypes", type: "array", description: "All threat types confirmed by the detection engine." },
  { fact: "maxConfidence", type: "number", description: "Highest fused detection confidence, 0-1." },
  { fact: "detectionLayers", type: "array", description: "Detection layers that produced findings." },
  { fact: "layerAgreement", type: "number", description: "Number of independent layers agreeing on the primary threat." },
  { fact: "sensitiveCategories", type: "array", description: "Categories of sensitive data found (PII, CREDENTIAL, …)." },
  { fact: "sensitiveTypes", type: "array", description: "Specific sensitive data types found." },
  { fact: "sensitiveChannels", type: "array", description: "Channels in which sensitive data was found." },
  { fact: "sensitiveCount", type: "number", description: "Total number of sensitive values found." },
  { fact: "toolCallsInRequest", type: "number", description: "Number of tool calls proposed in this request." },
  { fact: "toolSlugs", type: "array", description: "Slugs of the tools requested." },
  { fact: "toolCategory", type: "array", description: "Categories of the tools requested." },
  { fact: "toolOperation", type: "array", description: "Operations requested across all tool calls." },
  { fact: "toolRiskTier", type: "number", description: "Highest risk tier among requested tools, 1-5." },
  { fact: "deniedToolCalls", type: "number", description: "Tool calls the gateway refused." },
  { fact: "egressDomainAllowed", type: "boolean", description: "False when any outbound destination is off its tool's allowlist." },
  { fact: "intentDivergence", type: "number", description: "How far agent actions diverge from the user's intent, 0-1." },
  { fact: "retrievalCount", type: "number", description: "Documents returned by retrieval." },
  { fact: "documentTrustScore", type: "number", description: "Lowest trust score among retrieved documents." },
  { fact: "documentScanStatus", type: "array", description: "Scan statuses of retrieved documents." },
  { fact: "retrievalClassificationExceedsClearance", type: "boolean", description: "True when retrieval returned content above the user's clearance." },
  { fact: "maxRetrievedClassification", type: "string", description: "Highest classification among retrieved documents." },
  { fact: "userRiskScore", type: "number", description: "Standing behavioural risk of the requesting principal, 0-100." },
  { fact: "userRole", type: "string", description: "Role of the requesting principal." },
  { fact: "userClearance", type: "string", description: "Clearance of the requesting principal." },
  { fact: "agentRiskLevel", type: "string", description: "Configured risk level of the acting agent." },
  { fact: "agentSecurityScore", type: "number", description: "Security posture score of the acting agent, 0-100." },
  { fact: "obfuscationScore", type: "number", description: "Strength of detected content obfuscation, 0-1." },
  { fact: "applicationSlug", type: "string", description: "Slug of the AI application handling the request." },
  { fact: "simulated", type: "boolean", description: "True when the request came from the attack simulator." },
];

export function buildFacts(input: FactInput): FactBag {
  const {
    context,
    fusion,
    risk,
    sensitiveFindings,
    intent,
    toolDecisions,
    retrievals,
  } = input;

  const egressAllowed = !toolDecisions.some((d) =>
    d.checks.some((c) => c.check === "egress-allowlist" && !c.passed),
  );

  const requestedTools = (context.proposedToolCalls ?? []).map((c) => c.toolSlug);
  const toolCategories = [
    ...new Set(
      requestedTools
        .map((slug) => context.tools?.[slug]?.category)
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  const clearanceExceeded = input.maxRetrievedClassification
    ? CLASSIFICATION_RANK[input.maxRetrievedClassification] >
      CLASSIFICATION_RANK[context.principal.clearance]
    : false;

  return {
    // Risk & threats
    riskScore: risk.score,
    severity: risk.severity,
    threatTypes: fusion.threatTypes,
    maxConfidence: fusion.maxConfidence,
    detectionLayers: [...new Set(fusion.threats.flatMap((t) => t.layers))],
    layerAgreement: fusion.primary?.agreement ?? 0,

    // Sensitive data
    sensitiveCategories: [...new Set(sensitiveFindings.map((f) => f.category))],
    sensitiveTypes: [...new Set(sensitiveFindings.map((f) => f.type))],
    sensitiveChannels: [...new Set(sensitiveFindings.map((f) => f.channel))],
    sensitiveCount: sensitiveFindings.reduce((s, f) => s + f.count, 0),

    // Tools
    toolCallsInRequest: context.proposedToolCalls?.length ?? 0,
    toolSlugs: requestedTools,
    toolCategory: toolCategories,
    toolOperation: [...new Set((context.proposedToolCalls ?? []).map((c) => c.operation))],
    toolRiskTier: input.maxToolRiskTier,
    deniedToolCalls: toolDecisions.filter((d) => d.decision === "BLOCK").length,
    egressDomainAllowed: egressAllowed,

    // Agent behaviour
    intentDivergence: intent?.divergence ?? 0,

    // Retrieval
    retrievalCount: retrievals.length,
    documentTrustScore: input.minDocumentTrust ?? 100,
    documentScanStatus: [...new Set(retrievals.map((r) => r.scanStatus))],
    retrievalClassificationExceedsClearance: clearanceExceeded,
    maxRetrievedClassification: input.maxRetrievedClassification ?? "PUBLIC",

    // Principal
    userRiskScore: context.principal.riskScore,
    userRole: context.principal.role,
    userClearance: context.principal.clearance,

    // Agent & application
    agentRiskLevel: context.agent?.riskLevel ?? "LOW",
    agentSecurityScore: context.agent?.securityScore ?? 100,
    applicationSlug: context.application.slug,

    // Content
    obfuscationScore: input.obfuscationScore,

    simulated: Boolean(context.simulated),

    // Nested objects, so policies can reference e.g. agent.maxToolCallsPerRequest
    agent: context.agent
      ? {
          maxToolCallsPerRequest: context.agent.maxToolCallsPerRequest,
          riskLevel: context.agent.riskLevel,
          securityScore: context.agent.securityScore,
          dataClearance: context.agent.dataClearance,
        }
      : undefined,
    principal: {
      role: context.principal.role,
      clearance: context.principal.clearance,
      riskScore: context.principal.riskScore,
    },
  };
}
