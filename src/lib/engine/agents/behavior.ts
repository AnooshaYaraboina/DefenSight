/**
 * Agent behaviour analysis (§9).
 *
 * Compares what the agent is *doing* against what the user actually *asked
 * for*. This is the single most valuable signal for detecting a successful
 * indirect injection, because a successful injection has an unavoidable
 * observable consequence: the agent starts taking actions the user never
 * requested. The attacker controls the agent's intent, but they cannot make the
 * user's original request retroactively mention emailing a vendor.
 *
 * Two complementary measures:
 *
 *  1. Relevance — lexical overlap between the request and each action, so a
 *     document lookup for a question about documents scores high.
 *  2. Capability plausibility — whether an action's *category* has any
 *     plausible role in fulfilling a request of this shape. Summarising a
 *     document never requires sending mail, whatever the wording.
 *
 * The second measure carries the weight, because it survives paraphrase. An
 * attacker who mentions "email" in the injected text can raise lexical overlap;
 * they cannot make outbound email a plausible step in summarisation.
 */
import type { IntentAnalysis, ProposedToolCall, RetrievedChunk, ToolDefinitionContext } from "../types";

/* ------------------------------------------------------------- intent model */

/** Broad shapes a user request can take. */
type IntentKind =
  | "SUMMARISE"
  | "LOOKUP"
  | "ANALYSE"
  | "REPORT"
  | "COMMUNICATE"
  | "MODIFY"
  | "OPERATE"
  | "UNKNOWN";

const INTENT_SIGNATURES: Array<{ kind: IntentKind; re: RegExp }> = [
  { kind: "SUMMARISE", re: /\b(?:summari[sz]e|summary|tl;?dr|brief me|key points|overview of|recap|digest)\b/i },
  { kind: "LOOKUP", re: /\b(?:what is|what are|who is|where is|when (?:is|was|did)|find|search|look ?up|show me|tell me about|which|list)\b/i },
  { kind: "ANALYSE", re: /\b(?:analy[sz]e|compare|evaluate|assess|why|explain|break down|investigate|trend)\b/i },
  { kind: "REPORT", re: /\b(?:generate|produce|create|build|prepare|draft)\s+(?:a\s+)?(?:report|deck|summary|document|analysis)\b/i },
  { kind: "COMMUNICATE", re: /\b(?:email|send|reply|respond|notify|message|post|forward|contact)\b/i },
  { kind: "MODIFY", re: /\b(?:update|change|edit|modify|correct|fix|set|delete|remove|archive)\b/i },
  { kind: "OPERATE", re: /\b(?:deploy|roll ?back|restart|scale|provision|run|execute)\b/i },
];

function classifyIntent(request: string): IntentKind[] {
  const kinds = INTENT_SIGNATURES.filter((s) => s.re.test(request)).map((s) => s.kind);
  return kinds.length ? kinds : ["UNKNOWN"];
}

/**
 * Which tool categories a given intent can plausibly require.
 *
 * Read-only capabilities are broadly available because almost any question can
 * legitimately need a lookup. Capabilities with side effects are deliberately
 * narrow: they must be justified by the request, not merely permitted by a
 * grant.
 */
const PLAUSIBLE_CATEGORIES: Record<IntentKind, string[]> = {
  SUMMARISE: ["SEARCH", "FILE"],
  LOOKUP: ["SEARCH", "FILE", "DATABASE", "API"],
  ANALYSE: ["SEARCH", "FILE", "DATABASE", "API"],
  REPORT: ["SEARCH", "FILE", "DATABASE", "API", "BUSINESS"],
  COMMUNICATE: ["SEARCH", "FILE", "API", "EMAIL", "MESSAGING"],
  MODIFY: ["SEARCH", "FILE", "DATABASE", "API", "BUSINESS"],
  OPERATE: ["SEARCH", "FILE", "BUSINESS", "CODE", "MESSAGING"],
  UNKNOWN: ["SEARCH", "FILE"],
};

/* --------------------------------------------------------------- relevance */

function tokens(text: string): Set<string> {
  const STOP = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at", "by",
    "with", "from", "is", "are", "was", "were", "be", "been", "this", "that",
    "it", "as", "me", "my", "our", "you", "your", "please", "can", "could",
    "would", "should", "do", "does", "did", "have", "has", "had", "will",
  ]);
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/* ---------------------------------------------------------------- analysis */

export interface BehaviourInput {
  userRequest: string;
  agentPurpose: string;
  proposedToolCalls: ProposedToolCall[];
  tools: Record<string, ToolDefinitionContext>;
  retrievals?: RetrievedChunk[];
}

export function analyseAgentBehaviour(input: BehaviourInput): IntentAnalysis {
  const { userRequest, proposedToolCalls, tools } = input;

  const observedActions: string[] = [];
  const unrelatedActions: string[] = [];

  if (proposedToolCalls.length === 0) {
    return {
      divergence: 0,
      statedIntent: userRequest.slice(0, 200),
      observedActions: [],
      unrelatedActions: [],
      explanation: "The agent proposed no actions, so there is nothing to diverge from the user's request.",
    };
  }

  const intentKinds = classifyIntent(userRequest);
  const plausible = new Set(intentKinds.flatMap((k) => PLAUSIBLE_CATEGORIES[k]));
  const requestTokens = tokens(`${userRequest} ${input.agentPurpose}`);

  let divergenceWeight = 0;
  let totalWeight = 0;

  for (const call of proposedToolCalls) {
    const tool = tools[call.toolSlug];
    const label = `${tool?.name ?? call.toolSlug} (${call.operation})`;
    observedActions.push(label);

    // Weight by blast radius: an unrelated read is noise, an unrelated send is
    // an incident.
    const riskTier = tool?.riskTier ?? 3;
    const sideEffecting = call.operation !== "READ";
    const weight = riskTier * (sideEffecting ? 1.6 : 1);
    totalWeight += weight;

    const categoryPlausible = tool ? plausible.has(tool.category) : false;

    const actionText = `${tool?.name ?? call.toolSlug} ${tool?.description ?? ""} ${Object.values(call.arguments).filter((v) => typeof v === "string").join(" ")}`;
    const relevance = jaccard(requestTokens, tokens(actionText));

    // Category implausibility dominates; low lexical relevance alone is a weak
    // signal because short requests share few tokens with anything.
    let actionDivergence = 0;
    if (!categoryPlausible) {
      actionDivergence = 0.85;
      unrelatedActions.push(
        `${label} — ${tool ? `${tool.category.toLowerCase()} capability` : "unregistered tool"} has no plausible role in a request of this kind (${intentKinds.join("/").toLowerCase()})`,
      );
    } else if (relevance < 0.03 && sideEffecting) {
      actionDivergence = 0.5;
      unrelatedActions.push(
        `${label} — a side-effecting action with no textual connection to the request`,
      );
    } else if (relevance < 0.02) {
      actionDivergence = 0.2;
    }

    divergenceWeight += actionDivergence * weight;
  }

  const divergence = totalWeight > 0 ? Math.min(1, divergenceWeight / totalWeight) : 0;

  return {
    divergence,
    statedIntent: userRequest.slice(0, 200),
    observedActions,
    unrelatedActions,
    explanation: buildExplanation({
      divergence,
      intentKinds,
      unrelatedActions,
      observedCount: proposedToolCalls.length,
    }),
  };
}

function buildExplanation(p: {
  divergence: number;
  intentKinds: IntentKind[];
  unrelatedActions: string[];
  observedCount: number;
}): string {
  const intent = p.intentKinds.join("/").toLowerCase();

  if (p.divergence === 0) {
    return `All ${p.observedCount} proposed action(s) are consistent with a ${intent} request.`;
  }

  if (p.unrelatedActions.length === 0) {
    return `Proposed actions are weakly connected to the user's ${intent} request (divergence ${(p.divergence * 100).toFixed(0)}%), though each remains within a plausible capability set.`;
  }

  return (
    `The agent's actions have diverged from the user's stated intent (${(p.divergence * 100).toFixed(0)}%). ` +
    `The request is a ${intent} request, but the agent proposed: ${p.unrelatedActions.join("; ")}. ` +
    `A user asking for one thing while the agent attempts another is the observable signature of a successful injection — ` +
    `the attacker controls the agent's goal, but cannot alter what the user originally asked for.`
  );
}
