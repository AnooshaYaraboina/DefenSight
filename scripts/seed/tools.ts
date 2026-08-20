/**
 * Tool catalogue and per-agent grants (assessment §14).
 *
 * The gateway defaults closed: an agent may only invoke a tool it holds a grant
 * for, and only with the operations that grant names. Risk tiers run 1 (benign
 * lookup) to 5 (irreversible or externally-visible effect); tier alone does not
 * decide anything, but it is a heavily weighted input to the risk engine.
 *
 * Two grants below are deliberately over-broad. They are not mistakes — they
 * are the least-privilege findings the Agent Security view is meant to surface.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export async function seedTools(
  prisma: PrismaClient,
  agents: Record<string, string>,
) {
  const toolSpecs = [
    {
      slug: "doc-search", name: "Document Search", category: "SEARCH", riskTier: 1,
      description: "Semantic search across approved corporate knowledge bases.",
      operations: ["READ"], rateLimit: 120,
      parameterSchema: { type: "object", required: ["query"], properties: { query: { type: "string", maxLength: 512 }, topK: { type: "integer", minimum: 1, maximum: 20 } } },
    },
    {
      slug: "file-read", name: "File Read", category: "FILE", riskTier: 2,
      description: "Read a file from an approved document store path.",
      operations: ["READ"], rateLimit: 60,
      parameterSchema: { type: "object", required: ["path"], properties: { path: { type: "string", pattern: "^/(shared|docs|reports)/", maxLength: 256 } } },
    },
    {
      slug: "file-write", name: "File Write", category: "FILE", riskTier: 4,
      description: "Create or overwrite a file in the shared document store.",
      operations: ["WRITE", "DELETE"], rateLimit: 20, requiresApproval: true, approvalThreshold: 55,
      parameterSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string", pattern: "^/shared/", maxLength: 256 }, content: { type: "string", maxLength: 100000 } } },
    },
    {
      slug: "sql-query", name: "Warehouse Query", category: "DATABASE", riskTier: 3,
      description: "Run a read-only SQL query against the reporting warehouse.",
      operations: ["READ"], rateLimit: 40,
      parameterSchema: { type: "object", required: ["sql"], properties: { sql: { type: "string", maxLength: 4000 }, database: { type: "string", enum: ["reporting", "analytics"] } } },
    },
    {
      slug: "sql-write", name: "Warehouse Write", category: "DATABASE", riskTier: 5,
      description: "Execute a data-modifying statement against the warehouse.",
      operations: ["WRITE", "DELETE"], rateLimit: 5, requiresApproval: true, approvalThreshold: 40,
      parameterSchema: { type: "object", required: ["sql"], properties: { sql: { type: "string", maxLength: 4000 } } },
    },
    {
      slug: "crm-lookup", name: "CRM Lookup", category: "API", riskTier: 2,
      description: "Fetch a customer account record from the CRM.",
      operations: ["READ"], rateLimit: 90,
      parameterSchema: { type: "object", required: ["accountId"], properties: { accountId: { type: "string", pattern: "^ACC-[0-9]{6}$" } } },
    },
    {
      slug: "crm-update", name: "CRM Update", category: "API", riskTier: 4,
      description: "Modify a customer account record.",
      operations: ["WRITE"], rateLimit: 20, requiresApproval: true, approvalThreshold: 50,
      parameterSchema: { type: "object", required: ["accountId", "fields"], properties: { accountId: { type: "string", pattern: "^ACC-[0-9]{6}$" }, fields: { type: "object" } } },
    },
    {
      slug: "hris-lookup", name: "HRIS Employee Lookup", category: "API", riskTier: 4,
      description: "Retrieve an employee record, including compensation fields.",
      operations: ["READ"], rateLimit: 30,
      parameterSchema: { type: "object", required: ["employeeId"], properties: { employeeId: { type: "string", pattern: "^EMP-[0-9]{5}$" }, fields: { type: "array" } } },
    },
    {
      slug: "payments-api", name: "Payments API", category: "API", riskTier: 5,
      description: "Initiate or reverse a payment. Irreversible once settled.",
      operations: ["WRITE", "EXECUTE"], rateLimit: 5, requiresApproval: true, approvalThreshold: 30,
      parameterSchema: { type: "object", required: ["amount", "currency", "destination"], properties: { amount: { type: "number", minimum: 0, maximum: 1000000 }, currency: { type: "string", enum: ["USD", "EUR", "GBP"] }, destination: { type: "string" } } },
    },
    {
      slug: "web-search", name: "Web Search", category: "SEARCH", riskTier: 2,
      description: "Search the public web. Results are untrusted content.",
      operations: ["READ"], rateLimit: 60,
      parameterSchema: { type: "object", required: ["query"], properties: { query: { type: "string", maxLength: 256 } } },
    },
    {
      slug: "web-fetch", name: "Web Fetch", category: "SEARCH", riskTier: 3,
      description: "Fetch a URL. Restricted to an approved domain allowlist to prevent exfiltration.",
      operations: ["READ"], rateLimit: 30,
      allowedDomains: ["docs.northwind.example", "status.northwind.example", "developer.mozilla.org", "www.iso.org"],
      parameterSchema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", maxLength: 2048 } } },
    },
    {
      slug: "send-email", name: "Send Email", category: "EMAIL", riskTier: 5,
      description: "Send an email on behalf of the organisation. Leaves the trust boundary.",
      operations: ["EXECUTE"], rateLimit: 10, requiresApproval: true, approvalThreshold: 35,
      allowedDomains: ["northwind.example"],
      parameterSchema: { type: "object", required: ["to", "subject", "body"], properties: { to: { type: "string", format: "email" }, subject: { type: "string", maxLength: 200 }, body: { type: "string", maxLength: 20000 } } },
    },
    {
      slug: "slack-post", name: "Slack Post", category: "MESSAGING", riskTier: 3,
      description: "Post a message to an internal Slack channel.",
      operations: ["EXECUTE"], rateLimit: 30,
      parameterSchema: { type: "object", required: ["channel", "text"], properties: { channel: { type: "string", pattern: "^#[a-z0-9-]+$" }, text: { type: "string", maxLength: 4000 } } },
    },
    {
      slug: "report-generate", name: "Report Generator", category: "BUSINESS", riskTier: 2,
      description: "Render a finance or operations report from a template.",
      operations: ["EXECUTE"], rateLimit: 20,
      parameterSchema: { type: "object", required: ["template"], properties: { template: { type: "string" }, period: { type: "string" } } },
    },
    {
      slug: "jira-create", name: "Jira Issue Create", category: "BUSINESS", riskTier: 2,
      description: "Open a tracked work item.",
      operations: ["WRITE"], rateLimit: 30,
      parameterSchema: { type: "object", required: ["project", "summary"], properties: { project: { type: "string" }, summary: { type: "string", maxLength: 255 } } },
    },
    {
      slug: "code-exec", name: "Sandbox Code Execution", category: "CODE", riskTier: 5,
      description: "Execute code in an isolated sandbox. High blast radius if the sandbox is escaped.",
      operations: ["EXECUTE"], rateLimit: 10, requiresApproval: true, approvalThreshold: 45,
      parameterSchema: { type: "object", required: ["language", "source"], properties: { language: { type: "string", enum: ["python", "javascript", "sql"] }, source: { type: "string", maxLength: 20000 } } },
    },
    {
      slug: "deploy-service", name: "Service Deployment", category: "BUSINESS", riskTier: 5,
      description: "Deploy or roll back a production service.",
      operations: ["EXECUTE"], rateLimit: 5, requiresApproval: true, approvalThreshold: 25,
      parameterSchema: { type: "object", required: ["service", "action"], properties: { service: { type: "string" }, action: { type: "string", enum: ["deploy", "rollback", "restart"] }, version: { type: "string" } } },
    },
  ] as const;

  const tools: Record<string, string> = {};
  for (const spec of toolSpecs) {
    const t = await prisma.tool.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        category: spec.category,
        description: spec.description,
        operations: [...spec.operations],
        riskTier: spec.riskTier,
        requiresApproval: "requiresApproval" in spec ? spec.requiresApproval : false,
        approvalThreshold: "approvalThreshold" in spec ? spec.approvalThreshold : 70,
        rateLimitPerMinute: spec.rateLimit,
        parameterSchema: spec.parameterSchema,
        allowedDomains: "allowedDomains" in spec ? [...spec.allowedDomains] : undefined,
      },
    });
    tools[spec.slug] = t.id;
  }

  /* --------------------------------------------------------------- grants */
  // [agent, tool, operations, maxCallsPerRequest, justification]
  const grants: Array<[string, string, string[], number, string]> = [
    ["atlas-orchestrator", "doc-search", ["READ"], 5, "Primary knowledge lookup for employee questions."],
    ["atlas-orchestrator", "file-read", ["READ"], 3, "Open documents referenced in an answer."],
    ["atlas-orchestrator", "web-search", ["READ"], 2, "Supplement internal knowledge with public sources."],
    ["atlas-orchestrator", "jira-create", ["WRITE"], 1, "Raise tickets when an employee reports an issue."],
    ["atlas-orchestrator", "slack-post", ["EXECUTE"], 1, "Notify channels on request."],
    // Over-broad: granted during a pilot, never revoked. Surfaced as a
    // least-privilege finding because the orchestrator has never used it.
    ["atlas-orchestrator", "sql-query", ["READ"], 2, "Legacy pilot grant — retained pending review."],

    ["atlas-doc-summarizer", "doc-search", ["READ"], 4, "Retrieve the documents it summarises."],
    ["atlas-doc-summarizer", "file-read", ["READ"], 3, "Read full document bodies."],

    ["atlas-knowledge-retriever", "doc-search", ["READ"], 6, "Core retrieval function."],
    ["atlas-knowledge-retriever", "file-read", ["READ"], 4, "Fetch passages for ranking."],

    ["ledger-report-builder", "sql-query", ["READ"], 4, "Read warehouse metrics for reports."],
    ["ledger-report-builder", "report-generate", ["EXECUTE"], 2, "Render the report artefact."],
    ["ledger-report-builder", "file-write", ["WRITE"], 1, "Publish the finished report."],

    ["ledger-db-analyst", "sql-query", ["READ"], 6, "Answer ad-hoc finance questions."],
    ["ledger-db-analyst", "sql-write", ["WRITE"], 1, "Correct reconciliation errors under approval."],
    ["ledger-db-analyst", "report-generate", ["EXECUTE"], 2, "Produce supporting output."],

    ["talent-policy-advisor", "doc-search", ["READ"], 3, "Search HR policy documents."],

    ["talent-record-lookup", "hris-lookup", ["READ"], 2, "Retrieve records for authorised HR partners."],
    ["talent-record-lookup", "doc-search", ["READ"], 2, "Cross-reference policy alongside a record."],

    ["pulse-ticket-triage", "crm-lookup", ["READ"], 3, "Attach account context to a ticket."],
    ["pulse-ticket-triage", "jira-create", ["WRITE"], 2, "Escalate defects to engineering."],

    ["pulse-response-drafter", "crm-lookup", ["READ"], 3, "Personalise the reply."],
    ["pulse-response-drafter", "doc-search", ["READ"], 3, "Cite help-centre articles."],
    ["pulse-response-drafter", "send-email", ["EXECUTE"], 1, "Deliver the reply to the customer."],

    ["devops-runbook-agent", "doc-search", ["READ"], 4, "Search runbooks."],
    ["devops-runbook-agent", "file-read", ["READ"], 4, "Read configuration and playbooks."],
    ["devops-runbook-agent", "web-fetch", ["READ"], 2, "Consult vendor status pages."],
    // Over-broad: a read-only advisory agent holding sandbox execution.
    ["devops-runbook-agent", "code-exec", ["EXECUTE"], 1, "Added for a one-off migration in Q1. Not reviewed since."],

    ["devops-deploy-agent", "deploy-service", ["EXECUTE"], 1, "Perform approved deployments."],
    ["devops-deploy-agent", "slack-post", ["EXECUTE"], 2, "Announce deployment outcomes."],

    ["contract-clause-extractor", "doc-search", ["READ"], 4, "Locate contract passages."],
    ["contract-clause-extractor", "file-read", ["READ"], 4, "Read contract bodies."],
  ];

  for (const [agentSlug, toolSlug, operations, maxCalls, justification] of grants) {
    await prisma.toolGrant.create({
      data: {
        agentId: agents[agentSlug],
        toolId: tools[toolSlug],
        operations,
        maxCallsPerRequest: maxCalls,
        justification,
      },
    });
  }

  /* --------------------------------------------- declared data permissions */
  const permissions: Array<[string, string, string[], string, number]> = [
    ["atlas-orchestrator", "knowledge_base:corporate", ["READ"], "Answer employee questions.", 4820],
    ["atlas-orchestrator", "warehouse:reporting", ["READ"], "Legacy pilot grant.", 0],
    ["atlas-doc-summarizer", "knowledge_base:corporate", ["READ"], "Summarise retrieved documents.", 3110],
    ["atlas-knowledge-retriever", "knowledge_base:corporate", ["READ"], "Retrieval.", 9640],
    ["ledger-report-builder", "warehouse:reporting", ["READ"], "Report metrics.", 1870],
    ["ledger-db-analyst", "warehouse:reporting", ["READ", "WRITE"], "Ad-hoc analysis and corrections.", 940],
    ["talent-policy-advisor", "knowledge_base:hr_policy", ["READ"], "Policy answers.", 2260],
    ["talent-record-lookup", "hris:employee_records", ["READ"], "Authorised record retrieval.", 410],
    ["pulse-ticket-triage", "crm:accounts", ["READ"], "Ticket context.", 5330],
    ["pulse-response-drafter", "crm:accounts", ["READ"], "Reply personalisation.", 4180],
    ["devops-runbook-agent", "knowledge_base:runbooks", ["READ"], "Operational answers.", 1520],
    ["devops-runbook-agent", "sandbox:execution", ["EXECUTE"], "One-off Q1 migration.", 3],
    ["devops-deploy-agent", "infrastructure:services", ["EXECUTE"], "Approved deployments.", 260],
    ["contract-clause-extractor", "knowledge_base:contracts", ["READ"], "Clause extraction.", 780],
  ];

  for (const [agentSlug, resource, actions, justification, useCount] of permissions) {
    await prisma.agentPermission.create({
      data: { agentId: agents[agentSlug], resource, actions, justification, useCount },
    });
  }

  return tools;
}
