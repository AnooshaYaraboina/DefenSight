/**
 * Engine contracts.
 *
 * The engine is deliberately pure: no database, no framework, no I/O. It takes
 * a fully-materialised `AnalysisContext` and returns an `AnalysisResult`. The
 * persistence layer assembles the context and writes the result away.
 *
 * That separation is what makes the security logic testable in isolation — the
 * attack test-case matrix runs the real engine, not a mock of it — and it means
 * the same code path serves live traffic, the attack simulator and the
 * historical replay used to build the demo dataset.
 */
import type {
  Channel,
  Classification,
  Decision,
  PipelineStage,
  Role,
  Severity,
  ThreatType,
} from "./taxonomy";

/* ========================================================================== *
 * Inputs
 * ========================================================================== */

export interface PrincipalContext {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Highest classification this person may be shown. */
  clearance: Classification;
  department: string;
  /** Rolling behavioural risk, 0-100. */
  riskScore: number;
}

export interface ApplicationContext {
  id: string;
  name: string;
  slug: string;
  systemPrompt: string;
  securityScore: number;
}

export interface AgentContext {
  id: string;
  name: string;
  slug: string;
  purpose: string;
  systemPrompt: string;
  maxToolCallsPerRequest: number;
  dataClearance: Classification;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  securityScore: number;
  /** Tools the agent is granted, keyed by tool slug. */
  grants: Record<string, ToolGrantContext>;
}

export interface ToolGrantContext {
  toolSlug: string;
  operations: string[];
  denied: boolean;
  maxCallsPerRequest: number;
}

export interface ModelContext {
  name: string;
  provider: string;
  sensitivityTier: number;
}

/** One chunk returned by retrieval, with everything needed to judge its trust. */
export interface RetrievedChunk {
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  classification: Classification;
  /** 0-100 composite trust for the document. */
  trustScore: number;
  /** 0-100 trust of the originating source. */
  sourceTrust: number;
  sourceName: string;
  sourceIsExternal: boolean;
  quarantined: boolean;
  scanStatus: "PENDING" | "SCANNING" | "CLEAN" | "SUSPICIOUS" | "MALICIOUS" | "FAILED";
}

/** A tool invocation the agent proposes, before the gateway has ruled on it. */
export interface ProposedToolCall {
  toolSlug: string;
  operation: "READ" | "WRITE" | "DELETE" | "EXECUTE";
  arguments: Record<string, unknown>;
  /** Sequence within the request, used for rate and cap checks. */
  index: number;
}

export interface ToolDefinitionContext {
  slug: string;
  name: string;
  category: string;
  operations: string[];
  riskTier: number;
  requiresApproval: boolean;
  approvalThreshold: number;
  rateLimitPerMinute: number;
  parameterSchema?: Record<string, unknown> | null;
  allowedDomains?: string[] | null;
  enabled: boolean;
}

/** Recent activity for the behavioural layer. */
export interface HistoryContext {
  /** Requests by this principal in the trailing window. */
  recentRequests: number;
  recentBlocked: number;
  recentThreats: number;
  /** Distinct applications touched in the window — breadth is a probing signal. */
  distinctApplications: number;
  /** Calls this agent has made in the current rate window. */
  toolCallsInWindow: Record<string, number>;
}

/** Rolling statistics keyed by metric name. */
export interface BaselineContext {
  [metric: string]: { mean: number; stddev: number; sampleCount: number };
}

export interface GuardrailConfig {
  key: string;
  name: string;
  direction: "INPUT" | "OUTPUT";
  controlType: string;
  enabled: boolean;
  threshold: number;
  action: Decision;
  config: Record<string, unknown>;
}

export interface PolicyConfig {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  priority: number;
  condition: unknown;
  action: Decision;
  severity: Severity;
  requiresApproval: boolean;
}

export interface AnalysisContext {
  requestId: string;
  timestamp: Date;

  principal: PrincipalContext;
  application: ApplicationContext;
  agent?: AgentContext;
  model?: ModelContext;

  /** The user's request. The intent baseline for divergence analysis. */
  input: string;
  /** Content retrieved through RAG, if any. */
  retrievals?: RetrievedChunk[];
  /** Tool calls the agent proposes to make. */
  proposedToolCalls?: ProposedToolCall[];
  /** Tool definitions, keyed by slug. */
  tools?: Record<string, ToolDefinitionContext>;
  /** The model's draft response, when the output stage is being evaluated. */
  output?: string;

  history?: HistoryContext;
  baselines?: BaselineContext;

  guardrails: GuardrailConfig[];
  policies: PolicyConfig[];

  /** Set when the request originates from the attack simulator. */
  simulated?: boolean;
  scenarioKey?: string;
}

/* ========================================================================== *
 * Detection output
 * ========================================================================== */

export type DetectionLayer =
  | "NORMALIZATION"
  | "LEXICAL"
  | "STRUCTURAL"
  | "SEMANTIC"
  | "BEHAVIORAL"
  | "AUTHORIZATION"
  | "LLM_ADJUDICATION";

/** A character range in the analysed text that justifies a detection. */
export interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
  label: string;
}

export interface DetectionEvidence {
  spans?: EvidenceSpan[];
  /** What the normalisation layer uncovered, when relevant. */
  decoded?: { encoding: string; preview: string; depth: number };
  /** Nearest neighbours from the attack corpus, for the semantic layer. */
  neighbours?: Array<{ technique: string; similarity: number; sample: string }>;
  /** Statistical context for the behavioural layer. */
  statistics?: Record<string, number>;
  /** Free-form detector-specific data. */
  [key: string]: unknown;
}

export interface DetectionResult {
  detectorId: string;
  layer: DetectionLayer;
  threatType: ThreatType;
  channel: Channel;
  /** 0-1. How sure this detector is that the threat is real. */
  confidence: number;
  /** 0-100 contribution this detection makes to the request's risk. */
  score: number;
  severity: Severity;
  /** Analyst-readable sentence explaining what fired and why. */
  explanation: string;
  evidence: DetectionEvidence;
  /** Which document produced this, for indirect-injection findings. */
  sourceDocumentId?: string;
}

/* ========================================================================== *
 * Sensitive data
 * ========================================================================== */

export interface SensitiveFinding {
  type: string;
  category: string;
  channel: Channel;
  count: number;
  /** Masked example. The raw value never leaves the scanner. */
  maskedSample: string;
  confidence: number;
  spans: EvidenceSpan[];
}

/* ========================================================================== *
 * Risk
 * ========================================================================== */

export interface RiskFactor {
  key: string;
  label: string;
  /** What this factor measured, in analyst language. */
  detail: string;
  /** 0-1 normalised signal strength. */
  value: number;
  /** Relative importance of this factor in the model. */
  weight: number;
  /** Points this factor contributed to the final 0-100 score. */
  contribution: number;
  direction: "increases" | "decreases";
}

export interface RiskAssessment {
  score: number;
  severity: Severity;
  factors: RiskFactor[];
  /** The factors that dominated, in order, for the one-line explanation. */
  topDrivers: string[];
  /** Plain-language rationale assembled from the factor set. */
  rationale: string;
  /** Confidence in the score itself, driven by signal agreement. */
  confidence: number;
}

/* ========================================================================== *
 * Policy & guardrails
 * ========================================================================== */

export interface PolicyEvaluation {
  policyId: string;
  policyKey: string;
  policyName: string;
  matched: boolean;
  action: Decision;
  severity: Severity;
  /** Which conditions matched, for the audit trail. */
  matchedConditions: string[];
  explanation: string;
}

export interface GuardrailEvaluation {
  key: string;
  name: string;
  direction: "INPUT" | "OUTPUT";
  controlType: string;
  triggered: boolean;
  action: Decision;
  confidence: number;
  explanation: string;
  detectionIds: string[];
}

/* ========================================================================== *
 * Tool authorisation
 * ========================================================================== */

export interface ToolCheck {
  check: string;
  label: string;
  passed: boolean;
  detail: string;
  /** Severity if this check fails. */
  severity: Severity;
}

export interface ToolDecision {
  toolSlug: string;
  toolName: string;
  operation: string;
  arguments: Record<string, unknown>;
  decision: Decision;
  riskScore: number;
  checks: ToolCheck[];
  reason: string;
  threatTypes: ThreatType[];
}

/* ========================================================================== *
 * Agent behaviour
 * ========================================================================== */

export interface IntentAnalysis {
  /** 0-1. How far the agent's actions drift from the user's stated intent. */
  divergence: number;
  statedIntent: string;
  observedActions: string[];
  /** Actions with no plausible connection to the request. */
  unrelatedActions: string[];
  explanation: string;
}

/* ========================================================================== *
 * Pipeline trace  (§18 attack chain)
 * ========================================================================== */

export interface StageTrace {
  stage: PipelineStage;
  label: string;
  /** Outcome of this stage in analyst language. */
  summary: string;
  decision?: Decision;
  severity?: Severity;
  durationMs: number;
  /** Stage-specific evidence surfaced in the attack-chain view. */
  details?: Record<string, unknown>;
  /** True when this stage is where the attack was stopped. */
  interventionPoint?: boolean;
}

/* ========================================================================== *
 * Result
 * ========================================================================== */

export interface AnalysisResult {
  requestId: string;
  decision: Decision;
  riskScore: number;
  severity: Severity;
  threatTypes: ThreatType[];

  detections: DetectionResult[];
  sensitiveFindings: SensitiveFinding[];
  risk: RiskAssessment;
  policies: PolicyEvaluation[];
  guardrails: GuardrailEvaluation[];
  toolDecisions: ToolDecision[];
  intent?: IntentAnalysis;

  /** Retrieved chunks that were withheld, with the reason. */
  withheldRetrievals: Array<{ documentId: string; title: string; reason: string }>;

  /** Output after redaction, when output guardrails changed it. */
  redactedOutput?: string;
  blocked: boolean;
  redacted: boolean;

  stageTrace: StageTrace[];
  /** Analyst-facing one-liner: what happened and why. */
  summary: string;
  latencyMs: number;
}
