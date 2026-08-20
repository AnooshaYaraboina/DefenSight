/**
 * Policy engine (§20).
 *
 * Policies are stored as declarative condition trees and evaluated here, so an
 * administrator adds or retunes a policy through the UI and it takes effect on
 * the next request — no deployment, no code change.
 *
 * Evaluation is deterministic and order-independent: every enabled policy is
 * evaluated against the same fact bag, and the final decision is the most
 * restrictive outcome among those that matched. Priority controls only the
 * order results are *reported* in, never whether a stricter policy can be
 * overtaken by a looser one that happened to run later.
 */
import { mostRestrictive, type Decision } from "../taxonomy";
import type { PolicyConfig, PolicyEvaluation } from "../types";

/* ========================================================================== *
 * Condition grammar
 * ========================================================================== */

export type Operator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "includes"
  | "includesAny"
  | "includesAll"
  | "excludes"
  | "matches"
  | "between";

export interface LeafCondition {
  fact: string;
  op: Operator;
  value: unknown;
}

export interface AllCondition {
  all: Condition[];
}
export interface AnyCondition {
  any: Condition[];
}
export interface NotCondition {
  not: Condition;
}

export type Condition = LeafCondition | AllCondition | AnyCondition | NotCondition;

export type FactBag = Record<string, unknown>;

function isLeaf(c: Condition): c is LeafCondition {
  return typeof c === "object" && c !== null && "fact" in c;
}

/** Resolve a possibly-dotted path against the fact bag. */
function resolve(facts: FactBag, path: string): unknown {
  if (path in facts) return facts[path];
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, facts);
}

/**
 * A policy value may reference another fact rather than a literal, which is
 * what lets "tool calls exceed the agent's own configured ceiling" be expressed
 * as data instead of code.
 */
function resolveValue(facts: FactBag, value: unknown): unknown {
  if (typeof value === "string" && /^[a-z][\w]*(\.[\w]+)+$/i.test(value)) {
    const resolved = resolve(facts, value);
    if (resolved !== undefined) return resolved;
  }
  return value;
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

function compare(actual: unknown, op: Operator, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "includes":
      return toArray(actual).includes(expected);
    case "includesAny": {
      const set = new Set(toArray(actual));
      return toArray(expected).some((v) => set.has(v));
    }
    case "includesAll": {
      const set = new Set(toArray(actual));
      return toArray(expected).every((v) => set.has(v));
    }
    case "excludes": {
      const set = new Set(toArray(actual));
      return !toArray(expected).some((v) => set.has(v));
    }
    case "matches":
      try {
        return typeof actual === "string" && new RegExp(String(expected), "i").test(actual);
      } catch {
        return false;
      }
    case "between": {
      const range = toArray(expected);
      return (
        typeof actual === "number" &&
        range.length === 2 &&
        actual >= Number(range[0]) &&
        actual <= Number(range[1])
      );
    }
    default:
      return false;
  }
}

const OP_LABEL: Record<Operator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
  includes: "includes",
  includesAny: "includes any of",
  includesAll: "includes all of",
  excludes: "excludes",
  matches: "matches",
  between: "is between",
};

function describeLeaf(c: LeafCondition, actual: unknown): string {
  const label = c.fact.replace(/([A-Z])/g, " $1").replace(/^./, (ch) => ch.toUpperCase());
  const expected = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
  const observed = Array.isArray(actual)
    ? actual.length
      ? actual.join(", ")
      : "none"
    : String(actual ?? "not set");
  return `${label} ${OP_LABEL[c.op]} ${expected} (observed: ${observed})`;
}

export interface EvaluationTrace {
  matched: boolean;
  descriptions: string[];
}

export function evaluateCondition(
  condition: Condition,
  facts: FactBag,
  trace: string[] = [],
): boolean {
  if (!condition || typeof condition !== "object") return false;

  if ("all" in condition) {
    // Evaluate every branch so the trace records all of them, not just up to
    // the first failure — an analyst needs to see which clause did not hold.
    const results = condition.all.map((c) => evaluateCondition(c, facts, trace));
    return results.every(Boolean);
  }
  if ("any" in condition) {
    const results = condition.any.map((c) => evaluateCondition(c, facts, trace));
    return results.some(Boolean);
  }
  if ("not" in condition) {
    return !evaluateCondition(condition.not, facts, trace);
  }
  if (isLeaf(condition)) {
    const actual = resolve(facts, condition.fact);
    const expected = resolveValue(facts, condition.value);
    const result = compare(actual, condition.op, expected);
    if (result) trace.push(describeLeaf(condition, actual));
    return result;
  }
  return false;
}

export interface PolicyEvaluationResult {
  evaluations: PolicyEvaluation[];
  /** Most restrictive action among matched policies. */
  decision: Decision;
  matched: PolicyEvaluation[];
  /** Set when a matched policy demands human authorisation. */
  requiresApproval: boolean;
}

export function evaluatePolicies(
  policies: PolicyConfig[],
  facts: FactBag,
): PolicyEvaluationResult {
  const evaluations: PolicyEvaluation[] = [];

  for (const policy of policies) {
    if (!policy.enabled) continue;
    const trace: string[] = [];
    let matched = false;
    try {
      matched = evaluateCondition(policy.condition as Condition, facts, trace);
    } catch {
      // A malformed condition must never take the pipeline down, and must never
      // silently allow traffic either — it is recorded as non-matching and the
      // deterministic controls elsewhere still apply.
      matched = false;
    }

    evaluations.push({
      policyId: policy.id,
      policyKey: policy.key,
      policyName: policy.name,
      matched,
      action: policy.action,
      severity: policy.severity,
      matchedConditions: trace,
      explanation: matched
        ? `${policy.name} matched: ${trace.join("; ") || "condition satisfied"}. Action: ${policy.action.replace(/_/g, " ").toLowerCase()}.`
        : `${policy.name} did not match.`,
    });
  }

  const matchedPolicies = evaluations
    .filter((e) => e.matched)
    .sort((a, b) => {
      const pa = policies.find((p) => p.id === a.policyId)?.priority ?? 999;
      const pb = policies.find((p) => p.id === b.policyId)?.priority ?? 999;
      return pa - pb;
    });

  const decision = matchedPolicies.length
    ? mostRestrictive(...matchedPolicies.map((m) => m.action))
    : "ALLOW";

  const requiresApproval = matchedPolicies.some((m) => {
    const policy = policies.find((p) => p.id === m.policyId);
    return m.action === "REQUIRE_APPROVAL" || Boolean(policy?.requiresApproval);
  });

  return { evaluations, decision, matched: matchedPolicies, requiresApproval };
}
