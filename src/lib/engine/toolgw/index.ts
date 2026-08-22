/**
 * Tool Security Gateway (§14).
 *
 * Every tool invocation an agent proposes passes through here before it can
 * execute. The gateway is **default-closed**: absence of an explicit grant is a
 * denial, not an omission. That single property is what makes an injected agent
 * survivable — the attacker can change what the agent *wants* to do, but not
 * what it is *permitted* to do.
 *
 * Checks run in order of cost, cheapest first, but all of them run: an analyst
 * investigating a denial needs the complete picture, not just the first failure.
 */
import { mostRestrictive, type Decision, type Severity, type ThreatType } from "../taxonomy";
import type {
  AgentContext,
  ProposedToolCall,
  ToolCheck,
  ToolDecision,
  ToolDefinitionContext,
} from "../types";
import { normalize } from "../normalize";
import { scanSensitive } from "../sensitive";
import { scanFamilies } from "../detectors/lexical";
import { validateAgainstSchema } from "./schema";
import { plural, verb } from "../text";

export interface GatewayInput {
  agent: AgentContext;
  tools: Record<string, ToolDefinitionContext>;
  calls: ProposedToolCall[];
  /** Calls already made in the current rate window, keyed by tool slug. */
  callsInWindow?: Record<string, number>;
  /** The user's original request, used to judge relevance. */
  userIntent?: string;
}

/** Argument patterns that indicate a destructive or unbounded operation. */
const DESTRUCTIVE_ARGUMENT_PATTERNS: Array<{ re: RegExp; label: string; severity: Severity }> = [
  { re: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i, label: "DDL drop statement", severity: "CRITICAL" },
  { re: /\bTRUNCATE\s+TABLE\b/i, label: "table truncation", severity: "CRITICAL" },
  { re: /\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i, label: "DELETE with no WHERE clause", severity: "CRITICAL" },
  { re: /\bDELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1/i, label: "DELETE with an always-true predicate", severity: "CRITICAL" },
  { re: /\bUPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b)/i, label: "UPDATE with no WHERE clause", severity: "HIGH" },
  { re: /\bGRANT\s+ALL\b/i, label: "blanket privilege grant", severity: "HIGH" },
  { re: /\brm\s+-rf\s+[/~]/i, label: "recursive filesystem delete", severity: "CRITICAL" },
  { re: /\bSELECT\s+\*\s+FROM\s+\w+\s*(?:;|$)/i, label: "unbounded SELECT * with no predicate", severity: "MEDIUM" },
];

/** SQL that reads well beyond the stated purpose — a collection signal. */
const BROAD_READ = /\bSELECT\s+\*[\s\S]*\bJOIN\b/i;

function stringifyArguments(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

/**
 * Pull the string *values* out of an argument object, discarding keys and JSON
 * punctuation.
 *
 * Scanning raw JSON would be wrong: every value is wrapped in quotes, which
 * looks identical to quoted speech and trips the lexical layer's "this is a
 * quotation, not an instruction" mitigation. An injected directive inside a SQL
 * comment would then be discounted to nothing. Scanning the unwrapped values
 * gives the detector the text as the tool will actually receive it.
 */
function argumentStrings(args: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, depth + 1));
    else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach((v) => walk(v, depth + 1));
    }
  };
  walk(args, 0);
  return out.join("\n");
}

function extractUrls(args: Record<string, unknown>): string[] {
  const text = stringifyArguments(args);
  return [...text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) => m[0]);
}

function extractEmails(args: Record<string, unknown>): string[] {
  const text = stringifyArguments(args);
  return [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0]);
}

function hostOf(value: string): string | null {
  try {
    return value.includes("@") ? value.split("@")[1].toLowerCase() : new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainAllowed(host: string, allowed: string[]): boolean {
  return allowed.some(
    (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
  );
}

export interface GatewayResult {
  decisions: ToolDecision[];
  /** Most restrictive outcome across all proposed calls. */
  decision: Decision;
  deniedCount: number;
  approvalCount: number;
  threatTypes: ThreatType[];
  /** Highest risk tier among the tools requested. */
  maxRiskTier: number;
  /** True when the agent's per-request ceiling was exceeded. */
  capExceeded: boolean;
}

export function authorizeToolCalls(input: GatewayInput): GatewayResult {
  const { agent, tools, calls } = input;
  const decisions: ToolDecision[] = [];
  const perToolCount: Record<string, number> = {};
  let maxRiskTier = 1;

  const capExceeded = calls.length > agent.maxToolCallsPerRequest;

  for (const call of calls) {
    const checks: ToolCheck[] = [];
    const threatTypes = new Set<ThreatType>();
    const tool = tools[call.toolSlug];
    const grant = agent.grants[call.toolSlug];

    perToolCount[call.toolSlug] = (perToolCount[call.toolSlug] ?? 0) + 1;

    /* ---------------------------------------------------- 1. tool existence */
    const toolExists = Boolean(tool);
    checks.push({
      check: "tool-exists",
      label: "Tool is registered",
      passed: toolExists,
      detail: toolExists
        ? `${tool.name} is a registered tool in the catalogue.`
        : `No tool is registered under the slug "${call.toolSlug}". The agent requested a capability that does not exist.`,
      severity: "HIGH",
    });

    if (!toolExists) {
      threatTypes.add("UNAUTHORIZED_TOOL_CALL");
      decisions.push(buildDecision(call, null, checks, [...threatTypes], "BLOCK", 90,
        `Tool "${call.toolSlug}" is not registered.`));
      continue;
    }

    maxRiskTier = Math.max(maxRiskTier, tool.riskTier);

    /* ------------------------------------------------------ 2. tool enabled */
    checks.push({
      check: "tool-enabled",
      label: "Tool is enabled",
      passed: tool.enabled,
      detail: tool.enabled
        ? `${tool.name} is enabled.`
        : `${tool.name} has been disabled by an administrator.`,
      severity: "MEDIUM",
    });

    /* --------------------------------------- 3. grant exists (default closed) */
    const hasGrant = Boolean(grant) && !grant.denied;
    checks.push({
      check: "grant-exists",
      label: "Agent holds a grant for this tool",
      passed: hasGrant,
      detail: !grant
        ? `${agent.name} holds no grant for ${tool.name}. The gateway denies by default: a tool an agent was never granted is refused, regardless of how the request was framed.`
        : grant.denied
          ? `${agent.name} is explicitly denied ${tool.name}. An explicit denial overrides any allow.`
          : `${agent.name} holds a grant for ${tool.name}.`,
      severity: "CRITICAL",
    });

    if (!hasGrant) threatTypes.add("UNAUTHORIZED_TOOL_CALL");

    /* ------------------------------------------------ 4. operation permitted */
    const grantedOps = grant?.operations ?? [];
    const opPermitted = hasGrant && grantedOps.includes(call.operation);
    checks.push({
      check: "operation-permitted",
      label: "Operation is within the grant",
      passed: opPermitted,
      detail: opPermitted
        ? `${call.operation} is permitted by the grant (allows ${grantedOps.join(", ")}).`
        : hasGrant
          ? `${call.operation} is not permitted. The grant allows only ${grantedOps.join(", ") || "no operations"}.`
          : `Operation could not be authorised because no grant exists.`,
      severity: "CRITICAL",
    });

    if (hasGrant && !opPermitted) {
      threatTypes.add("UNAUTHORIZED_TOOL_CALL");
      threatTypes.add("EXCESSIVE_PERMISSIONS");
    }

    /* --------------------------------------- 5. tool supports the operation */
    const toolSupports = tool.operations.includes(call.operation);
    checks.push({
      check: "operation-supported",
      label: "Tool supports the operation",
      passed: toolSupports,
      detail: toolSupports
        ? `${tool.name} supports ${call.operation}.`
        : `${tool.name} does not support ${call.operation}; it supports ${tool.operations.join(", ")}.`,
      severity: "MEDIUM",
    });

    /* ------------------------------------------- 6. parameter schema validation */
    const violations = validateAgainstSchema(call.arguments, tool.parameterSchema as never);
    checks.push({
      check: "parameter-schema",
      label: "Arguments match the declared schema",
      passed: violations.length === 0,
      detail: violations.length === 0
        ? "All arguments conform to the tool's declared parameter schema."
        : `${plural(violations.length, "schema violation")}: ${violations.map((v) => `${v.path} ${v.message}`).join("; ")}.`,
      severity: "HIGH",
    });
    if (violations.length > 0) threatTypes.add("TOOL_ABUSE");

    /* ------------------------------------------ 7. destructive argument scan */
    const argText = stringifyArguments(call.arguments);
    const destructive = DESTRUCTIVE_ARGUMENT_PATTERNS.filter((p) => p.re.test(argText));
    checks.push({
      check: "destructive-arguments",
      label: "Arguments are not destructive or unbounded",
      passed: destructive.length === 0,
      detail: destructive.length === 0
        ? "No destructive or unbounded operation detected in the arguments."
        : `Arguments contain ${destructive.map((d) => d.label).join(", ")}.`,
      severity: destructive.some((d) => d.severity === "CRITICAL") ? "CRITICAL" : "HIGH",
    });
    if (destructive.length > 0) threatTypes.add("TOOL_ABUSE");

    if (BROAD_READ.test(argText)) {
      checks.push({
        check: "read-scope",
        label: "Read scope is bounded",
        passed: false,
        detail: "The query selects all columns across joined tables, which reads far more than a targeted lookup requires.",
        severity: "MEDIUM",
      });
      threatTypes.add("TOOL_ABUSE");
    }

    /* --------------------------------------- 8. injected content in arguments */
    const argValues = argumentStrings(call.arguments);
    const argFamilies = scanFamilies({
      raw: argValues,
      normalization: normalize(argValues),
      channel: "TOOL_ARGUMENTS",
    }).filter((f) => !f.family.corroborating && f.strength > 0.45);
    checks.push({
      check: "argument-injection",
      label: "Arguments are free of injected instructions",
      passed: argFamilies.length === 0,
      detail: argFamilies.length === 0
        ? "No instruction-like content found in the arguments."
        : `Arguments carry instruction-like content: ${argFamilies.map((f) => f.family.label.toLowerCase()).join(", ")}.`,
      severity: "HIGH",
    });
    if (argFamilies.length > 0) {
      threatTypes.add("TOOL_ABUSE");
      threatTypes.add("PROMPT_INJECTION");
    }

    /* ---------------------------------------- 9. sensitive data in arguments */
    const sensitiveInArgs = scanSensitive(argText, "TOOL_ARGUMENTS").filter(
      (f) => f.category === "CREDENTIAL" || f.confidence > 0.8,
    );
    checks.push({
      check: "argument-sensitivity",
      label: "Arguments carry no sensitive data",
      passed: sensitiveInArgs.length === 0,
      detail: sensitiveInArgs.length === 0
        ? "No sensitive values detected in the arguments."
        : `Arguments contain ${sensitiveInArgs.map((f) => `${f.count}× ${f.type.toLowerCase().replace(/_/g, " ")}`).join(", ")}.`,
      severity: sensitiveInArgs.some((f) => f.category === "CREDENTIAL") ? "CRITICAL" : "MEDIUM",
    });
    if (sensitiveInArgs.some((f) => f.category === "CREDENTIAL")) {
      threatTypes.add("SECRET_EXPOSURE");
    }

    /* ------------------------------------------------ 10. egress allowlisting */
    const urls = extractUrls(call.arguments);
    const emails = extractEmails(call.arguments);
    const destinations = [...urls, ...emails];
    if (destinations.length > 0) {
      const allowed = tool.allowedDomains ?? [];
      const blockedDestinations = destinations.filter((d) => {
        const host = hostOf(d);
        return !host || allowed.length === 0 || !domainAllowed(host, allowed);
      });
      checks.push({
        check: "egress-allowlist",
        label: "Destinations are on the allowlist",
        passed: blockedDestinations.length === 0,
        detail: blockedDestinations.length === 0
          ? `All ${plural(destinations.length, "destination")} are on ${tool.name}'s allowlist.`
          : allowed.length === 0
            ? `${tool.name} has no egress allowlist configured, so outbound destinations (${blockedDestinations.slice(0, 3).join(", ")}) cannot be permitted.`
            : `${blockedDestinations.length === 1 ? "Destination" : "Destinations"} ${blockedDestinations.slice(0, 3).join(", ")} ${verb(blockedDestinations.length, "is", "are")} not on ${tool.name}'s allowlist (${allowed.join(", ")}).`,
        severity: "CRITICAL",
      });
      if (blockedDestinations.length > 0) {
        threatTypes.add("DATA_EXFILTRATION");
      }
    }

    /* ------------------------------------------------------ 11. rate limiting */
    const windowCount = (input.callsInWindow?.[call.toolSlug] ?? 0) + perToolCount[call.toolSlug];
    const withinRate = windowCount <= tool.rateLimitPerMinute;
    checks.push({
      check: "rate-limit",
      label: "Within rate limit",
      passed: withinRate,
      detail: withinRate
        ? `${plural(windowCount, "call")} in the current window against a limit of ${tool.rateLimitPerMinute}/min.`
        : `Rate limit exceeded: ${windowCount} calls against a limit of ${tool.rateLimitPerMinute}/min.`,
      severity: "MEDIUM",
    });
    if (!withinRate) threatTypes.add("ABNORMAL_TOOL_USAGE");

    /* -------------------------------------------- 12. per-request grant cap */
    const grantCap = grant?.maxCallsPerRequest ?? 1;
    const withinGrantCap = perToolCount[call.toolSlug] <= grantCap;
    checks.push({
      check: "per-request-cap",
      label: "Within the grant's per-request cap",
      passed: withinGrantCap,
      detail: withinGrantCap
        ? `${perToolCount[call.toolSlug]} of ${plural(grantCap, "permitted call")} to ${tool.name} in this request.`
        : `${perToolCount[call.toolSlug]} calls to ${tool.name} exceed the grant's cap of ${grantCap} per request.`,
      severity: "MEDIUM",
    });
    if (!withinGrantCap) threatTypes.add("ABNORMAL_TOOL_USAGE");

    /* ------------------------------------------------- 13. agent-level ceiling */
    if (capExceeded) {
      checks.push({
        check: "agent-tool-ceiling",
        label: "Within the agent's tool-call ceiling",
        passed: false,
        detail: `${calls.length} tool calls requested against ${agent.name}'s ceiling of ${agent.maxToolCallsPerRequest} per request. The ceiling bounds how much damage a manipulated agent can do before a human sees it.`,
        severity: "HIGH",
      });
      threatTypes.add("ABNORMAL_TOOL_USAGE");
    }

    /* ------------------------------------------------------- risk & decision */
    const risk = scoreToolCall({ tool, checks, capExceeded });

    const failedCritical = checks.some((c) => !c.passed && c.severity === "CRITICAL");
    const failedHigh = checks.some((c) => !c.passed && c.severity === "HIGH");
    const failedMedium = checks.some((c) => !c.passed && c.severity === "MEDIUM");

    let decision: Decision;
    let reason: string;

    if (failedCritical) {
      decision = "BLOCK";
      const failed = checks.filter((c) => !c.passed && c.severity === "CRITICAL");
      reason = failed.map((c) => c.detail).join(" ");
    } else if (failedHigh) {
      decision = "BLOCK";
      reason = checks.filter((c) => !c.passed && c.severity === "HIGH").map((c) => c.detail).join(" ");
    } else if (tool.requiresApproval || risk >= tool.approvalThreshold) {
      decision = "REQUIRE_APPROVAL";
      reason = tool.requiresApproval
        ? `${tool.name} is a tier-${tool.riskTier} tool and always requires human authorisation before execution.`
        : `Risk score ${risk} meets ${tool.name}'s approval threshold of ${tool.approvalThreshold}.`;
    } else if (failedMedium) {
      decision = "WARN";
      reason = checks.filter((c) => !c.passed && c.severity === "MEDIUM").map((c) => c.detail).join(" ");
    } else {
      decision = "ALLOW";
      reason = `All ${checks.length} gateway checks passed for ${tool.name}.`;
    }

    decisions.push(buildDecision(call, tool, checks, [...threatTypes], decision, risk, reason));
  }

  const decision = decisions.length
    ? mostRestrictive(...decisions.map((d) => d.decision))
    : "ALLOW";

  return {
    decisions,
    decision,
    deniedCount: decisions.filter((d) => d.decision === "BLOCK").length,
    approvalCount: decisions.filter((d) => d.decision === "REQUIRE_APPROVAL").length,
    threatTypes: [...new Set(decisions.flatMap((d) => d.threatTypes))],
    maxRiskTier,
    capExceeded,
  };
}

function scoreToolCall(p: {
  tool: ToolDefinitionContext;
  checks: ToolCheck[];
  capExceeded: boolean;
}): number {
  // Baseline from the tool's inherent blast radius.
  let score = (p.tool.riskTier - 1) * 12;

  const SEVERITY_POINTS: Record<Severity, number> = {
    CRITICAL: 42,
    HIGH: 24,
    MEDIUM: 10,
    LOW: 4,
    INFO: 0,
  };
  for (const check of p.checks) {
    if (!check.passed) score += SEVERITY_POINTS[check.severity];
  }
  if (p.capExceeded) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildDecision(
  call: ProposedToolCall,
  tool: ToolDefinitionContext | null,
  checks: ToolCheck[],
  threatTypes: ThreatType[],
  decision: Decision,
  riskScore: number,
  reason: string,
): ToolDecision {
  return {
    toolSlug: call.toolSlug,
    toolName: tool?.name ?? call.toolSlug,
    operation: call.operation,
    arguments: call.arguments,
    decision,
    riskScore,
    checks,
    reason,
    threatTypes,
  };
}

export { validateAgainstSchema } from "./schema";
