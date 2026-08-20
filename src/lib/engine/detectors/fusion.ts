/**
 * Detection fusion.
 *
 * Turns a pile of independent detector outputs into one defensible verdict.
 *
 * The combination rule is noisy-OR across *layers*, not across detections. Two
 * lexical detectors firing on the same phrase are one observation seen twice;
 * a lexical hit plus a semantic hit plus a structural hit are three genuinely
 * independent lines of evidence, and only the latter should move confidence
 * decisively. Collapsing to the strongest detection per layer before combining
 * is what encodes that difference.
 *
 * Cross-layer agreement then earns an explicit bonus, because independent
 * methods converging on the same conclusion is the strongest signal available
 * short of a confirmed exploit.
 */
import {
  SEVERITY_RANK,
  severityFromRisk,
  THREAT_META,
  type Severity,
  type ThreatType,
} from "../taxonomy";
import type { DetectionLayer, DetectionResult } from "../types";

export interface FusedThreat {
  threatType: ThreatType;
  /** 0-1 fused confidence across all contributing layers. */
  confidence: number;
  severity: Severity;
  /** Layers that contributed evidence. */
  layers: DetectionLayer[];
  /** Number of independent layers in agreement. */
  agreement: number;
  detections: DetectionResult[];
  /** Highest single-detection confidence, before fusion. */
  peakConfidence: number;
  explanation: string;
}

export interface FusionResult {
  threats: FusedThreat[];
  /** Confidence of the most credible threat. */
  maxConfidence: number;
  /** The threat that should headline the event. */
  primary?: FusedThreat;
  severity: Severity;
  threatTypes: ThreatType[];
}

/**
 * How much a layer's evidence is trusted when fused with others. Lexical
 * evidence is precise but brittle; semantic evidence generalises but is noisier;
 * authorisation evidence is a fact rather than an inference and is trusted
 * almost completely.
 */
const LAYER_RELIABILITY: Record<DetectionLayer, number> = {
  AUTHORIZATION: 1,
  LEXICAL: 0.92,
  NORMALIZATION: 0.85,
  SEMANTIC: 0.78,
  STRUCTURAL: 0.72,
  BEHAVIORAL: 0.7,
  LLM_ADJUDICATION: 0.8,
};

function noisyOr(probabilities: number[]): number {
  return 1 - probabilities.reduce((acc, p) => acc * (1 - Math.min(0.995, p)), 1);
}

export function fuseDetections(detections: DetectionResult[]): FusionResult {
  if (detections.length === 0) {
    return { threats: [], maxConfidence: 0, severity: "INFO", threatTypes: [] };
  }

  const byThreat = new Map<ThreatType, DetectionResult[]>();
  for (const d of detections) {
    const list = byThreat.get(d.threatType);
    if (list) list.push(d);
    else byThreat.set(d.threatType, [d]);
  }

  const threats: FusedThreat[] = [];

  for (const [threatType, group] of byThreat) {
    // Collapse to the strongest detection per layer.
    const perLayer = new Map<DetectionLayer, DetectionResult>();
    for (const d of group) {
      const existing = perLayer.get(d.layer);
      if (!existing || d.confidence > existing.confidence) perLayer.set(d.layer, d);
    }

    const layers = [...perLayer.keys()];
    const weighted = layers.map(
      (layer) => perLayer.get(layer)!.confidence * LAYER_RELIABILITY[layer],
    );

    let confidence = noisyOr(weighted);

    // Independent layers converging is the strongest available signal.
    if (layers.length >= 2) {
      const agreementBonus = Math.min(0.18, (layers.length - 1) * 0.075);
      confidence = Math.min(0.99, confidence + agreementBonus * (1 - confidence));
    }

    const peakConfidence = Math.max(...group.map((d) => d.confidence));

    // Severity starts from the threat's intrinsic seriousness and is modulated
    // by confidence: a near-certain data exfiltration outranks a possible one.
    const meta = THREAT_META[threatType];
    const baseRank = SEVERITY_RANK[meta.baseSeverity];
    const confidenceAdjusted = severityFromRisk(confidence * 100);
    const severity: Severity =
      confidence >= 0.75
        ? meta.baseSeverity
        : SEVERITY_RANK[confidenceAdjusted] < baseRank
          ? confidenceAdjusted
          : meta.baseSeverity;

    threats.push({
      threatType,
      confidence,
      severity,
      layers,
      agreement: layers.length,
      detections: group.sort((a, b) => b.confidence - a.confidence),
      peakConfidence,
      explanation: buildFusionExplanation(threatType, layers, confidence, peakConfidence),
    });
  }

  // Rank by seriousness first, then confidence — a probable exfiltration should
  // headline over a certain low-severity finding.
  threats.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.confidence - a.confidence;
  });

  const maxConfidence = Math.max(...threats.map((t) => t.confidence));

  return {
    threats,
    maxConfidence,
    primary: threats[0],
    severity: threats[0]?.severity ?? "INFO",
    threatTypes: threats.map((t) => t.threatType),
  };
}

const LAYER_LABEL: Record<DetectionLayer, string> = {
  LEXICAL: "pattern analysis",
  STRUCTURAL: "structural analysis",
  SEMANTIC: "semantic similarity",
  BEHAVIORAL: "behavioural baselines",
  NORMALIZATION: "obfuscation analysis",
  AUTHORIZATION: "authorisation checks",
  LLM_ADJUDICATION: "AI adjudication",
};

function buildFusionExplanation(
  threatType: ThreatType,
  layers: DetectionLayer[],
  confidence: number,
  peak: number,
): string {
  const names = layers.map((l) => LAYER_LABEL[l]);
  const label = THREAT_META[threatType].label;

  if (layers.length === 1) {
    return `${label} identified by ${names[0]} alone at ${(peak * 100).toFixed(0)}% confidence. A single method is treated as a lead: confidence is capped until a second, independent method agrees.`;
  }

  const list =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return `${label} confirmed by ${layers.length} independent methods — ${list} — fusing to ${(confidence * 100).toFixed(0)}% confidence. Independent techniques converging on the same conclusion is substantially stronger evidence than any single detector, however certain.`;
}
