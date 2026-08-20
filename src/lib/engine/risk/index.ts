/**
 * AI Risk Engine (§16).
 *
 * Produces a 0-100 score from independent weighted signals, and — the part that
 * actually matters — records what each signal contributed so an analyst can see
 * why. A score without its derivation is not actionable; the UI renders the
 * factor table directly from what this returns.
 *
 * Design notes:
 *
 *  - Factors are normalised to 0-1 *before* weighting, so weights are
 *    comparable and a weight change is a policy decision rather than a guess.
 *  - Combination is weighted-sum with saturation rather than a plain average.
 *    Averaging lets a single decisive signal (a confirmed exfiltration attempt)
 *    be diluted by a dozen benign ones, which is exactly backwards for security.
 *  - Some factors *reduce* risk. A well-scoped read-only agent operating inside
 *    its baseline on a public document should score lower than the same request
 *    from an over-privileged agent, and the score should say so.
 */
import {
  CLASSIFICATION_RANK,
  severityFromRisk,
  type Classification,
  type Severity,
  THREAT_META,
} from "../taxonomy";
import type {
  AnalysisContext,
  RiskAssessment,
  RiskFactor,
  SensitiveFinding,
  IntentAnalysis,
} from "../types";
import type { FusionResult } from "../detectors/fusion";
import { sensitivityWeight } from "../sensitive";
import { plural, verb } from "../text";

export interface RiskInputs {
  context: AnalysisContext;
  fusion: FusionResult;
  sensitiveFindings: SensitiveFinding[];
  intent?: IntentAnalysis;
  /** Highest risk tier among requested tools, 1-5. */
  maxToolRiskTier?: number;
  /** Number of tool calls proposed in this request. */
  toolCallCount?: number;
  /** Tool calls the gateway refused. */
  deniedToolCalls?: number;
  /** Lowest trust score among retrieved documents, 0-100. */
  minDocumentTrust?: number;
  /** Highest classification retrieved. */
  maxRetrievedClassification?: Classification;
  /** Behavioural deviation, 0-1, from the behavioural layer. */
  behaviouralDeviation?: number;
  /** Obfuscation strength from normalisation, 0-1. */
  obfuscation?: number;
}

/**
 * Factor weights. These are the policy of the risk model and are surfaced in
 * the Risk Engine screen so an administrator can see — and reason about — the
 * relative importance the platform assigns to each signal.
 */
export const RISK_WEIGHTS = {
  threatConfidence: 30,
  threatSeverity: 18,
  dataSensitivity: 14,
  toolSensitivity: 12,
  agentDivergence: 14,
  documentTrust: 10,
  clearanceBreach: 12,
  userRisk: 7,
  behaviouralDeviation: 8,
  obfuscation: 9,
  toolVolume: 5,
  agentPosture: 4,
} as const;

const SEVERITY_VALUE: Record<Severity, number> = {
  CRITICAL: 1,
  HIGH: 0.75,
  MEDIUM: 0.45,
  LOW: 0.2,
  INFO: 0,
};

export function assessRisk(inputs: RiskInputs): RiskAssessment {
  const { context, fusion } = inputs;
  const factors: RiskFactor[] = [];

  const add = (
    key: string,
    label: string,
    detail: string,
    value: number,
    weight: number,
    direction: "increases" | "decreases" = "increases",
  ) => {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped === 0 && direction === "increases") return;
    factors.push({
      key,
      label,
      detail,
      value: clamped,
      weight,
      contribution: 0, // filled in after normalisation
      direction,
    });
  };

  /* -------------------------------------------------- threat-derived signals */

  if (fusion.primary) {
    add(
      "threatConfidence",
      "Threat detection confidence",
      `${plural(fusion.threats.length, "threat type")} detected; the strongest is ${THREAT_META[fusion.primary.threatType].label} at ${(fusion.maxConfidence * 100).toFixed(0)}% confidence across ${plural(fusion.primary.agreement, "independent detection layer")}`,
      fusion.maxConfidence,
      RISK_WEIGHTS.threatConfidence,
    );

    add(
      "threatSeverity",
      "Intrinsic threat severity",
      `${THREAT_META[fusion.primary.threatType].label} carries a baseline severity of ${fusion.primary.severity.toLowerCase()}`,
      SEVERITY_VALUE[fusion.primary.severity],
      RISK_WEIGHTS.threatSeverity,
    );
  }

  /* ------------------------------------------------------- data sensitivity */

  const sensitivity = sensitivityWeight(inputs.sensitiveFindings);
  if (sensitivity > 0) {
    const categories = [...new Set(inputs.sensitiveFindings.map((f) => f.category))];
    const total = inputs.sensitiveFindings.reduce((s, f) => s + f.count, 0);
    add(
      "dataSensitivity",
      "Sensitive data exposure",
      `${plural(total, "sensitive value")} across ${categories.join(", ").toLowerCase()} detected in monitored channels`,
      sensitivity,
      RISK_WEIGHTS.dataSensitivity,
    );
  }

  /* ------------------------------------------------------- tool sensitivity */

  if (inputs.maxToolRiskTier && inputs.maxToolRiskTier > 1) {
    add(
      "toolSensitivity",
      "Tool risk tier",
      `the highest-impact tool requested is rated tier ${inputs.maxToolRiskTier} of 5${inputs.maxToolRiskTier >= 5 ? " — irreversible or externally visible effect" : ""}`,
      (inputs.maxToolRiskTier - 1) / 4,
      RISK_WEIGHTS.toolSensitivity,
    );
  }

  if (inputs.toolCallCount && inputs.toolCallCount > 1) {
    const cap = context.agent?.maxToolCallsPerRequest ?? 5;
    add(
      "toolVolume",
      "Tool call volume",
      `${plural(inputs.toolCallCount, "tool call")} in a single request against a configured ceiling of ${cap}`,
      Math.min(1, inputs.toolCallCount / Math.max(1, cap)),
      RISK_WEIGHTS.toolVolume,
    );
  }

  if (inputs.deniedToolCalls && inputs.deniedToolCalls > 0) {
    add(
      "toolSensitivity",
      "Refused tool requests",
      `${plural(inputs.deniedToolCalls, "tool request")} ${verb(inputs.deniedToolCalls, "was", "were")} refused by the gateway — an agent attempting actions outside its grants`,
      Math.min(1, inputs.deniedToolCalls / 2),
      RISK_WEIGHTS.toolSensitivity,
    );
  }

  /* --------------------------------------------------------- agent divergence */

  if (inputs.intent && inputs.intent.divergence > 0) {
    add(
      "agentDivergence",
      "Agent goal divergence",
      inputs.intent.explanation,
      inputs.intent.divergence,
      RISK_WEIGHTS.agentDivergence,
    );
  }

  /* ------------------------------------------------------------ document trust */

  if (inputs.minDocumentTrust !== undefined) {
    const trust = inputs.minDocumentTrust;
    if (trust < 60) {
      add(
        "documentTrust",
        "Retrieved document trust",
        `the least-trusted retrieved document scores ${trust}/100 — content from low-trust provenance is treated as hostile input`,
        (60 - trust) / 60,
        RISK_WEIGHTS.documentTrust,
      );
    } else if (trust >= 80 && !fusion.primary) {
      add(
        "documentTrust",
        "High-trust sources only",
        `all retrieved documents come from reviewed internal sources (lowest trust ${trust}/100)`,
        (trust - 80) / 20,
        RISK_WEIGHTS.documentTrust * 0.5,
        "decreases",
      );
    }
  }

  /* ---------------------------------------------------------- clearance breach */

  if (inputs.maxRetrievedClassification) {
    const required = CLASSIFICATION_RANK[inputs.maxRetrievedClassification];
    const held = CLASSIFICATION_RANK[context.principal.clearance];
    if (required > held) {
      add(
        "clearanceBreach",
        "Clearance boundary crossed",
        `retrieved content is classified ${inputs.maxRetrievedClassification.toLowerCase()} but ${context.principal.name} holds ${context.principal.clearance.toLowerCase()} clearance`,
        Math.min(1, (required - held) / 3),
        RISK_WEIGHTS.clearanceBreach,
      );
    }
  }

  /* -------------------------------------------------------------- user risk */

  if (context.principal.riskScore > 20) {
    add(
      "userRisk",
      "Principal risk history",
      `${context.principal.name} carries a standing behavioural risk score of ${context.principal.riskScore}/100`,
      (context.principal.riskScore - 20) / 80,
      RISK_WEIGHTS.userRisk,
    );
  }

  // Privileged roles legitimately do more; a security admin querying incident
  // data is not the same risk as an anonymous contractor doing it.
  if (context.principal.role === "SECURITY_ADMIN" && context.principal.riskScore < 20) {
    add(
      "userRisk",
      "Trusted operator",
      `request made by a security administrator with a clean behavioural record`,
      0.5,
      RISK_WEIGHTS.userRisk * 0.6,
      "decreases",
    );
  }

  /* --------------------------------------------------------- behavioural, obfuscation */

  if (inputs.behaviouralDeviation && inputs.behaviouralDeviation > 0) {
    add(
      "behaviouralDeviation",
      "Behavioural deviation",
      `activity deviates from this subject's established baseline (deviation strength ${(inputs.behaviouralDeviation * 100).toFixed(0)}%)`,
      inputs.behaviouralDeviation,
      RISK_WEIGHTS.behaviouralDeviation,
    );
  }

  if (inputs.obfuscation && inputs.obfuscation > 0.2) {
    add(
      "obfuscation",
      "Content obfuscation",
      `the content showed deliberate concealment — encoding, invisible characters or confusable glyphs (strength ${(inputs.obfuscation * 100).toFixed(0)}%). Legitimate content has no reason to hide its text`,
      inputs.obfuscation,
      RISK_WEIGHTS.obfuscation,
    );
  }

  /* ------------------------------------------------------------ agent posture */

  if (context.agent) {
    const posture = context.agent.securityScore;
    if (posture < 70) {
      add(
        "agentPosture",
        "Agent security posture",
        `${context.agent.name} has a security score of ${posture}/100, below the 70 threshold for unmonitored operation`,
        (70 - posture) / 70,
        RISK_WEIGHTS.agentPosture,
      );
    } else if (posture >= 85) {
      add(
        "agentPosture",
        "Strong agent posture",
        `${context.agent.name} maintains a security score of ${posture}/100`,
        (posture - 85) / 15,
        RISK_WEIGHTS.agentPosture,
        "decreases",
      );
    }
  }

  /* ------------------------------------------------------------- combination */

  // Merge duplicate keys by keeping the strongest instance, so a factor cannot
  // be counted twice under different descriptions.
  const merged = new Map<string, RiskFactor>();
  for (const f of factors) {
    const key = `${f.key}:${f.direction}`;
    const existing = merged.get(key);
    if (!existing || f.value * f.weight > existing.value * existing.weight) {
      merged.set(key, f);
    }
  }
  const finalFactors = [...merged.values()];

  const increasing = finalFactors.filter((f) => f.direction === "increases");
  const decreasing = finalFactors.filter((f) => f.direction === "decreases");

  const rawIncrease = increasing.reduce((s, f) => s + f.value * f.weight, 0);
  const rawDecrease = decreasing.reduce((s, f) => s + f.value * f.weight, 0);

  // Saturating combination. Points accumulate but with diminishing returns, so
  // a request cannot exceed 100 by piling on minor signals — while a single
  // decisive factor still moves the score decisively.
  const SATURATION = 62;
  const positive = 100 * (1 - Math.exp(-rawIncrease / SATURATION));
  const mitigation = Math.min(positive * 0.35, rawDecrease * 0.6);
  const score = Math.max(0, Math.min(100, Math.round(positive - mitigation)));

  // Attribute the final score back to each factor proportionally, so the
  // contributions displayed in the UI sum to the score the analyst sees.
  const totalWeighted = rawIncrease || 1;
  for (const f of increasing) {
    f.contribution = Number((((f.value * f.weight) / totalWeighted) * positive).toFixed(1));
  }
  for (const f of decreasing) {
    const share = rawDecrease > 0 ? (f.value * f.weight) / rawDecrease : 0;
    f.contribution = Number((-(share * mitigation)).toFixed(1));
  }

  finalFactors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const topDrivers = finalFactors
    .filter((f) => f.direction === "increases")
    .slice(0, 3)
    .map((f) => f.label);

  // Confidence in the *score* rises with the number of agreeing signals.
  const signalCount = increasing.length;
  const agreement = fusion.primary?.agreement ?? 0;
  const confidence = Math.min(
    0.97,
    0.4 + Math.min(0.3, signalCount * 0.06) + Math.min(0.27, agreement * 0.09),
  );

  return {
    score,
    severity: severityFromRisk(score),
    factors: finalFactors,
    topDrivers,
    rationale: buildRationale(score, finalFactors, topDrivers),
    confidence,
  };
}

function buildRationale(
  score: number,
  factors: RiskFactor[],
  topDrivers: string[],
): string {
  if (factors.length === 0) {
    return "No elevated risk signals were present. The request matched normal usage on every monitored dimension.";
  }

  const severity = severityFromRisk(score);
  const lead =
    severity === "CRITICAL"
      ? `Scored ${score}/100 (critical).`
      : severity === "HIGH"
        ? `Scored ${score}/100 (high).`
        : severity === "MEDIUM"
          ? `Scored ${score}/100 (medium).`
          : `Scored ${score}/100 (low).`;

  const drivers = topDrivers.length
    ? ` The score is driven primarily by ${topDrivers.join(", ").toLowerCase()}.`
    : "";

  const top = factors.filter((f) => f.direction === "increases").slice(0, 2);
  const detail = top.length ? ` ${top.map((f) => capitalise(f.detail)).join(". ")}.` : "";

  const mitigating = factors.filter((f) => f.direction === "decreases");
  const offset = mitigating.length
    ? ` Offsetting factors reduced the score by ${Math.abs(mitigating.reduce((s, f) => s + f.contribution, 0)).toFixed(0)} points: ${mitigating.map((f) => f.label.toLowerCase()).join(", ")}.`
    : "";

  return `${lead}${drivers}${detail}${offset}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
