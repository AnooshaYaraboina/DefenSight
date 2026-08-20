/**
 * Lexical layer.
 *
 * Runs the pattern families across every normalised variant, accumulates
 * evidence per family, applies context mitigations, then converts corroboration
 * across families into confidence.
 *
 * Two properties matter more than the patterns themselves:
 *
 *  1. Evidence accumulates with diminishing returns. Five matches from one
 *     family is not five times one match — it is one behaviour, observed
 *     repeatedly.
 *  2. Corroboration across *different* families is what actually raises
 *     confidence, because a real attack needs several behaviours at once
 *     (override the instructions, conceal the action, move the data) while an
 *     unlucky business document produces at most one.
 */
import type { Channel, Severity, ThreatType } from "../taxonomy";
import { severityFromRisk } from "../taxonomy";
import type { DetectionResult, EvidenceSpan } from "../types";
import type { Detector, DetectorInput } from "./types";
import {
  CONTEXT_WINDOW,
  MITIGATIONS,
  PATTERN_FAMILIES,
  type PatternFamily,
} from "./patterns";

interface FamilyHit {
  family: PatternFamily;
  /** Accumulated, mitigation-adjusted weight. */
  strength: number;
  spans: EvidenceSpan[];
  labels: string[];
  /** Mitigations that reduced this family's strength. */
  mitigations: string[];
  /** Which normalised variant produced the strongest evidence. */
  origin: string;
}

/** Diminishing returns: the nth match of the same family adds less than the first. */
function accumulate(weights: number[]): number {
  const sorted = [...weights].sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i] / (1 + i * 0.8);
  }
  return total;
}

function applyMitigations(
  full: string,
  matchText: string,
  index: number,
): { factor: number; applied: string[] } {
  const window = full.slice(
    Math.max(0, index - CONTEXT_WINDOW),
    index + matchText.length + CONTEXT_WINDOW,
  );
  let factor = 1;
  const applied: string[] = [];
  for (const m of MITIGATIONS) {
    try {
      if (m.test({ window, full, matchText })) {
        factor *= m.factor;
        applied.push(m.label);
      }
    } catch {
      /* a mitigation must never break detection */
    }
  }
  // Floor the reduction: strong context weakens a signal but never erases it,
  // because "quote the attack then perform it" is itself a known evasion.
  return { factor: Math.max(0.12, factor), applied };
}

export function scanFamilies(input: DetectorInput): FamilyHit[] {
  const hits = new Map<string, FamilyHit>();

  for (const variant of input.normalization.variants) {
    // Decoded variants are inherently more suspicious: benign documents do not
    // hide their text. Weight their evidence up.
    const variantBoost = variant.depth > 0 ? 1 + Math.min(0.5, variant.depth * 0.25) : 1;

    for (const family of PATTERN_FAMILIES) {
      const weights: number[] = [];
      const spans: EvidenceSpan[] = [];
      const labels = new Set<string>();
      const mitigationLabels = new Set<string>();

      for (const pattern of family.patterns) {
        pattern.re.lastIndex = 0;
        for (const m of variant.text.matchAll(pattern.re)) {
          const matchText = m[0];
          const index = m.index ?? 0;
          const { factor, applied } = applyMitigations(variant.text, matchText, index);
          applied.forEach((a) => mitigationLabels.add(a));

          weights.push(pattern.weight * factor * variantBoost);
          labels.add(pattern.label);

          // Only variants that map onto the raw text can produce highlightable
          // spans; decoded content is shown separately as decoded evidence.
          if (variant.depth === 0 && spans.length < 12) {
            spans.push({
              start: index,
              end: index + matchText.length,
              text: matchText.slice(0, 160),
              label: pattern.label,
            });
          }
        }
      }

      if (weights.length === 0) continue;
      const strength = accumulate(weights) * family.significance;

      const existing = hits.get(family.id);
      if (!existing || strength > existing.strength) {
        hits.set(family.id, {
          family,
          strength,
          spans,
          labels: [...labels],
          mitigations: [...mitigationLabels],
          origin: variant.origin,
        });
      }
    }
  }

  return [...hits.values()];
}

/**
 * Confidence model.
 *
 * A single family, however strong, is capped below the block threshold used by
 * the guardrails — one signal is a lead, not a verdict. Each additional
 * independent family raises the ceiling sharply. Corroborating-only families
 * (fabricated authority, encoding lures) never count toward the independent
 * total on their own.
 */
function fuseFamilies(hits: FamilyHit[]): {
  confidence: number;
  independentCount: number;
} {
  if (hits.length === 0) return { confidence: 0, independentCount: 0 };

  const independent = hits.filter((h) => !h.family.corroborating);
  const corroborating = hits.filter((h) => h.family.corroborating);

  const strongest = Math.max(...hits.map((h) => h.strength));
  const base = 1 - Math.exp(-strongest * 0.9);

  // Ceiling by number of independent behaviours observed.
  const ceiling = [0.45, 0.62, 0.86, 0.94, 0.97][Math.min(4, independent.length)] ?? 0.97;

  // Supporting families add a bounded bonus.
  const support =
    corroborating.reduce((s, h) => s + Math.min(0.08, h.strength * 0.05), 0) +
    Math.max(0, independent.length - 1) * 0.06;

  return {
    confidence: Math.min(ceiling, base + support),
    independentCount: independent.length,
  };
}

function severityFor(threat: ThreatType, confidence: number, channel: Channel): Severity {
  // Instructions arriving through retrieved content are more dangerous than the
  // same words typed by a user: the user consented to their own prompt.
  const channelBoost =
    channel === "RAG_CONTEXT" || channel === "TOOL_RESULT" ? 12 : 0;
  return severityFromRisk(confidence * 100 + channelBoost);
}

export const lexicalDetector: Detector = {
  id: "lexical.pattern-families",
  layer: "LEXICAL",
  channels: [
    "USER_INPUT",
    "RAG_CONTEXT",
    "TOOL_ARGUMENTS",
    "TOOL_RESULT",
    "MODEL_OUTPUT",
    "AGENT_MEMORY",
  ],

  run(input: DetectorInput): DetectionResult[] {
    const hits = scanFamilies(input);
    if (hits.length === 0) return [];

    const { confidence, independentCount } = fuseFamilies(hits);
    if (confidence < 0.15) return [];

    // The dominant family names the threat; the rest become supporting evidence.
    const ranked = [...hits].sort((a, b) => b.strength - a.strength);
    const primary = ranked[0];

    // Retrieved content carrying instructions is indirect injection by
    // definition, regardless of which family matched.
    const isRetrieved = input.channel === "RAG_CONTEXT" || input.channel === "TOOL_RESULT";
    const injectionFamilies = [
      "instruction-override",
      "role-manipulation",
      "delimiter-injection",
      "concealment",
      "safety-bypass",
    ];
    const threatType: ThreatType =
      isRetrieved && injectionFamilies.includes(primary.family.id)
        ? "INDIRECT_PROMPT_INJECTION"
        : primary.family.threatType;

    const severity = severityFor(threatType, confidence, input.channel);
    const allSpans = ranked.flatMap((h) => h.spans).slice(0, 20);
    const allMitigations = [...new Set(ranked.flatMap((h) => h.mitigations))];

    const behaviourList = ranked
      .slice(0, 4)
      .map((h) => `${h.family.label.toLowerCase()} (${h.labels.slice(0, 2).join(", ")})`)
      .join("; ");

    const explanation = buildExplanation({
      independentCount,
      behaviourList,
      channel: input.channel,
      mitigations: allMitigations,
      origin: primary.origin,
      confidence,
    });

    const results: DetectionResult[] = [
      {
        detectorId: this.id,
        layer: "LEXICAL",
        threatType,
        channel: input.channel,
        confidence,
        score: Math.round(confidence * 100),
        severity,
        explanation,
        evidence: {
          spans: allSpans,
          families: ranked.map((h) => ({
            id: h.family.id,
            label: h.family.label,
            strength: Number(h.strength.toFixed(3)),
            matched: h.labels,
            origin: h.origin,
            corroborating: Boolean(h.family.corroborating),
          })),
          independentBehaviours: independentCount,
          mitigationsApplied: allMitigations,
        },
        sourceDocumentId: input.sourceDocumentId,
      },
    ];

    // Exfiltration and destructive-action families describe a *different*
    // threat from the injection that carries them, and an analyst needs both
    // recorded. Emit them as their own detections when they carry real weight.
    for (const hit of ranked.slice(1)) {
      if (hit.family.corroborating) continue;
      if (hit.family.threatType === threatType) continue;
      if (hit.strength < 0.55) continue;
      const sub = Math.min(confidence, 1 - Math.exp(-hit.strength * 0.9));
      results.push({
        detectorId: `${this.id}:${hit.family.id}`,
        layer: "LEXICAL",
        threatType: hit.family.threatType,
        channel: input.channel,
        confidence: sub,
        score: Math.round(sub * 100),
        severity: severityFor(hit.family.threatType, sub, input.channel),
        explanation: `${hit.family.label} indicators present alongside the primary finding: ${hit.labels.slice(0, 3).join(", ")}.`,
        evidence: {
          spans: hit.spans,
          matched: hit.labels,
          origin: hit.origin,
          mitigationsApplied: hit.mitigations,
        },
        sourceDocumentId: input.sourceDocumentId,
      });
    }

    return results;
  },
};

function buildExplanation(p: {
  independentCount: number;
  behaviourList: string;
  channel: Channel;
  mitigations: string[];
  origin: string;
  confidence: number;
}): string {
  const where =
    p.channel === "RAG_CONTEXT"
      ? "retrieved document content"
      : p.channel === "TOOL_RESULT"
        ? "a tool result"
        : p.channel === "MODEL_OUTPUT"
          ? "the model response"
          : p.channel === "TOOL_ARGUMENTS"
            ? "tool arguments"
            : "the user prompt";

  const parts: string[] = [];
  parts.push(
    p.independentCount > 1
      ? `${p.independentCount} independent attack behaviours were observed in ${where}: ${p.behaviourList}.`
      : `Attack indicators were observed in ${where}: ${p.behaviourList}.`,
  );

  if (p.origin !== "original") {
    parts.push(
      `The strongest evidence appeared only after normalisation (${p.origin}), meaning the text was obfuscated.`,
    );
  }
  if (p.mitigations.length > 0) {
    parts.push(
      `Confidence was reduced because of surrounding context: ${p.mitigations.join("; ").toLowerCase()}.`,
    );
  }
  if (p.independentCount <= 1 && p.confidence < 0.5) {
    parts.push(
      "A single indicator on its own is treated as a lead rather than a verdict.",
    );
  }
  return parts.join(" ");
}
