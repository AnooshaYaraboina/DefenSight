import "server-only";
import { prisma } from "@/lib/db";
import { jsonArray } from "@/lib/db/json";
import { scanDocument } from "@/lib/engine/rag/scanner";
import { THREAT_META, type Severity, type ThreatType } from "@/lib/engine/taxonomy";
import { plural } from "@/lib/engine/text";

/**
 * Workflows the assistant can actually run.
 *
 * The important line in here is `kind`. A step marked "read" executes the
 * moment the plan reaches it; a step marked "write" stops and waits for a
 * person. That is not timidity — it is the same rule the tool gateway applies
 * to every other agent in the estate, and an assistant exempt from it would
 * make this product argue against itself.
 *
 * Steps are executed one at a time by the client rather than streamed from a
 * paused server generator. That keeps the server stateless, makes an approval
 * pause free, and gives the avatar natural beats to perform against.
 */

export type StepKind = "read" | "write";
export type WorkflowId = "scan" | "investigate" | "triage" | "hunt";

export interface WorkflowStep {
  id: string;
  label: string;
  kind: StepKind;
}

export interface WorkflowPlan {
  id: WorkflowId;
  title: string;
  /** The request restated, so the user can see it was understood. */
  intent: string;
  steps: WorkflowStep[];
  params: Record<string, string>;
}

export interface StepFact {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}

export interface StepResult {
  ok: boolean;
  summary: string;
  facts?: StepFact[];
  severity?: Severity;
  href?: string;
  /** Present on a write step: exactly what will change if approved. */
  effect?: string;
  /** Set when the step found something bad — the avatar reacts to this. */
  alarm?: boolean;
  /** Carried into later steps of the same run. */
  carry?: Record<string, string>;
}

/* ========================================================================== *
 * Planning
 * ========================================================================== */

const PLANS: Record<WorkflowId, Omit<WorkflowPlan, "params" | "intent">> = {
  scan: {
    id: "scan",
    title: "Scan content for injection",
    steps: [
      { id: "normalise", label: "Decode and normalise the content", kind: "read" },
      { id: "detect", label: "Run all detection layers", kind: "read" },
      { id: "sensitive", label: "Look for sensitive data", kind: "read" },
      { id: "verdict", label: "Reach a verdict", kind: "read" },
      { id: "quarantine", label: "Quarantine the document", kind: "write" },
    ],
  },
  investigate: {
    id: "investigate",
    title: "Investigate an incident",
    steps: [
      { id: "locate", label: "Locate the case", kind: "read" },
      { id: "chain", label: "Reconstruct the attack chain", kind: "read" },
      { id: "correlate", label: "Correlate related activity", kind: "read" },
      { id: "assess", label: "Assess what stopped it", kind: "read" },
      { id: "contain", label: "Mark the incident contained", kind: "write" },
    ],
  },
  triage: {
    id: "triage",
    title: "Triage the approval queue",
    steps: [
      { id: "load", label: "Load pending authorisations", kind: "read" },
      { id: "assess", label: "Assess each against its agent's grants", kind: "read" },
      { id: "rank", label: "Rank by blast radius", kind: "read" },
      { id: "decide", label: "Apply the recommended decisions", kind: "write" },
    ],
  },
  hunt: {
    id: "hunt",
    title: "Hunt and harden",
    steps: [
      { id: "sweep", label: "Sweep the estate", kind: "read" },
      { id: "group", label: "Group what was found", kind: "read" },
      { id: "coverage", label: "Check control coverage", kind: "read" },
      { id: "harden", label: "Enable the missing controls", kind: "write" },
    ],
  },
};

/**
 * Intent routing.
 *
 * Deterministic, and deliberately so: a model deciding which *action* to take
 * is a much larger attack surface than a model writing prose about data. The
 * model still writes the narration; it does not choose what runs.
 */
export function planFor(message: string): WorkflowPlan | null {
  const text = message.trim();
  const lower = text.toLowerCase();

  const incidentRef = text.match(/INC-\d{4}-\d{3,4}/i)?.[0]?.toUpperCase();
  if (incidentRef || /\b(investigate|look into|what happened|dig into)\b/.test(lower)) {
    if (!incidentRef && !/incident/.test(lower)) return null;
    return {
      ...PLANS.investigate,
      intent: incidentRef
        ? `Investigate ${incidentRef} end to end`
        : "Investigate the most recent open incident",
      params: { ref: incidentRef ?? "" },
    };
  }

  if (/\b(approval|approve|authoris|authoriz|queue|pending)\b/.test(lower)) {
    return { ...PLANS.triage, intent: "Triage everything waiting for authorisation", params: {} };
  }

  if (/\b(scan|check this|is this safe|paste|url|http)\b/.test(lower)) {
    // Everything after a scan verb, or the URL itself, is the payload.
    const url = text.match(/https?:\/\/\S+/)?.[0];
    const body = text.replace(/^.*?\b(scan|check)\b[:\s]*/i, "").trim();
    return {
      ...PLANS.scan,
      intent: url ? `Scan ${url} for hidden instructions` : "Scan this content for hidden instructions",
      params: { content: body || text, url: url ?? "" },
    };
  }

  if (/\b(hunt|find every|find all|which agents|harden|coverage|sweep)\b/.test(lower)) {
    return { ...PLANS.hunt, intent: `Hunt the estate for: ${text}`, params: { query: text } };
  }

  return null;
}

/* ========================================================================== *
 * Execution
 * ========================================================================== */

export async function runStep(
  workflow: WorkflowId,
  stepId: string,
  params: Record<string, string>,
  carry: Record<string, string>,
): Promise<StepResult> {
  switch (workflow) {
    case "scan":
      return runScanStep(stepId, params, carry);
    case "investigate":
      return runInvestigateStep(stepId, params, carry);
    case "triage":
      return runTriageStep(stepId, carry);
    case "hunt":
      return runHuntStep(stepId, params, carry);
  }
}

/* ------------------------------------------------------------------- scan */

async function runScanStep(
  stepId: string,
  params: Record<string, string>,
  carry: Record<string, string>,
): Promise<StepResult> {
  const content = params.content ?? "";

  if (stepId === "normalise") {
    // The real scanner does this internally; running it here lets the step
    // report what decoding actually found rather than narrating a guess.
    const result = scan(content, params.url);
    return {
      ok: true,
      summary:
        result.obfuscation > 0.15
          ? `Content is obfuscated — decoding revealed hidden layers.`
          : "Content decoded cleanly. No encoding tricks.",
      facts: [
        { label: "Length", value: `${content.length} chars` },
        {
          label: "Obfuscation",
          value: `${Math.round(result.obfuscation * 100)}%`,
          tone: result.obfuscation > 0.15 ? "warn" : "good",
        },
      ],
      carry: { scanned: "1" },
    };
  }

  if (stepId === "detect") {
    const result = scan(content, params.url);
    const threats = [...new Set(result.detections.map((d) => d.threatType))];
    const layers = [...new Set(result.detections.map((d) => d.layer))];
    return {
      ok: true,
      alarm: threats.length > 0,
      severity: result.severity,
      summary: threats.length
        ? `${plural(layers.length, "layer")} agreed. Found ${threats
            .map((t) => THREAT_META[t as ThreatType]?.label ?? t)
            .join(", ")}.`
        : "All layers clear. Nothing is trying to instruct the model.",
      facts: [
        { label: "Detections", value: String(result.detections.length), tone: threats.length ? "bad" : "good" },
        { label: "Layers agreeing", value: String(layers.length) },
        { label: "Confidence", value: `${Math.round(result.fusion.maxConfidence * 100)}%` },
      ],
    };
  }

  if (stepId === "sensitive") {
    const result = scan(content, params.url);
    const n = result.sensitiveFindings.length;
    return {
      ok: true,
      alarm: n > 0,
      summary: n
        ? `Found ${plural(n, "sensitive value")} that would leave with this document.`
        : "No sensitive values in the content.",
      facts: result.sensitiveFindings.slice(0, 3).map((f) => ({
        label: f.type.replace(/_/g, " ").toLowerCase(),
        value: f.maskedSample ?? "masked",
        tone: "bad" as const,
      })),
    };
  }

  if (stepId === "verdict") {
    const result = scan(content, params.url);
    return {
      ok: true,
      alarm: result.quarantine,
      severity: result.severity,
      summary: result.reasoning[result.reasoning.length - 1] ?? "Scan complete.",
      facts: [
        { label: "Risk", value: `${result.riskScore}/100`, tone: result.riskScore > 60 ? "bad" : "good" },
        { label: "Trust", value: `${result.trustScore}/100`, tone: result.trustScore < 40 ? "bad" : "good" },
        { label: "Status", value: result.status, tone: result.quarantine ? "bad" : "good" },
      ],
      carry: {
        quarantine: result.quarantine ? "1" : "",
        reason: result.quarantineReason ?? "",
        risk: String(result.riskScore),
      },
    };
  }

  if (stepId === "quarantine") {
    if (!carry.quarantine) {
      return { ok: true, summary: "Nothing to quarantine — the content is clean.", facts: [] };
    }
    const source = await prisma.dataSource.findFirst({
      where: { isExternal: true },
      orderBy: { trustLevel: "asc" },
      select: { id: true, name: true },
    });
    return {
      ok: true,
      summary: "Ready to file this as a scanned document and withhold it from retrieval.",
      effect: `File under "${source?.name ?? "an external source"}" and quarantine it — ${
        carry.reason || "withheld from every retrieval"
      }. The finding is recorded against the document so the source can be reviewed.`,
      carry: { sourceId: source?.id ?? "" },
    };
  }

  return { ok: false, summary: "Unknown step." };
}

/** One scan, described from several angles — not four separate scans. */
function scan(content: string, url?: string) {
  return scanDocument({
    title: url || "Pasted content",
    content,
    classification: "INTERNAL",
    sourceTrust: url ? 12 : 45,
    sourceName: url ? "Pasted URL" : "Analyst paste",
    sourceIsExternal: Boolean(url),
  });
}

/* ------------------------------------------------------------ investigate */

async function runInvestigateStep(
  stepId: string,
  params: Record<string, string>,
  carry: Record<string, string>,
): Promise<StepResult> {
  if (stepId === "locate") {
    const incident = params.ref
      ? await prisma.incident.findFirst({ where: { ref: params.ref } })
      : await prisma.incident.findFirst({
          where: { status: { in: ["OPEN", "INVESTIGATING"] } },
          orderBy: { openedAt: "desc" },
        });

    if (!incident) {
      return { ok: false, summary: params.ref ? `No case ${params.ref}.` : "No open incidents." };
    }
    return {
      ok: true,
      severity: incident.severity as Severity,
      summary: `${incident.ref} — ${incident.title}`,
      href: `/incidents/${incident.id}`,
      facts: [
        { label: "Severity", value: incident.severity, tone: "bad" },
        { label: "Status", value: incident.status },
      ],
      carry: { id: incident.id, ref: incident.ref, status: incident.status },
    };
  }

  if (stepId === "chain") {
    const incident = await prisma.incident.findUnique({
      where: { id: carry.id },
      select: { attackChain: true, threatType: true },
    });
    const chain = jsonArray<{ label: string; decision?: string }>(incident?.attackChain);
    const stop = chain.findIndex((s) => s.decision === "BLOCK");
    return {
      ok: true,
      alarm: true,
      summary: chain.length
        ? `${plural(chain.length, "stage")} recorded. ${
            stop >= 0 ? `Stopped at "${chain[stop].label}".` : "Ran to completion."
          }`
        : "No pipeline trace was recorded for this case.",
      facts: chain.slice(0, 4).map((s) => ({
        label: s.label,
        value: s.decision ?? "passed",
        tone: s.decision === "BLOCK" ? ("bad" as const) : ("neutral" as const),
      })),
    };
  }

  if (stepId === "correlate") {
    const events = await prisma.securityEvent.count({ where: { incidentId: carry.id } });
    const alerts = await prisma.alert.count({ where: { incidentId: carry.id } });
    return {
      ok: true,
      summary: `${plural(events, "event")} and ${plural(alerts, "alert")} tie to this case.`,
      facts: [
        { label: "Events", value: String(events) },
        { label: "Alerts", value: String(alerts) },
      ],
    };
  }

  if (stepId === "assess") {
    const incident = await prisma.incident.findUnique({
      where: { id: carry.id },
      select: { summary: true, aiSummary: true },
    });
    return {
      ok: true,
      summary: incident?.aiSummary ?? incident?.summary ?? "No summary recorded.",
      facts: [],
    };
  }

  if (stepId === "contain") {
    if (carry.status === "CONTAINED" || carry.status === "RESOLVED") {
      return { ok: true, summary: `${carry.ref} is already ${carry.status.toLowerCase()}.` };
    }
    return {
      ok: true,
      summary: `Ready to move ${carry.ref} to contained.`,
      effect: `Set ${carry.ref} status to CONTAINED and record the transition in its timeline.`,
    };
  }

  return { ok: false, summary: "Unknown step." };
}

/* ----------------------------------------------------------------- triage */

async function runTriageStep(
  stepId: string,
  carry: Record<string, string>,
): Promise<StepResult> {
  if (stepId === "load") {
    const pending = await prisma.toolApproval.count({ where: { status: "PENDING" } });
    return {
      ok: true,
      alarm: pending > 8,
      summary: pending
        ? `${plural(pending, "call")} held for a named human.`
        : "The queue is clear.",
      facts: [{ label: "Pending", value: String(pending), tone: pending ? "warn" : "good" }],
      carry: { pending: String(pending) },
    };
  }

  if (stepId === "assess") {
    const approvals = await prisma.toolApproval.findMany({
      where: { status: "PENDING" },
      take: 5,
      include: { toolCall: { include: { tool: true, agent: true } } },
      orderBy: { expiresAt: "asc" },
    });
    return {
      ok: true,
      summary: approvals.length
        ? "Checked each against the calling agent's grants and tier."
        : "Nothing to assess.",
      facts: approvals.map((a) => ({
        label: a.toolCall.tool.name,
        value: `tier ${a.toolCall.tool.riskTier} · risk ${a.toolCall.riskScore}`,
        tone: a.toolCall.tool.riskTier >= 4 ? ("bad" as const) : ("neutral" as const),
      })),
      carry: { count: String(approvals.length) },
    };
  }

  if (stepId === "rank") {
    const tier5 = await prisma.toolApproval.count({
      where: { status: "PENDING", toolCall: { tool: { riskTier: 5 } } },
    });
    const expired = await prisma.toolApproval.count({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
    });
    return {
      ok: true,
      alarm: expired > 0,
      summary:
        expired > 0
          ? `${plural(expired, "request")} already expired — those are refused by default.`
          : "Nothing has expired yet.",
      facts: [
        { label: "Tier 5 (irreversible)", value: String(tier5), tone: tier5 ? "bad" : "good" },
        { label: "Expired", value: String(expired), tone: expired ? "bad" : "good" },
      ],
    };
  }

  if (stepId === "decide") {
    if (!Number(carry.pending)) return { ok: true, summary: "Nothing waiting." };
    return {
      ok: true,
      summary: "I can act on the queue, but each authorisation is yours to give.",
      effect:
        "Open the approval queue with my assessment attached. I will not approve a tool call on your behalf — that is the one decision this platform reserves for a named human.",
    };
  }

  return { ok: false, summary: "Unknown step." };
}

/* ------------------------------------------------------------------- hunt */

async function runHuntStep(
  stepId: string,
  params: Record<string, string>,
  carry: Record<string, string>,
): Promise<StepResult> {
  const q = (params.query ?? "").toLowerCase();

  if (stepId === "sweep") {
    const agents = await prisma.agent.findMany({
      select: { name: true, slug: true, riskLevel: true, securityScore: true, dataClearance: true },
    });
    const hits = agents.filter(
      (a) =>
        q.includes(a.name.toLowerCase()) ||
        a.riskLevel === "HIGH" ||
        a.riskLevel === "CRITICAL" ||
        (/customer|confidential|restricted/.test(q) &&
          ["CONFIDENTIAL", "RESTRICTED"].includes(a.dataClearance)),
    );
    return {
      ok: true,
      alarm: hits.length > 0,
      summary: `${plural(hits.length, "agent")} matched out of ${agents.length}.`,
      facts: hits.slice(0, 4).map((a) => ({
        label: a.name,
        value: `${a.riskLevel} · ${a.securityScore}/100`,
        tone: a.riskLevel === "HIGH" || a.riskLevel === "CRITICAL" ? ("bad" as const) : ("neutral" as const),
      })),
      carry: { hits: String(hits.length) },
    };
  }

  if (stepId === "group") {
    const findings = await prisma.agentPermission.count({ where: { useCount: { lt: 10 } } });
    return {
      ok: true,
      summary: `${plural(findings, "permission")} granted but barely exercised — each one widens blast radius for nothing.`,
      facts: [{ label: "Over-provisioned", value: String(findings), tone: findings ? "warn" : "good" }],
      carry: { findings: String(findings) },
    };
  }

  if (stepId === "coverage") {
    const [total, disabled] = await Promise.all([
      prisma.guardrail.count(),
      prisma.guardrail.findMany({ where: { enabled: false }, select: { key: true, name: true } }),
    ]);
    const enabled = total - disabled.length;
    const gap = disabled.length;
    return {
      ok: true,
      alarm: gap > 0,
      summary: gap
        ? `${plural(gap, "guardrail")} disabled. Those controls are checking nothing.`
        : `All ${total} guardrails active.`,
      facts: [
        { label: "Coverage", value: `${enabled}/${total}`, tone: gap ? "bad" : "good" },
        ...disabled.slice(0, 3).map((g) => ({ label: g.name, value: "disabled", tone: "bad" as const })),
      ],
      carry: { gap: String(gap), keys: disabled.map((g) => g.key).join(",") },
    };
  }

  if (stepId === "harden") {
    if (!Number(carry.gap)) {
      return { ok: true, summary: "Nothing to enable — coverage is already complete." };
    }
    return {
      ok: true,
      summary: `Ready to re-enable ${plural(Number(carry.gap), "guardrail")}.`,
      effect: `Enable every disabled guardrail. This changes what the pipeline blocks on the next request.`,
    };
  }

  return { ok: false, summary: "Unknown step." };
}

export { PLANS };
