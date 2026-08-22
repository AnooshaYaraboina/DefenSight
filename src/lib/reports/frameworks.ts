/**
 * Threat vocabulary and external framework mapping.
 *
 * Lifted out of the single-incident report so the consolidated review can use
 * exactly the same wording. Two documents in the same evidence pack that
 * define "RAG poisoning" differently, or map it to different OWASP entries,
 * are worse than one document that omits the definition entirely.
 *
 * References: OWASP Top 10 for LLM Applications (2025) and MITRE ATLAS.
 */

export const OWASP: Record<string, string> = {
  PROMPT_INJECTION: "LLM01 Prompt Injection",
  INDIRECT_PROMPT_INJECTION: "LLM01 Prompt Injection (indirect)",
  INSTRUCTION_OVERRIDE: "LLM01 Prompt Injection",
  ROLE_MANIPULATION: "LLM01 Prompt Injection",
  JAILBREAK: "LLM01 Prompt Injection",
  SYSTEM_PROMPT_EXTRACTION: "LLM07 System Prompt Leakage",
  RAG_POISONING: "LLM08 Vector and Embedding Weaknesses",
  MALICIOUS_DOCUMENT: "LLM08 Vector and Embedding Weaknesses",
  UNAUTHORIZED_DOCUMENT_ACCESS: "LLM02 Sensitive Information Disclosure",
  DATA_LEAKAGE: "LLM02 Sensitive Information Disclosure",
  DATA_EXFILTRATION: "LLM02 Sensitive Information Disclosure",
  SENSITIVE_DATA_EXPOSURE: "LLM02 Sensitive Information Disclosure",
  SECRET_EXPOSURE: "LLM02 Sensitive Information Disclosure",
  UNAUTHORIZED_TOOL_CALL: "LLM06 Excessive Agency",
  TOOL_ABUSE: "LLM06 Excessive Agency",
  EXCESSIVE_PERMISSIONS: "LLM06 Excessive Agency",
  AGENT_GOAL_DIVERGENCE: "LLM06 Excessive Agency",
  AGENT_ANOMALY: "LLM06 Excessive Agency",
};

export const ATLAS: Record<string, string> = {
  PROMPT_INJECTION: "AML.T0051 LLM Prompt Injection",
  INDIRECT_PROMPT_INJECTION: "AML.T0051.001 Indirect",
  INSTRUCTION_OVERRIDE: "AML.T0054 LLM Jailbreak",
  JAILBREAK: "AML.T0054 LLM Jailbreak",
  ROLE_MANIPULATION: "AML.T0054 LLM Jailbreak",
  SYSTEM_PROMPT_EXTRACTION: "AML.T0056 Meta Prompt Extraction",
  RAG_POISONING: "AML.T0070 RAG Poisoning",
  MALICIOUS_DOCUMENT: "AML.T0070 RAG Poisoning",
  DATA_EXFILTRATION: "AML.T0057 LLM Data Leakage",
  DATA_LEAKAGE: "AML.T0057 LLM Data Leakage",
  SECRET_EXPOSURE: "AML.T0057 LLM Data Leakage",
  UNAUTHORIZED_TOOL_CALL: "AML.T0053 LLM Plugin Compromise",
  TOOL_ABUSE: "AML.T0053 LLM Plugin Compromise",
};

/**
 * What each threat type actually means, in the terms a reader outside the
 * security team will accept. Written so that a manager reading only the
 * glossary can still follow the register.
 */
export const GLOSSARY: Record<string, string> = {
  PROMPT_INJECTION:
    "Instructions smuggled into a user request that try to override the application's own system prompt — the model is asked to stop being the assistant it was configured to be.",
  INDIRECT_PROMPT_INJECTION:
    "The same attack delivered through content the model retrieves rather than through what the user typed: a document, a web page or a tool result carrying instructions aimed at the model.",
  INSTRUCTION_OVERRIDE:
    "An explicit attempt to cancel prior instructions — \"ignore everything above\", \"you are now in developer mode\" — so that policy text no longer constrains the reply.",
  ROLE_MANIPULATION:
    "Persuading the model to adopt a different persona or authority level, typically to inherit permissions the real caller does not hold.",
  JAILBREAK:
    "A framing device — fiction, hypotheticals, role-play, encoding — used to obtain output the model would otherwise refuse.",
  SYSTEM_PROMPT_EXTRACTION:
    "An attempt to make the model reveal its own configuration: system prompt, tool definitions, or the policy text governing it. Leaked configuration makes every later attack cheaper.",
  RAG_POISONING:
    "Hostile content placed where the retrieval layer will find it, so that the model treats attacker-written text as trusted context.",
  MALICIOUS_DOCUMENT:
    "A specific document identified as carrying an attack payload, quarantined so retrieval cannot serve it again.",
  UNAUTHORIZED_DOCUMENT_ACCESS:
    "A retrieval that reached for material above the requester's clearance. Withheld at the retrieval stage rather than filtered out of the answer.",
  DATA_LEAKAGE:
    "Sensitive material appearing in a model response — identifiers, records or internal detail that should not have crossed the trust boundary.",
  DATA_EXFILTRATION:
    "A deliberate attempt to move confidential data out of the estate, usually by asking the model to summarise, encode or forward it.",
  SENSITIVE_DATA_EXPOSURE:
    "Regulated or personal data present in a request or a reply where the policy for that surface does not permit it.",
  SECRET_EXPOSURE:
    "Credentials, API keys or tokens detected in traffic. Treated as compromised from the moment they appear in a logged request.",
  UNAUTHORIZED_TOOL_CALL:
    "An agent attempting an action outside its granted scope — a tool it was never authorised to invoke, or one invoked with arguments beyond its remit.",
  TOOL_ABUSE:
    "A permitted tool used in an unintended way: correct authorisation, wrong purpose.",
  EXCESSIVE_PERMISSIONS:
    "An agent holding grants broader than its task requires. Not an attack in itself; it is the condition that makes one damaging.",
  AGENT_GOAL_DIVERGENCE:
    "An agent's actions drifting from the objective it was given, whether through injected instruction or accumulated context.",
  AGENT_ANOMALY:
    "Behaviour outside an agent's established baseline — unusual volume, timing, tool mix or target — flagged for review rather than blocked outright.",
};
