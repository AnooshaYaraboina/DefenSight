/**
 * Behavioural layer.
 *
 * Scores deviation from each subject's own established normal rather than
 * against a fixed threshold. A finance agent that makes twenty warehouse
 * queries an hour is behaving normally; a policy advisor that makes one is not.
 * A single global threshold cannot express that, so every metric is judged in
 * standard deviations from the subject's own rolling baseline.
 *
 * This is the layer that catches an attack whose *text* is clean — a compromised
 * agent quietly widening its data access, or a user methodically probing which
 * phrasings get blocked.
 */
import { severityFromRisk } from "../taxonomy";
import type { DetectionResult } from "../types";
import type { BaselineContext, HistoryContext } from "../types";

export interface BehavioralInput {
  principalId: string;
  agentId?: string;
  history?: HistoryContext;
  baselines?: BaselineContext;
  /** Observations from the request currently being evaluated. */
  observed: {
    toolCallCount: number;
    promptLength: number;
    retrievalCount: number;
    distinctToolsUsed: number;
  };
  /** Local hour of day, 0-23, for off-hours scoring. */
  hourOfDay: number;
  /** The agent's configured ceiling, used for the cap check. */
  maxToolCallsPerRequest?: number;
}

interface Signal {
  key: string;
  label: string;
  /** Standard deviations from baseline, where applicable. */
  z?: number;
  /** 0-1 normalised strength. */
  strength: number;
  detail: string;
}

/**
 * Deviation in standard deviations, with a floor on the denominator. A subject
 * whose baseline has near-zero variance would otherwise produce an infinite
 * z-score on any change at all.
 */
function zScore(value: number, mean: number, stddev: number): number {
  const denom = Math.max(stddev, Math.max(0.6, mean * 0.18));
  return (value - mean) / denom;
}

/** Sub-linear so an extreme outlier saturates rather than dominating. */
function strengthFromZ(z: number): number {
  if (z <= 1.5) return 0;
  return Math.min(1, (z - 1.5) / 3.5);
}

export function analyseBehaviour(input: BehavioralInput): {
  signals: Signal[];
  confidence: number;
} {
  const signals: Signal[] = [];
  const b = input.baselines ?? {};
  const h = input.history;

  const check = (
    metric: string,
    observed: number,
    key: string,
    label: string,
    describe: (z: number, mean: number) => string,
  ) => {
    const base = b[metric];
    if (!base || base.sampleCount < 12) return; // too little history to judge
    const z = zScore(observed, base.mean, base.stddev);
    const strength = strengthFromZ(z);
    if (strength <= 0) return;
    signals.push({ key, label, z, strength, detail: describe(z, base.mean) });
  };

  check(
    "toolCallsPerRequest",
    input.observed.toolCallCount,
    "tool-rate-deviation",
    "Tool invocation rate deviation",
    (z, mean) =>
      `${input.observed.toolCallCount} tool calls in one request against a baseline of ${mean.toFixed(1)} (${z.toFixed(1)}σ above normal for this agent)`,
  );

  check(
    "promptLength",
    input.observed.promptLength,
    "prompt-length-deviation",
    "Prompt length deviation",
    (z, mean) =>
      `prompt is ${input.observed.promptLength} characters against a typical ${Math.round(mean)} (${z.toFixed(1)}σ) — unusually long prompts often carry an appended payload`,
  );

  check(
    "retrievalCount",
    input.observed.retrievalCount,
    "retrieval-volume-deviation",
    "Retrieval volume deviation",
    (z, mean) =>
      `${input.observed.retrievalCount} documents retrieved against a baseline of ${mean.toFixed(1)} (${z.toFixed(1)}σ) — broad retrieval can indicate collection rather than a question`,
  );

  check(
    "distinctToolsUsed",
    input.observed.distinctToolsUsed,
    "tool-breadth-deviation",
    "Tool breadth deviation",
    (z, mean) =>
      `${input.observed.distinctToolsUsed} distinct tools used against a baseline of ${mean.toFixed(1)} (${z.toFixed(1)}σ)`,
  );

  if (h) {
    // Probing: a high proportion of recent requests blocked means the principal
    // is iterating on phrasings rather than making mistakes.
    if (h.recentRequests >= 5) {
      const blockedRatio = h.recentBlocked / h.recentRequests;
      if (blockedRatio > 0.25) {
        signals.push({
          key: "probing-pattern",
          label: "Repeated blocked attempts",
          strength: Math.min(1, (blockedRatio - 0.25) / 0.5),
          detail: `${h.recentBlocked} of the last ${h.recentRequests} requests from this principal were blocked (${Math.round(blockedRatio * 100)}%), a pattern consistent with probing rather than error`,
        });
      }
    }

    // Breadth across applications in a short window is reconnaissance-shaped.
    if (h.distinctApplications >= 4) {
      signals.push({
        key: "lateral-breadth",
        label: "Unusual breadth of access",
        strength: Math.min(1, (h.distinctApplications - 3) / 4),
        detail: `${h.distinctApplications} distinct AI applications touched in the trailing window`,
      });
    }

    if (h.recentThreats >= 3) {
      signals.push({
        key: "recent-threat-history",
        label: "Recent threat history",
        strength: Math.min(1, h.recentThreats / 8),
        detail: `${h.recentThreats} threats already attributed to this principal in the trailing window`,
      });
    }
  }

  // Hard cap breach. Not a statistical signal — a configured limit was exceeded.
  if (
    input.maxToolCallsPerRequest !== undefined &&
    input.observed.toolCallCount > input.maxToolCallsPerRequest
  ) {
    signals.push({
      key: "tool-cap-breach",
      label: "Tool call ceiling exceeded",
      strength: 1,
      detail: `${input.observed.toolCallCount} tool calls requested against a configured ceiling of ${input.maxToolCallsPerRequest}`,
    });
  }

  // Off-hours activity is weak alone and only counted alongside another signal.
  const offHours = input.hourOfDay < 6 || input.hourOfDay >= 22;
  if (offHours && signals.length > 0) {
    signals.push({
      key: "off-hours",
      label: "Off-hours activity",
      strength: 0.25,
      detail: `request made at ${String(input.hourOfDay).padStart(2, "0")}:00 local time, outside normal working hours`,
    });
  }

  if (signals.length === 0) return { signals, confidence: 0 };

  const raw = signals.reduce((s, sig) => s + sig.strength, 0);
  // Behaviour corroborates; it rarely convicts alone, so the ceiling is modest.
  const confidence = Math.min(0.68, 1 - Math.exp(-raw * 0.85));

  return { signals, confidence };
}

export function behaviouralDetections(input: BehavioralInput): DetectionResult[] {
  const { signals, confidence } = analyseBehaviour(input);
  if (confidence < 0.25) return [];

  const capBreach = signals.find((s) => s.key === "tool-cap-breach");
  const probing = signals.find((s) => s.key === "probing-pattern");

  const threatType = capBreach
    ? "ABNORMAL_TOOL_USAGE"
    : probing
      ? "SUSPICIOUS_USER_BEHAVIOR"
      : "AGENT_ANOMALY";

  const statistics: Record<string, number> = {};
  for (const s of signals) {
    if (s.z !== undefined) statistics[s.key] = Number(s.z.toFixed(2));
  }

  return [
    {
      detectorId: "behavioral.baseline-deviation",
      layer: "BEHAVIORAL",
      threatType,
      channel: "USER_INPUT",
      confidence,
      score: Math.round(confidence * 100),
      severity: severityFromRisk(confidence * 100),
      explanation: `Activity deviates from the established baseline: ${signals.map((s) => s.detail).join("; ")}. Each metric is judged against this subject's own history rather than a global threshold, so normal-but-heavy usage is not penalised.`,
      evidence: {
        signals: signals.map((s) => ({
          key: s.key,
          label: s.label,
          strength: Number(s.strength.toFixed(3)),
          z: s.z !== undefined ? Number(s.z.toFixed(2)) : undefined,
          detail: s.detail,
        })),
        statistics,
      },
    },
  ];
}

/**
 * Welford's online update. Baselines are maintained incrementally as events are
 * recorded, so no historical recomputation is ever needed.
 */
export function updateBaseline(
  current: { mean: number; m2: number; sampleCount: number },
  value: number,
): { mean: number; m2: number; sampleCount: number; stddev: number } {
  const n = current.sampleCount + 1;
  const delta = value - current.mean;
  const mean = current.mean + delta / n;
  const m2 = current.m2 + delta * (value - mean);
  const variance = n > 1 ? m2 / (n - 1) : 0;
  return { mean, m2, sampleCount: n, stddev: Math.sqrt(variance) };
}
