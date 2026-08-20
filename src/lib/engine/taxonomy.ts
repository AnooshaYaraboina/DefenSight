/**
 * DefenSight security taxonomy.
 *
 * Single source of truth for every classification the platform uses. The
 * detection engine, policy engine, database and UI all import from here so a
 * threat type can never drift between the layer that detects it and the layer
 * that renders it.
 */

/* ========================================================================== *
 * Severity
 * ========================================================================== */

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Ordering used for sorting and "at least this severe" comparisons. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export const SEVERITY_META: Record<
  Severity,
  { label: string; token: string; description: string }
> = {
  CRITICAL: {
    label: "Critical",
    token: "critical",
    description: "Active compromise or confirmed high-impact attack. Immediate response required.",
  },
  HIGH: {
    label: "High",
    token: "high",
    description: "Strong evidence of an attack or exposure of sensitive data.",
  },
  MEDIUM: {
    label: "Medium",
    token: "medium",
    description: "Suspicious activity that warrants analyst review.",
  },
  LOW: {
    label: "Low",
    token: "low",
    description: "Weak signal or policy deviation with limited impact.",
  },
  INFO: {
    label: "Info",
    token: "info",
    description: "Recorded for audit and correlation. No action needed.",
  },
};

/** Map a 0-100 risk score onto the severity scale. */
export function severityFromRisk(risk: number): Severity {
  if (risk >= 85) return "CRITICAL";
  if (risk >= 65) return "HIGH";
  if (risk >= 40) return "MEDIUM";
  if (risk >= 15) return "LOW";
  return "INFO";
}

export function isAtLeast(a: Severity, b: Severity): boolean {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b];
}

/* ========================================================================== *
 * Security decisions  (assessment §15: Allow / Warn / Redact / Block)
 * ========================================================================== */

export const DECISIONS = [
  "ALLOW",
  "WARN",
  "REDACT",
  "REQUIRE_APPROVAL",
  "BLOCK",
] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * Decisions are ordered by restrictiveness. When several controls fire on one
 * request the pipeline keeps the most restrictive outcome — never the last one
 * evaluated. This is what makes the pipeline order-independent and therefore
 * reproducible.
 */
export const DECISION_RANK: Record<Decision, number> = {
  ALLOW: 0,
  WARN: 1,
  REDACT: 2,
  REQUIRE_APPROVAL: 3,
  BLOCK: 4,
};

export function mostRestrictive(...decisions: Decision[]): Decision {
  return decisions.reduce<Decision>(
    (worst, d) => (DECISION_RANK[d] > DECISION_RANK[worst] ? d : worst),
    "ALLOW",
  );
}

export const DECISION_META: Record<
  Decision,
  { label: string; token: string; description: string }
> = {
  ALLOW: {
    label: "Allowed",
    token: "allow",
    description: "Request passed all controls and proceeded normally.",
  },
  WARN: {
    label: "Warned",
    token: "warn",
    description: "Request proceeded, but was flagged for review and logged as an event.",
  },
  REDACT: {
    label: "Redacted",
    token: "redact",
    description: "Sensitive content was masked before the request or response continued.",
  },
  REQUIRE_APPROVAL: {
    label: "Awaiting Approval",
    token: "approval",
    description: "Held pending human authorisation before the action may execute.",
  },
  BLOCK: {
    label: "Blocked",
    token: "block",
    description: "Request was stopped. Nothing reached the model, tool or user.",
  },
};

/* ========================================================================== *
 * Threat catalogue
 * ========================================================================== */

export const THREAT_TYPES = [
  "PROMPT_INJECTION",
  "INDIRECT_PROMPT_INJECTION",
  "JAILBREAK",
  "INSTRUCTION_OVERRIDE",
  "ROLE_MANIPULATION",
  "SYSTEM_PROMPT_EXTRACTION",
  "ENCODED_PAYLOAD",
  "RAG_POISONING",
  "MALICIOUS_DOCUMENT",
  "UNAUTHORIZED_DOCUMENT_ACCESS",
  "DATA_LEAKAGE",
  "DATA_EXFILTRATION",
  "SENSITIVE_DATA_EXPOSURE",
  "SECRET_EXPOSURE",
  "TOOL_ABUSE",
  "UNAUTHORIZED_TOOL_CALL",
  "EXCESSIVE_PERMISSIONS",
  "ABNORMAL_TOOL_USAGE",
  "AGENT_ANOMALY",
  "AGENT_GOAL_DIVERGENCE",
  "UNAUTHORIZED_ACCESS",
  "SUSPICIOUS_USER_BEHAVIOR",
  "UNSAFE_OUTPUT",
] as const;
export type ThreatType = (typeof THREAT_TYPES)[number];

/**
 * Threat families group the catalogue for dashboards and analytics.
 * (assessment §17 names the nine top-level views the Threat Center must have)
 */
export const THREAT_FAMILIES = [
  "INJECTION",
  "RAG",
  "DATA",
  "TOOL",
  "AGENT",
  "ACCESS",
  "OUTPUT",
] as const;
export type ThreatFamily = (typeof THREAT_FAMILIES)[number];

export interface ThreatMeta {
  label: string;
  family: ThreatFamily;
  /** Analyst-facing explanation of what this threat actually is. */
  description: string;
  /** Baseline severity before per-event risk scoring adjusts it. */
  baseSeverity: Severity;
  /** MITRE ATLAS technique reference, where one applies. */
  atlas?: string;
  /** OWASP Top 10 for LLM Applications (2025) reference. */
  owasp?: string;
}

export const THREAT_META: Record<ThreatType, ThreatMeta> = {
  PROMPT_INJECTION: {
    label: "Prompt Injection",
    family: "INJECTION",
    description:
      "User-supplied text attempts to override the system prompt or redirect the model away from its intended task.",
    baseSeverity: "HIGH",
    atlas: "AML.T0051",
    owasp: "LLM01",
  },
  INDIRECT_PROMPT_INJECTION: {
    label: "Indirect Prompt Injection",
    family: "INJECTION",
    description:
      "Instructions embedded in retrieved content — a document, web page or tool result — attempt to control the model. The user never typed them.",
    baseSeverity: "CRITICAL",
    atlas: "AML.T0051.001",
    owasp: "LLM01",
  },
  JAILBREAK: {
    label: "Jailbreak",
    family: "INJECTION",
    description:
      "Attempt to bypass the model's safety alignment through persona framing, hypotheticals or staged scenarios.",
    baseSeverity: "HIGH",
    atlas: "AML.T0054",
    owasp: "LLM01",
  },
  INSTRUCTION_OVERRIDE: {
    label: "Instruction Override",
    family: "INJECTION",
    description:
      "Explicit attempt to void prior instructions — 'ignore everything above', 'disregard your rules'.",
    baseSeverity: "HIGH",
    owasp: "LLM01",
  },
  ROLE_MANIPULATION: {
    label: "Role Manipulation",
    family: "INJECTION",
    description:
      "Attempt to reassign the model's identity or privilege level, such as claiming developer or administrator authority.",
    baseSeverity: "HIGH",
    owasp: "LLM01",
  },
  SYSTEM_PROMPT_EXTRACTION: {
    label: "System Prompt Extraction",
    family: "INJECTION",
    description:
      "Attempt to make the model disclose its system prompt, configuration, guardrails or tool definitions.",
    baseSeverity: "HIGH",
    atlas: "AML.T0056",
    owasp: "LLM07",
  },
  ENCODED_PAYLOAD: {
    label: "Encoded Payload",
    family: "INJECTION",
    description:
      "Malicious instructions concealed with encoding or obfuscation — Base64, hex, ROT13, homoglyphs or zero-width characters.",
    baseSeverity: "HIGH",
    owasp: "LLM01",
  },
  RAG_POISONING: {
    label: "RAG Poisoning",
    family: "RAG",
    description:
      "Adversarial content planted in the knowledge base so that retrieval itself delivers the attack payload.",
    baseSeverity: "CRITICAL",
    atlas: "AML.T0020",
    owasp: "LLM08",
  },
  MALICIOUS_DOCUMENT: {
    label: "Malicious Document",
    family: "RAG",
    description:
      "An ingested document carries hidden instructions, concealed text or an exfiltration lure aimed at the model.",
    baseSeverity: "CRITICAL",
    owasp: "LLM08",
  },
  UNAUTHORIZED_DOCUMENT_ACCESS: {
    label: "Unauthorized Document Access",
    family: "RAG",
    description:
      "Retrieval returned material the requesting user's clearance does not permit.",
    baseSeverity: "HIGH",
    owasp: "LLM08",
  },
  DATA_LEAKAGE: {
    label: "Data Leakage",
    family: "DATA",
    description:
      "Sensitive information appeared in a model response or tool argument where it does not belong.",
    baseSeverity: "HIGH",
    owasp: "LLM02",
  },
  DATA_EXFILTRATION: {
    label: "Data Exfiltration",
    family: "DATA",
    description:
      "Deliberate attempt to move internal data outside the trust boundary — an external URL, webhook, email or outbound request.",
    baseSeverity: "CRITICAL",
    atlas: "AML.T0057",
    owasp: "LLM02",
  },
  SENSITIVE_DATA_EXPOSURE: {
    label: "Sensitive Data Exposure",
    family: "DATA",
    description:
      "PII, customer, employee or financial data was present in a monitored channel.",
    baseSeverity: "MEDIUM",
    owasp: "LLM02",
  },
  SECRET_EXPOSURE: {
    label: "Secret Exposure",
    family: "DATA",
    description:
      "Credentials, API keys, tokens or private keys were detected in a prompt, context or response.",
    baseSeverity: "CRITICAL",
    owasp: "LLM02",
  },
  TOOL_ABUSE: {
    label: "Tool Abuse",
    family: "TOOL",
    description:
      "A tool was invoked in a way that exceeds its intended use — destructive parameters, injected arguments or scope escalation.",
    baseSeverity: "HIGH",
    atlas: "AML.T0053",
    owasp: "LLM06",
  },
  UNAUTHORIZED_TOOL_CALL: {
    label: "Unauthorized Tool Call",
    family: "TOOL",
    description:
      "An agent requested a tool outside its allowlist or attempted an operation its permissions forbid.",
    baseSeverity: "CRITICAL",
    owasp: "LLM06",
  },
  EXCESSIVE_PERMISSIONS: {
    label: "Excessive Permissions",
    family: "TOOL",
    description:
      "An agent holds broader tool or data access than its function requires, widening the blast radius of any compromise.",
    baseSeverity: "MEDIUM",
    owasp: "LLM06",
  },
  ABNORMAL_TOOL_USAGE: {
    label: "Abnormal Tool Usage",
    family: "TOOL",
    description:
      "Tool invocation rate, sequence or volume deviates sharply from the agent's established baseline.",
    baseSeverity: "MEDIUM",
    owasp: "LLM06",
  },
  AGENT_ANOMALY: {
    label: "Agent Anomaly",
    family: "AGENT",
    description:
      "Agent behaviour deviates from its historical pattern in a way that suggests compromise or manipulation.",
    baseSeverity: "HIGH",
  },
  AGENT_GOAL_DIVERGENCE: {
    label: "Agent Goal Divergence",
    family: "AGENT",
    description:
      "The agent's actions no longer align with the user's original stated intent — the hallmark of a successful injection.",
    baseSeverity: "CRITICAL",
    owasp: "LLM06",
  },
  UNAUTHORIZED_ACCESS: {
    label: "Unauthorized Access",
    family: "ACCESS",
    description:
      "A principal attempted to reach an application, dataset or capability outside their authorisation.",
    baseSeverity: "HIGH",
  },
  SUSPICIOUS_USER_BEHAVIOR: {
    label: "Suspicious User Behavior",
    family: "ACCESS",
    description:
      "A user's activity pattern resembles reconnaissance or probing — repeated failures, escalating attempts, off-hours bursts.",
    baseSeverity: "MEDIUM",
  },
  UNSAFE_OUTPUT: {
    label: "Unsafe Output",
    family: "OUTPUT",
    description:
      "Model output contains harmful, non-compliant or otherwise unsafe content.",
    baseSeverity: "MEDIUM",
    owasp: "LLM05",
  },
};

export const THREAT_FAMILY_META: Record<
  ThreatFamily,
  { label: string; description: string }
> = {
  INJECTION: {
    label: "Injection & Jailbreak",
    description: "Attacks that manipulate model instructions.",
  },
  RAG: {
    label: "RAG & Knowledge Base",
    description: "Attacks delivered through retrieved content.",
  },
  DATA: {
    label: "Data Security",
    description: "Exposure and exfiltration of sensitive information.",
  },
  TOOL: {
    label: "Tool & Function Calling",
    description: "Abuse of the agent's action surface.",
  },
  AGENT: {
    label: "Agent Behaviour",
    description: "Agents acting outside their intended purpose.",
  },
  ACCESS: {
    label: "Access & Identity",
    description: "Authorisation failures and user-level abuse.",
  },
  OUTPUT: {
    label: "Output Safety",
    description: "Unsafe or non-compliant model responses.",
  },
};

export function threatsInFamily(family: ThreatFamily): ThreatType[] {
  return THREAT_TYPES.filter((t) => THREAT_META[t].family === family);
}

/* ========================================================================== *
 * Data classification & sensitivity
 * ========================================================================== */

export const CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_RANK: Record<Classification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

export const CLASSIFICATION_META: Record<
  Classification,
  { label: string; token: string; description: string }
> = {
  PUBLIC: {
    label: "Public",
    token: "info",
    description: "Approved for external disclosure.",
  },
  INTERNAL: {
    label: "Internal",
    token: "low",
    description: "Employees only. Not for external sharing.",
  },
  CONFIDENTIAL: {
    label: "Confidential",
    token: "high",
    description: "Restricted to named teams. Disclosure causes material harm.",
  },
  RESTRICTED: {
    label: "Restricted",
    token: "critical",
    description: "Highest sensitivity. Explicit per-person authorisation required.",
  },
};

/* ========================================================================== *
 * Sensitive data types  (assessment §15)
 * ========================================================================== */

export const SENSITIVE_CATEGORIES = [
  "PII",
  "CREDENTIAL",
  "FINANCIAL",
  "CUSTOMER",
  "EMPLOYEE",
  "BUSINESS",
  "TECHNICAL",
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

export const SENSITIVE_TYPES = [
  "EMAIL",
  "PHONE",
  "SSN",
  "NATIONAL_ID",
  "PASSPORT",
  "DATE_OF_BIRTH",
  "POSTAL_ADDRESS",
  "IP_ADDRESS",
  "PAYMENT_CARD",
  "IBAN",
  "BANK_ACCOUNT",
  "SALARY",
  "API_KEY",
  "PASSWORD",
  "PRIVATE_KEY",
  "JWT",
  "ACCESS_TOKEN",
  "CONNECTION_STRING",
  "CUSTOMER_RECORD",
  "EMPLOYEE_RECORD",
  "MEDICAL",
  "CONFIDENTIAL_BUSINESS",
  "SOURCE_CODE",
  "INTERNAL_ENDPOINT",
] as const;
export type SensitiveType = (typeof SENSITIVE_TYPES)[number];

/* ========================================================================== *
 * Pipeline stages  (assessment §18: the attack chain the analyst inspects)
 * ========================================================================== */

export const PIPELINE_STAGES = [
  "INGEST",
  "INPUT_GUARDRAIL",
  "RAG_RETRIEVAL",
  "DOCUMENT_SCAN",
  "THREAT_DETECTION",
  "AGENT_BEHAVIOR",
  "RISK_SCORING",
  "POLICY_EVALUATION",
  "TOOL_AUTHORIZATION",
  "TOOL_EXECUTION",
  "OUTPUT_GUARDRAIL",
  "RESPONSE",
  "ALERTING",
  "INCIDENT",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_META: Record<
  PipelineStage,
  { label: string; description: string }
> = {
  INGEST: { label: "Request Ingested", description: "AI request received and normalised." },
  INPUT_GUARDRAIL: { label: "Input Guardrails", description: "Inbound content screened before it reaches the model." },
  RAG_RETRIEVAL: { label: "RAG Retrieval", description: "Documents retrieved from the knowledge base." },
  DOCUMENT_SCAN: { label: "Document Scan", description: "Retrieved content analysed for embedded instructions." },
  THREAT_DETECTION: { label: "Threat Detection", description: "Multi-layer detection engine evaluated the request." },
  AGENT_BEHAVIOR: { label: "Agent Behaviour", description: "Agent actions compared against the user's original intent." },
  RISK_SCORING: { label: "Risk Scoring", description: "Signals combined into an explainable 0-100 score." },
  POLICY_EVALUATION: { label: "Policy Evaluation", description: "Organisational policies applied to the scored request." },
  TOOL_AUTHORIZATION: { label: "Tool Authorization", description: "Tool request checked against agent permissions." },
  TOOL_EXECUTION: { label: "Tool Execution", description: "Authorised tool invoked." },
  OUTPUT_GUARDRAIL: { label: "Output Guardrails", description: "Model response screened before delivery." },
  RESPONSE: { label: "Response Delivered", description: "Final response returned to the caller." },
  ALERTING: { label: "Alert Raised", description: "Security team notified." },
  INCIDENT: { label: "Incident Created", description: "Case opened for investigation." },
};

/* ========================================================================== *
 * Incidents & alerts
 * ========================================================================== */

export const INCIDENT_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "CONTAINED",
  "RESOLVED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_META: Record<
  IncidentStatus,
  { label: string; token: string; description: string }
> = {
  OPEN: { label: "Open", token: "critical", description: "Newly raised. Not yet triaged." },
  INVESTIGATING: { label: "Investigating", token: "high", description: "An analyst is actively working the case." },
  CONTAINED: { label: "Contained", token: "medium", description: "Threat neutralised; verification and cleanup in progress." },
  RESOLVED: { label: "Resolved", token: "allow", description: "Closed with findings recorded." },
};

/** Permitted lifecycle moves. Enforced server-side, not just in the UI. */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ["INVESTIGATING", "CONTAINED", "RESOLVED"],
  INVESTIGATING: ["CONTAINED", "RESOLVED", "OPEN"],
  CONTAINED: ["RESOLVED", "INVESTIGATING"],
  RESOLVED: ["INVESTIGATING"],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

/* ========================================================================== *
 * Identity & access  (assessment §24)
 * ========================================================================== */

export const ROLES = ["SECURITY_ADMIN", "SECURITY_ANALYST", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  SECURITY_ADMIN: {
    label: "Security Administrator",
    description:
      "Full control. Configures policies, guardrails, tools, agents and users.",
  },
  SECURITY_ANALYST: {
    label: "Security Analyst",
    description:
      "Investigates and responds. Manages incidents and approvals, but cannot change platform configuration.",
  },
  VIEWER: {
    label: "Viewer",
    description: "Read-only access to dashboards, events and reports.",
  },
};

/* ========================================================================== *
 * Channels monitored for sensitive data  (assessment §15)
 * ========================================================================== */

export const CHANNELS = [
  "USER_INPUT",
  "SYSTEM_PROMPT",
  "RAG_CONTEXT",
  "TOOL_ARGUMENTS",
  "TOOL_RESULT",
  "MODEL_OUTPUT",
  "AGENT_MEMORY",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_META: Record<Channel, { label: string; description: string }> = {
  USER_INPUT: { label: "User Input", description: "Text submitted by the user." },
  SYSTEM_PROMPT: { label: "System Prompt", description: "The application's own instructions to the model." },
  RAG_CONTEXT: { label: "RAG Context", description: "Content retrieved from the knowledge base." },
  TOOL_ARGUMENTS: { label: "Tool Arguments", description: "Parameters an agent passes to a tool." },
  TOOL_RESULT: { label: "Tool Result", description: "Data returned by an executed tool." },
  MODEL_OUTPUT: { label: "Model Output", description: "The model's generated response." },
  AGENT_MEMORY: { label: "Agent Memory", description: "Persisted agent state carried between turns." },
};
