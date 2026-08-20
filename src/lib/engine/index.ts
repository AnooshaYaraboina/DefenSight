/**
 * DefenSight detection and defence engine.
 *
 * Pure, framework-free security logic. Import from here rather than from
 * individual modules so the public surface stays stable as internals move.
 */
export * from "./taxonomy";
export type * from "./types";
export { analyze } from "./pipeline";
export { normalize } from "./normalize";
export { runDetectors, fuseDetections, behaviouralDetections, updateBaseline, DETECTORS } from "./detectors";
export { scanSensitive, redactSensitive, sensitivityWeight, SENSITIVE_PATTERNS } from "./sensitive";
export { assessRisk, RISK_WEIGHTS } from "./risk";
export { evaluatePolicies, evaluateCondition } from "./policy/engine";
export { buildFacts, FACT_CATALOGUE } from "./policy/facts";
export { evaluateGuardrails, applyRedaction, detectSystemPromptLeak } from "./guardrails";
export { authorizeToolCalls, validateAgainstSchema } from "./toolgw";
export { analyseAgentBehaviour } from "./agents/behavior";
export { scanDocument } from "./rag/scanner";
export type { DocumentScanInput, DocumentScanResult } from "./rag/scanner";
