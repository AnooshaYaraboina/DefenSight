/**
 * Guardrails Center (§13).
 *
 * Guardrails are the configurable, administrator-facing surface over the
 * detection engine. Each one binds a control type to a threshold and an action,
 * and can be enabled or retuned from the UI without touching code.
 *
 * The separation from policies is deliberate:
 *   - A **guardrail** asks "did this specific control trigger?" — it is scoped
 *     to one channel and one class of finding.
 *   - A **policy** asks "given everything we now know about this request, what
 *     should happen?" — it reasons across all findings at once.
 *
 * Both must agree before a request proceeds, and the most restrictive outcome
 * of the two always wins.
 */
import { mostRestrictive, type Channel, type Decision ,
  THREAT_META,
} from "../taxonomy";
import type {
  DetectionResult,
  GuardrailConfig,
  GuardrailEvaluation,
  SensitiveFinding,
} from "../types";
import { fuseDetections, type FusedThreat } from "../detectors/fusion";
import { redactSensitive } from "../sensitive";
import { plural } from "../text";

/**
 * Which detection threat types each control type is responsible for.
 *
 * Exported because the Guardrails Center needs the same mapping to show how
 * much traffic each control has been answering for. It was copied there once
 * and the two drifted — the page grew PII and SECRETS entries the engine never
 * had. One definition now, imported in both places.
 *
 * PII and SECRETS trigger from sensitive findings rather than detections (see
 * CONTROL_CATEGORIES), so they contribute nothing here at evaluation time. They
 * are listed because the page counts detection activity for them, and a control
 * absent from this map would silently report zero.
 */
export const CONTROL_THREATS: Record<string, string[]> = {
  PROMPT_INJECTION: ["PROMPT_INJECTION", "INSTRUCTION_OVERRIDE", "ROLE_MANIPULATION"],
  INDIRECT_INJECTION: ["INDIRECT_PROMPT_INJECTION", "RAG_POISONING"],
  JAILBREAK: ["JAILBREAK"],
  SYSTEM_PROMPT_EXTRACTION: ["SYSTEM_PROMPT_EXTRACTION"],
  SYSTEM_PROMPT_LEAK: ["SYSTEM_PROMPT_EXTRACTION"],
  ENCODED_PAYLOAD: ["ENCODED_PAYLOAD"],
  MALICIOUS_INSTRUCTION: ["TOOL_ABUSE", "PROMPT_INJECTION"],
  EXFILTRATION: ["DATA_EXFILTRATION"],
  UNSAFE_CONTENT: ["UNSAFE_OUTPUT"],
  CONFIDENTIAL_DATA: ["UNAUTHORIZED_DOCUMENT_ACCESS", "DATA_LEAKAGE"],
  UNAUTHORIZED_INFO: ["UNAUTHORIZED_ACCESS", "DATA_LEAKAGE"],
  PII: ["DATA_LEAKAGE", "SENSITIVE_DATA_EXPOSURE"],
  SECRETS: ["SECRET_EXPOSURE"],
};

/** Which sensitive categories each control type is responsible for. */
const CONTROL_CATEGORIES: Record<string, string[]> = {
  PII: ["PII"],
  SECRETS: ["CREDENTIAL"],
  CONFIDENTIAL_DATA: ["BUSINESS", "CUSTOMER", "EMPLOYEE", "FINANCIAL"],
};

export interface GuardrailInput {
  guardrails: GuardrailConfig[];
  direction: "INPUT" | "OUTPUT";
  detections: DetectionResult[];
  sensitiveFindings: SensitiveFinding[];
  /** Channels in scope for this pass. */
  channels: Channel[];
  /** Present on the output pass so leak comparison can run. */
  text?: string;
  systemPrompt?: string;
}

/**
 * Confidence a *single* detection layer may contribute before corroboration.
 *
 * A guardrail acts on fused confidence, not on the loudest individual detector.
 * The structural and semantic layers are corroborating by design — they
 * generalise well but are noisy on short text — so allowing either to cross a
 * block threshold alone would contradict the whole fusion model and produce
 * exactly the false positives it exists to prevent. Fusion applies each layer's
 * reliability weight and only awards the agreement bonus when independent
 * methods converge.
 */

export interface GuardrailResult {
  evaluations: GuardrailEvaluation[];
  triggered: GuardrailEvaluation[];
  decision: Decision;
  /** Sensitive types that a REDACT guardrail asked to be masked. */
  redactTypes: string[];
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const evaluations: GuardrailEvaluation[] = [];
  const redactTypes = new Set<string>();

  const relevantDetections = input.detections.filter((d) => input.channels.includes(d.channel));
  const relevantSensitive = input.sensitiveFindings.filter((f) =>
    input.channels.includes(f.channel),
  );
  const fusedThreats = fuseDetections(relevantDetections).threats;

  for (const g of input.guardrails) {
    if (g.direction !== input.direction) continue;

    const evaluation: GuardrailEvaluation = {
      key: g.key,
      name: g.name,
      direction: g.direction,
      controlType: g.controlType,
      triggered: false,
      action: "ALLOW",
      confidence: 0,
      explanation: "",
      detectionIds: [],
    };

    if (!g.enabled) {
      evaluation.explanation = `${g.name} is disabled and was not evaluated.`;
      evaluations.push(evaluation);
      continue;
    }

    // Threshold is expressed 0-100 in the UI, confidence 0-1 in the engine.
    const threshold = g.threshold / 100;

    /* ------------------------------------------- detection-backed controls */
    const watchedThreats = CONTROL_THREATS[g.controlType] ?? [];
    const matchingDetections = relevantDetections.filter((d) =>
      watchedThreats.includes(d.threatType),
    );
    // Act on the fused verdict rather than the loudest single detector, so a
    // lone corroborating layer cannot trip a block by itself.
    const matchingThreats = fusedThreats.filter((t) => watchedThreats.includes(t.threatType));
    const peakThreat = matchingThreats.reduce<FusedThreat | null>(
      (best, t) => (!best || t.confidence > best.confidence ? t : best),
      null,
    );

    /* ------------------------------------------- sensitive-backed controls */
    const watchedCategories = CONTROL_CATEGORIES[g.controlType] ?? [];
    const configuredTypes = Array.isArray(g.config?.types)
      ? (g.config.types as string[])
      : undefined;
    const matchingSensitive = relevantSensitive.filter(
      (f) =>
        watchedCategories.includes(f.category) &&
        (!configuredTypes || configuredTypes.includes(f.type)),
    );
    const peakSensitive = matchingSensitive.reduce(
      (max, f) => Math.max(max, f.confidence),
      0,
    );

    /* --------------------------------- system prompt leak (output only) */
    let leakConfidence = 0;
    let leakDetail = "";
    if (g.controlType === "SYSTEM_PROMPT_LEAK" && input.text && input.systemPrompt) {
      const leak = detectSystemPromptLeak(
        input.text,
        input.systemPrompt,
        Number(g.config?.minMatchLength ?? 40),
      );
      leakConfidence = leak.confidence;
      leakDetail = leak.detail;
    }

    const confidence = Math.max(
      peakThreat?.confidence ?? 0,
      peakSensitive,
      leakConfidence,
    );

    if (confidence >= threshold && confidence > 0) {
      evaluation.triggered = true;
      evaluation.action = g.action;
      evaluation.confidence = confidence;
      evaluation.detectionIds = matchingDetections.map((d) => d.detectorId);

      const reasons: string[] = [];
      if (peakThreat) {
        reasons.push(
          `${THREAT_META[peakThreat.threatType].label} confirmed at ${(peakThreat.confidence * 100).toFixed(0)}% fused confidence across ${peakThreat.agreement} independent layer(s)`,
        );
      }
      if (matchingSensitive.length > 0) {
        const total = matchingSensitive.reduce((s, f) => s + f.count, 0);
        reasons.push(
          `${plural(total, "value")} matched: ${matchingSensitive.slice(0, 3).map((f) => f.type.toLowerCase().replace(/_/g, " ")).join(", ")}`,
        );
      }
      if (leakDetail) reasons.push(leakDetail);

      evaluation.explanation = `${g.name} triggered — ${reasons.join("; ")}. Confidence ${(confidence * 100).toFixed(0)}% met the configured threshold of ${g.threshold}%. Action: ${g.action.replace(/_/g, " ").toLowerCase()}.`;

      if (g.action === "REDACT") {
        for (const f of matchingSensitive) redactTypes.add(f.type);
        if (configuredTypes) configuredTypes.forEach((t) => redactTypes.add(t));
      }
    } else if (confidence > 0) {
      evaluation.confidence = confidence;
      const single = peakThreat?.agreement === 1;
      evaluation.explanation = `${g.name} observed a signal at ${(confidence * 100).toFixed(0)}% fused confidence, below its configured threshold of ${g.threshold}%.${single ? " Only one detection layer agreed, so the finding is recorded as a lead rather than acted on." : ""} No action taken.`;
    } else {
      evaluation.explanation = `${g.name} found nothing in scope.`;
    }

    evaluations.push(evaluation);
  }

  const triggered = evaluations.filter((e) => e.triggered);
  const decision = triggered.length
    ? mostRestrictive(...triggered.map((t) => t.action))
    : "ALLOW";

  return { evaluations, triggered, decision, redactTypes: [...redactTypes] };
}

/**
 * System prompt leak detection.
 *
 * Compares the response against the configured system prompt using shingled
 * n-gram overlap. A model can leak its instructions while paraphrasing them, so
 * exact substring matching is not enough; but a low bar produces constant false
 * positives, since a response legitimately shares vocabulary with the prompt
 * that shaped it. Contiguous run length is the discriminator: incidental
 * overlap is short and scattered, disclosure is long and contiguous.
 */
export function detectSystemPromptLeak(
  response: string,
  systemPrompt: string,
  minMatchLength = 40,
): { confidence: number; detail: string; longestMatch: string } {
  if (!systemPrompt || systemPrompt.length < 20) {
    return { confidence: 0, detail: "", longestMatch: "" };
  }

  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const r = normalise(response);
  const p = normalise(systemPrompt);

  // Longest common substring via a rolling window over prompt shingles. The
  // prompt is short, so this stays cheap.
  let longest = "";
  const words = p.split(" ");
  for (let start = 0; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const candidate = words.slice(start, end).join(" ");
      if (candidate.length <= longest.length) break;
      if (r.includes(candidate)) {
        longest = candidate;
        break;
      }
    }
  }

  if (longest.length < minMatchLength) {
    return { confidence: 0, detail: "", longestMatch: longest };
  }

  const coverage = longest.length / p.length;
  const confidence = Math.min(0.98, 0.55 + coverage * 0.45);

  return {
    confidence,
    detail: `response reproduces ${longest.length} contiguous characters of the system prompt (${(coverage * 100).toFixed(0)}% of it): "${longest.slice(0, 80)}…"`,
    longestMatch: longest,
  };
}

/** Apply the redaction requested by triggered guardrails. */
export function applyRedaction(
  text: string,
  redactTypes: string[],
): { text: string; redacted: boolean; count: number } {
  if (redactTypes.length === 0) return { text, redacted: false, count: 0 };
  const result = redactSensitive(text, { types: redactTypes });
  return { text: result.text, redacted: result.replaced > 0, count: result.replaced };
}
