import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluatePolicies } from "@/lib/engine/policy/engine";
import type { PolicyConfig } from "@/lib/engine/types";

const policy = (over: Partial<PolicyConfig>): PolicyConfig => ({
  id: "p1", key: "k1", name: "Policy", description: "", category: "Test",
  enabled: true, priority: 100, condition: {}, action: "ALLOW",
  severity: "MEDIUM", requiresApproval: false, ...over,
});

describe("policy condition evaluation", () => {
  it("evaluates all/any/not trees", () => {
    const facts = { riskScore: 70, threatTypes: ["JAILBREAK"] };
    expect(evaluateCondition({ all: [
      { fact: "riskScore", op: "gte", value: 65 },
      { fact: "threatTypes", op: "includes", value: "JAILBREAK" },
    ] }, facts)).toBe(true);
    expect(evaluateCondition({ all: [
      { fact: "riskScore", op: "gte", value: 90 },
      { fact: "threatTypes", op: "includes", value: "JAILBREAK" },
    ] }, facts)).toBe(false);
    expect(evaluateCondition({ any: [
      { fact: "riskScore", op: "gte", value: 90 },
      { fact: "threatTypes", op: "includes", value: "JAILBREAK" },
    ] }, facts)).toBe(true);
    expect(evaluateCondition({ not: { fact: "riskScore", op: "gte", value: 90 } }, facts)).toBe(true);
  });

  it("resolves a value that references another fact", () => {
    const facts = { toolCallsInRequest: 9, agent: { maxToolCallsPerRequest: 5 } };
    expect(evaluateCondition(
      { fact: "toolCallsInRequest", op: "gt", value: "agent.maxToolCallsPerRequest" },
      facts,
    )).toBe(true);
    expect(evaluateCondition(
      { fact: "toolCallsInRequest", op: "gt", value: "agent.maxToolCallsPerRequest" },
      { toolCallsInRequest: 3, agent: { maxToolCallsPerRequest: 5 } },
    )).toBe(false);
  });

  it("keeps the most restrictive action regardless of evaluation order", () => {
    const policies = [
      policy({ id: "a", key: "warn", priority: 10, action: "WARN", condition: { fact: "riskScore", op: "gte", value: 40 } }),
      policy({ id: "b", key: "block", priority: 90, action: "BLOCK", condition: { fact: "riskScore", op: "gte", value: 50 } }),
      policy({ id: "c", key: "redact", priority: 50, action: "REDACT", condition: { fact: "riskScore", op: "gte", value: 45 } }),
    ];
    const forward = evaluatePolicies(policies, { riskScore: 80 });
    const reversed = evaluatePolicies([...policies].reverse(), { riskScore: 80 });
    expect(forward.decision).toBe("BLOCK");
    expect(reversed.decision).toBe("BLOCK");
    expect(forward.matched).toHaveLength(3);
  });

  it("reports why a policy matched", () => {
    const p = policy({
      key: "block-injection", name: "Block Prompt Injection", action: "BLOCK",
      condition: { all: [
        { fact: "threatTypes", op: "includesAny", value: ["PROMPT_INJECTION"] },
        { fact: "maxConfidence", op: "gte", value: 0.6 },
      ] },
    });
    const r = evaluatePolicies([p], { threatTypes: ["PROMPT_INJECTION"], maxConfidence: 0.82 });
    expect(r.decision).toBe("BLOCK");
    expect(r.matched[0].matchedConditions).toHaveLength(2);
    expect(r.matched[0].explanation).toContain("observed: PROMPT_INJECTION");
    expect(r.matched[0].explanation).toContain("observed: 0.82");
  });

  it("ignores disabled policies", () => {
    const p = policy({ enabled: false, action: "BLOCK", condition: { fact: "riskScore", op: "gte", value: 1 } });
    expect(evaluatePolicies([p], { riskScore: 99 }).decision).toBe("ALLOW");
  });

  it("treats a malformed condition as non-matching rather than crashing", () => {
    const p = policy({ action: "BLOCK", condition: { bogus: true } as never });
    expect(() => evaluatePolicies([p], { riskScore: 99 })).not.toThrow();
    expect(evaluatePolicies([p], { riskScore: 99 }).decision).toBe("ALLOW");
  });

  it("flags approval requirements", () => {
    const p = policy({ action: "REQUIRE_APPROVAL", requiresApproval: true,
      condition: { fact: "toolRiskTier", op: "gte", value: 5 } });
    const r = evaluatePolicies([p], { toolRiskTier: 5 });
    expect(r.requiresApproval).toBe(true);
    expect(r.decision).toBe("REQUIRE_APPROVAL");
  });
});
