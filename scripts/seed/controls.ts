/**
 * Guardrails (§13) and the security policy set (§20).
 *
 * Policies are data, not code. Each carries a declarative condition tree that
 * the policy engine evaluates against a scored request, so an administrator can
 * add or retune a policy from the UI without a deployment. The condition
 * grammar is defined in src/lib/engine/policy/.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export async function seedControls(prisma: PrismaClient) {
  /* ------------------------------------------------------------ guardrails */
  const guardrails = [
    // ---- Input controls
    {
      key: "input.prompt-injection", name: "Prompt Injection Shield", direction: "INPUT",
      controlType: "PROMPT_INJECTION", threshold: 60, action: "BLOCK",
      description: "Detects attempts to override system instructions in user-supplied text using the full detector ensemble rather than a single pattern.",
      config: { detectors: ["lexical.injection", "structural.instruction-position", "semantic.attack-similarity", "normalize.encoded"], blockAtConfidence: 0.6 },
    },
    {
      key: "input.indirect-injection", name: "Indirect Injection Shield", direction: "INPUT",
      controlType: "INDIRECT_INJECTION", threshold: 45, action: "BLOCK",
      description: "Applies injection detection to retrieved documents and tool results. Thresholds are lower than for direct user input because the user never consented to this content.",
      config: { channels: ["RAG_CONTEXT", "TOOL_RESULT"], blockAtConfidence: 0.45, neutraliseInsteadOfBlock: true },
    },
    {
      key: "input.jailbreak", name: "Jailbreak Detection", direction: "INPUT",
      controlType: "JAILBREAK", threshold: 65, action: "BLOCK",
      description: "Identifies persona reassignment, hypothetical framing and staged-scenario attempts to bypass model safety.",
      config: { detectors: ["lexical.jailbreak", "semantic.attack-similarity"], blockAtConfidence: 0.65 },
    },
    {
      key: "input.pii", name: "Inbound PII Control", direction: "INPUT",
      controlType: "PII", threshold: 50, action: "REDACT",
      description: "Masks personal data in user prompts before it reaches the model or is written to logs.",
      config: { types: ["SSN", "PAYMENT_CARD", "NATIONAL_ID", "PASSPORT", "DATE_OF_BIRTH", "IBAN", "BANK_ACCOUNT"], redactStyle: "partial" },
    },
    {
      key: "input.secrets", name: "Credential Detection", direction: "INPUT",
      controlType: "SECRETS", threshold: 40, action: "BLOCK",
      description: "Blocks prompts containing API keys, passwords, private keys or connection strings. Credentials must never enter a model context.",
      config: { types: ["API_KEY", "PASSWORD", "PRIVATE_KEY", "JWT", "ACCESS_TOKEN", "CONNECTION_STRING"], entropyThreshold: 3.6 },
    },
    {
      key: "input.encoded-payload", name: "Obfuscation Decoder", direction: "INPUT",
      controlType: "ENCODED_PAYLOAD", threshold: 55, action: "BLOCK",
      description: "Recursively decodes Base64, hex, ROT13, URL encoding, homoglyphs and zero-width characters, then re-runs detection on the decoded text.",
      config: { maxDepth: 3, decoders: ["base64", "hex", "rot13", "url", "homoglyph", "zerowidth"] },
    },
    {
      key: "input.system-prompt-extraction", name: "System Prompt Protection", direction: "INPUT",
      controlType: "SYSTEM_PROMPT_EXTRACTION", threshold: 60, action: "BLOCK",
      description: "Blocks requests seeking disclosure of system instructions, guardrail configuration or tool definitions.",
      config: { blockAtConfidence: 0.6 },
    },
    {
      key: "input.malicious-instruction", name: "Malicious Instruction Filter", direction: "INPUT",
      controlType: "MALICIOUS_INSTRUCTION", threshold: 55, action: "BLOCK",
      description: "Catches directives to perform destructive operations, suppress logging or conceal activity from the operator.",
      config: { categories: ["destructive", "concealment", "logging-suppression", "privilege-claim"] },
    },

    // ---- Output controls
    {
      key: "output.pii-leakage", name: "Outbound PII Protection", direction: "OUTPUT",
      controlType: "PII", threshold: 45, action: "REDACT",
      description: "Redacts personal data from model responses. Applies to retrieved data as well as generated text, since a leak is a leak regardless of origin.",
      config: { types: ["SSN", "PAYMENT_CARD", "NATIONAL_ID", "PASSPORT", "DATE_OF_BIRTH", "EMAIL", "PHONE", "IBAN", "BANK_ACCOUNT"], redactStyle: "partial" },
    },
    {
      key: "output.confidential-data", name: "Confidential Data Control", direction: "OUTPUT",
      controlType: "CONFIDENTIAL_DATA", threshold: 50, action: "BLOCK",
      description: "Prevents responses from carrying content classified above the requesting user's clearance.",
      config: { enforceClearance: true, blockOnClassification: ["RESTRICTED"] },
    },
    {
      key: "output.system-prompt-leak", name: "System Prompt Leak Prevention", direction: "OUTPUT",
      controlType: "SYSTEM_PROMPT_LEAK", threshold: 40, action: "BLOCK",
      description: "Compares responses against configured system prompts and blocks disclosure even when the request looked benign.",
      config: { similarityThreshold: 0.72, minMatchLength: 40 },
    },
    {
      key: "output.secrets", name: "Outbound Credential Control", direction: "OUTPUT",
      controlType: "SECRETS", threshold: 30, action: "BLOCK",
      description: "Blocks any response containing credential material. Zero tolerance — this control has no allow path.",
      config: { types: ["API_KEY", "PASSWORD", "PRIVATE_KEY", "JWT", "ACCESS_TOKEN", "CONNECTION_STRING"] },
    },
    {
      key: "output.unsafe-content", name: "Unsafe Content Filter", direction: "OUTPUT",
      controlType: "UNSAFE_CONTENT", threshold: 70, action: "BLOCK",
      description: "Screens responses for harmful or non-compliant content before delivery.",
      config: { categories: ["violence", "self-harm", "illegal", "harassment"] },
    },
    {
      key: "output.unauthorized-info", name: "Authorisation Boundary Check", direction: "OUTPUT",
      controlType: "UNAUTHORIZED_INFO", threshold: 50, action: "REDACT",
      description: "Verifies every fact in a response traces to a source the requester was entitled to see.",
      config: { requireProvenance: true },
    },
    {
      key: "output.exfiltration-markers", name: "Exfiltration Marker Detection", direction: "OUTPUT",
      controlType: "EXFILTRATION", threshold: 45, action: "BLOCK",
      description: "Detects responses that embed data in outbound URLs, image sources or markdown links pointing outside the trust boundary.",
      config: { checkUrls: true, checkMarkdownLinks: true, checkImageSources: true },
    },
  ] as const;

  for (const g of guardrails) {
    await prisma.guardrail.create({
      data: {
        key: g.key, name: g.name, description: g.description,
        direction: g.direction, controlType: g.controlType,
        threshold: g.threshold, action: g.action, config: g.config,
        isSystem: true,
      },
    });
  }

  /* -------------------------------------------------------------- policies */
  // Condition grammar: { all: [...] } | { any: [...] } | leaf comparisons.
  const policies = [
    {
      key: "block-prompt-injection", name: "Block Prompt Injection", priority: 10,
      category: "Injection Defence", action: "BLOCK", severity: "HIGH",
      description: "Any request where the detection engine identifies prompt injection above the confidence floor is stopped before it reaches the model.",
      condition: { all: [{ fact: "threatTypes", op: "includesAny", value: ["PROMPT_INJECTION", "INSTRUCTION_OVERRIDE", "ROLE_MANIPULATION"] }, { fact: "maxConfidence", op: "gte", value: 0.6 }] },
    },
    {
      key: "block-indirect-injection", name: "Block Indirect Injection from Retrieved Content", priority: 5,
      category: "Injection Defence", action: "BLOCK", severity: "CRITICAL",
      description: "Instructions found inside retrieved documents or tool results are never permitted to influence an agent. The threshold is deliberately lower than for direct input.",
      condition: { all: [{ fact: "threatTypes", op: "includesAny", value: ["INDIRECT_PROMPT_INJECTION", "RAG_POISONING"] }, { fact: "maxConfidence", op: "gte", value: 0.45 }] },
    },
    {
      key: "block-jailbreak", name: "Block Jailbreak Attempts", priority: 20,
      category: "Injection Defence", action: "BLOCK", severity: "HIGH",
      description: "Persona reassignment and safety-bypass framing are blocked and recorded against the user's behavioural profile.",
      condition: { all: [{ fact: "threatTypes", op: "includesAny", value: ["JAILBREAK"] }, { fact: "maxConfidence", op: "gte", value: 0.65 }] },
    },
    {
      key: "block-system-prompt-extraction", name: "Block System Prompt Extraction", priority: 25,
      category: "Injection Defence", action: "BLOCK", severity: "HIGH",
      description: "Requests for system instructions, guardrail configuration or tool definitions are refused.",
      condition: { any: [{ fact: "threatTypes", op: "includes", value: "SYSTEM_PROMPT_EXTRACTION" }] },
    },
    {
      key: "block-pii-leakage", name: "Block PII Leakage in Responses", priority: 30,
      category: "Data Protection", action: "REDACT", severity: "HIGH",
      description: "Personal data detected in a response is masked before delivery. High-sensitivity identifiers escalate to a block.",
      condition: { all: [{ fact: "sensitiveChannels", op: "includesAny", value: ["MODEL_OUTPUT", "TOOL_RESULT"] }, { fact: "sensitiveCategories", op: "includesAny", value: ["PII", "CUSTOMER", "EMPLOYEE"] }] },
    },
    {
      key: "block-secret-exposure", name: "Block Credential Exposure", priority: 1,
      category: "Data Protection", action: "BLOCK", severity: "CRITICAL",
      description: "Credential material in any monitored channel halts the request immediately. Highest-priority policy in the set.",
      condition: { any: [{ fact: "sensitiveCategories", op: "includes", value: "CREDENTIAL" }, { fact: "threatTypes", op: "includes", value: "SECRET_EXPOSURE" }] },
    },
    {
      key: "block-confidential-retrieval", name: "Block Confidential Data Retrieval Above Clearance", priority: 15,
      category: "Access Control", action: "BLOCK", severity: "HIGH",
      description: "Retrieval is refused when a document's classification exceeds the requesting user's clearance, regardless of vector similarity.",
      condition: { all: [{ fact: "retrievalClassificationExceedsClearance", op: "eq", value: true }] },
    },
    {
      key: "require-approval-db-write", name: "Require Approval for Database Writes", priority: 40,
      category: "Tool Authorisation", action: "REQUIRE_APPROVAL", severity: "HIGH",
      requiresApproval: true,
      description: "Any data-modifying warehouse statement stops for a named human before execution.",
      condition: { all: [{ fact: "toolCategory", op: "eq", value: "DATABASE" }, { fact: "toolOperation", op: "includesAny", value: ["WRITE", "DELETE"] }] },
    },
    {
      key: "require-approval-high-impact", name: "Require Human Approval for High-Impact Actions", priority: 41,
      category: "Tool Authorisation", action: "REQUIRE_APPROVAL", severity: "HIGH",
      requiresApproval: true,
      description: "Tools rated risk tier 5 — payments, deployments, outbound email, code execution — always require authorisation.",
      condition: { all: [{ fact: "toolRiskTier", op: "gte", value: 5 }] },
    },
    {
      key: "block-unauthorized-tool", name: "Block Unauthorised Tool Calls", priority: 12,
      category: "Tool Authorisation", action: "BLOCK", severity: "CRITICAL",
      description: "An agent invoking a tool it holds no grant for is denied. The gateway defaults closed.",
      condition: { any: [{ fact: "threatTypes", op: "includes", value: "UNAUTHORIZED_TOOL_CALL" }] },
    },
    {
      key: "restrict-external-urls", name: "Restrict External URLs", priority: 45,
      category: "Egress Control", action: "BLOCK", severity: "HIGH",
      description: "Outbound fetches are limited to each tool's domain allowlist. Anything else is treated as a potential exfiltration channel.",
      condition: { all: [{ fact: "egressDomainAllowed", op: "eq", value: false }] },
    },
    {
      key: "block-data-exfiltration", name: "Block Data Exfiltration", priority: 2,
      category: "Egress Control", action: "BLOCK", severity: "CRITICAL",
      description: "Any attempt to move internal data beyond the trust boundary — outbound URL, email or webhook — is stopped and escalated to an incident.",
      condition: { any: [{ fact: "threatTypes", op: "includesAny", value: ["DATA_EXFILTRATION"] }] },
    },
    {
      key: "limit-agent-tool-calls", name: "Limit Agent Tool Calls per Request", priority: 60,
      category: "Agent Control", action: "BLOCK", severity: "MEDIUM",
      description: "Caps the number of tool invocations in a single request, bounding the damage an injected agent can do before a human notices.",
      condition: { all: [{ fact: "toolCallsInRequest", op: "gt", value: "agent.maxToolCallsPerRequest" }] },
    },
    {
      key: "block-agent-goal-divergence", name: "Block Agent Goal Divergence", priority: 18,
      category: "Agent Control", action: "BLOCK", severity: "CRITICAL",
      description: "Halts an agent whose actions no longer align with the user's stated intent — the observable signature of a successful injection.",
      condition: { all: [{ fact: "threatTypes", op: "includes", value: "AGENT_GOAL_DIVERGENCE" }, { fact: "intentDivergence", op: "gte", value: 0.6 }] },
    },
    {
      key: "warn-high-risk-score", name: "Warn on Elevated Risk", priority: 80,
      category: "Risk Management", action: "WARN", severity: "MEDIUM",
      description: "Requests scoring in the elevated band proceed but are surfaced to analysts for review.",
      condition: { all: [{ fact: "riskScore", op: "gte", value: 40 }, { fact: "riskScore", op: "lt", value: 65 }] },
    },
    {
      key: "block-critical-risk-score", name: "Block Critical Risk", priority: 8,
      category: "Risk Management", action: "BLOCK", severity: "CRITICAL",
      description: "A catch-all backstop: any request scoring in the critical band is blocked even when no individual control fired decisively.",
      condition: { all: [{ fact: "riskScore", op: "gte", value: 85 }] },
    },
    {
      key: "quarantine-malicious-documents", name: "Quarantine Malicious Documents", priority: 6,
      category: "RAG Security", action: "BLOCK", severity: "CRITICAL",
      description: "Documents scanned as malicious are quarantined at ingestion and withheld from every future retrieval.",
      condition: { any: [{ fact: "documentScanStatus", op: "eq", value: "MALICIOUS" }, { fact: "documentTrustScore", op: "lt", value: 25 }] },
    },
    {
      key: "suspicious-user-throttle", name: "Escalate Suspicious User Behaviour", priority: 70,
      category: "Identity", action: "WARN", severity: "MEDIUM",
      description: "Raises severity when a principal's recent activity shows repeated blocked attempts, indicating probing rather than error.",
      condition: { all: [{ fact: "userRiskScore", op: "gte", value: 60 }] },
    },
  ] as const;

  for (const p of policies) {
    await prisma.policy.create({
      data: {
        key: p.key, name: p.name, description: p.description,
        category: p.category, priority: p.priority,
        condition: p.condition, action: p.action, severity: p.severity,
        requiresApproval: "requiresApproval" in p ? p.requiresApproval : false,
        isSystem: true,
      },
    });
  }

  return { guardrailCount: guardrails.length, policyCount: policies.length };
}
