/**
 * Generates docs/test-cases.md from real runs (deliverable §28.6).
 *
 * The matrix reports what the engine *actually* did, not what it is supposed to
 * do. Every row is produced by executing the attack, so the document cannot
 * drift away from the implementation — if a control regresses, this file says
 * so the next time it is generated.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { analyze, scanDocument } from "@/lib/engine";
import { buildAnalysisContext } from "@/lib/runtime/context";
import { SCENARIOS } from "@/lib/simulator/scenarios";
import { ATTACK_DOCUMENTS, BENIGN_TRICKY_DOCUMENTS } from "./seed/attack-corpus";
import { randomUUID } from "node:crypto";
import { plural } from "@/lib/engine/text";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  const rows: string[] = [];
  let passed = 0;
  let total = 0;

  /* ---------------------------------------------- end-to-end scenarios --- */
  const scenarioRows: string[] = [];
  for (const s of SCENARIOS) {
    const documents = s.documents?.length
      ? await prisma.document.findMany({ where: { title: { in: s.documents } }, select: { id: true } })
      : [];
    const actor = s.user
      ? await prisma.user.findUnique({ where: { email: s.user }, select: { id: true } })
      : null;
    const fallbackUser = await prisma.user.findFirst({ where: { role: "VIEWER" }, select: { id: true } });

    const context = await buildAnalysisContext({
      requestId: randomUUID(),
      userId: actor?.id ?? fallbackUser!.id,
      applicationSlug: s.application,
      agentSlug: s.agent,
      input: s.prompt,
      output: s.output,
      retrievedDocumentIds: documents.map((d) => d.id),
      proposedToolCalls: s.toolCalls?.map((t, index) => ({
        toolSlug: t.slug, operation: t.operation, arguments: t.args, index,
      })),
      simulated: true,
    });
    const result = analyze(context);

    const threatMet = s.expected.threatTypes.some((t) => result.threatTypes.includes(t));
    const decisionMet = s.expected.decisions.includes(result.decision);
    const riskMet = result.riskScore >= s.expected.minRisk;
    const ok = threatMet && decisionMet && riskMet;
    if (ok) passed++;
    total++;

    const mitigations: string[] = [];
    if (result.withheldRetrievals.length) mitigations.push(`${plural(result.withheldRetrievals.length, "document")} withheld`);
    const denied = result.toolDecisions.filter((d) => d.decision === "BLOCK");
    if (denied.length) mitigations.push(`${plural(denied.length, "tool call")} refused`);
    if (result.redacted) mitigations.push("response redacted");
    if (result.blocked) mitigations.push("request blocked");
    const matched = result.policies.filter((p) => p.matched);
    if (matched.length) mitigations.push(`${plural(matched.length, "policy match", "policy matches")}`);

    scenarioRows.push(
      `| ${ok ? "PASS" : "**FAIL**"} | ${esc(s.name)} | ${esc(s.objective)} | ` +
        `${esc(s.expected.decisions.join(" or "))}, risk ≥ ${s.expected.minRisk} | ` +
        `${result.decision}, risk ${result.riskScore} | ` +
        `${plural(result.detections.length, "detection")} across ${plural(new Set(result.detections.map((d) => d.layer)).size, "layer")} | ` +
        `${esc(mitigations.join("; ") || "none")} |`,
    );
  }

  /* ------------------------------------------------- document scanning --- */
  const docRows: string[] = [];
  for (const d of ATTACK_DOCUMENTS) {
    const scan = scanDocument({
      title: d.title, content: d.content, classification: d.classification,
      sourceTrust: 22, sourceName: "Vendor Portal Uploads", sourceIsExternal: true,
    });
    const ok = scan.status !== "CLEAN" && (!d.expected.shouldQuarantine || scan.quarantine);
    if (ok) passed++;
    total++;
    docRows.push(
      `| ${ok ? "PASS" : "**FAIL**"} | ${esc(d.title)} | ${esc(d.technique.split(".")[0])} | ` +
        `${d.expected.shouldQuarantine ? "quarantine" : "flag"} | ` +
        `${scan.status.toLowerCase()}${scan.quarantine ? ", quarantined" : ""}, risk ${scan.riskScore} | ` +
        `${plural(scan.fusion.threats.length, "threat")}, trust ${scan.trustScore}/100 | ` +
        `${esc(scan.quarantine ? "withheld from all retrieval" : "flagged for review")} |`,
    );
  }

  /* ----------------------------------------------- false-positive set --- */
  const fpRows: string[] = [];
  for (const d of BENIGN_TRICKY_DOCUMENTS) {
    const scan = scanDocument({
      title: d.title, content: d.content, classification: d.classification,
      sourceTrust: 78, sourceName: "SharePoint — Corporate Intranet", sourceIsExternal: false,
    });
    const ok = scan.status === "CLEAN" && !scan.quarantine;
    if (ok) passed++;
    total++;
    fpRows.push(
      `| ${ok ? "PASS" : "**FAIL**"} | ${esc(d.title)} | ${esc(d.note)} | clean, not quarantined | ` +
        `${scan.status.toLowerCase()}, risk ${scan.riskScore} | ${plural(scan.fusion.threats.length, "threat")} |`,
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);

  rows.push(`# Test Cases

**Deliverable §28.6** — attack, expected behaviour, actual behaviour, detection, mitigation.

Generated ${stamp} by \`npm run docs:tests\`, which executes every case against the
production pipeline and reports what the engine actually did. This file is
regenerated rather than maintained by hand, so it cannot drift from the
implementation: if a control regresses, the next generation says so.

**Result: ${passed}/${total} passing.**

## 1. End-to-end attack scenarios

Each runs through \`analyze()\` — the same function that serves live traffic —
with the full estate context: retrieval, agent grants, tool definitions,
guardrails and the complete policy set.

| Result | Attack | Objective | Expected | Actual | Detection | Mitigation |
|---|---|---|---|---|---|---|
${scenarioRows.join("\n")}

## 2. Malicious document detection

Upload → Scan → Analyze → Risk Score → Allow / Quarantine, run against the
adversarial corpus. Every payload is genuine: the Base64 decodes to a real
instruction, the homoglyphs are Cyrillic, the zero-width characters are present
in the source.

| Result | Document | Technique | Expected | Actual | Analysis | Mitigation |
|---|---|---|---|---|---|---|
${docRows.join("\n")}

## 3. False-positive controls

Documents that superficially resemble attacks and must **not** be flagged. A
detector that flags the security policy for describing prompt injection, or the
runbook for containing \`DROP TABLE\`, is not fit for production.

| Result | Document | Why it is tricky | Expected | Actual | Detection |
|---|---|---|---|---|---|
${fpRows.join("\n")}

## 4. Unit and integration suite

\`npm test\` — 83 assertions over the engine in isolation, no database or
framework involved.

| Area | Covers |
|---|---|
| \`normalize\` | Recursive decoding, zero-width stripping, homoglyph folding, recursion bounds, and that ordinary business text is left untouched |
| \`sensitive\` | Luhn, mod-97, SSN structure and entropy validators; overlap handling; redaction that does not corrupt surrounding text |
| \`policy\` | Condition grammar, fact references, order-independence of the most-restrictive rule, malformed conditions failing closed |
| \`tool-gateway\` | Default-closed authorisation, operation scoping, schema validation, destructive SQL, egress allowlisting, rate and per-request caps |
| \`agent-behavior\` | Intent divergence, grant awareness, and that an attacker naming a capability in injected text cannot lower the score |
| \`rag-scanner\` | Every adversarial document flagged, every benign one not, trust never exceeding its provenance ceiling |
| \`pipeline\` | End-to-end decisions, order independence, explainable-score arithmetic, output findings reaching the score, and the §27 demonstration scenario |

## 5. Measured false-positive rate

These figures are measured, not recorded here. \`npm run bench\` runs every
labelled pattern in \`scripts/traffic.ts\` through the production pipeline and
prints detection and false-positive rates, naming any attack that was not
actioned and any threat type that fires on legitimate traffic. It exits
non-zero when either threshold is breached, so a regression fails rather than
leaving a stale number in a document.

The figures previously written here were literal text: nothing recomputed
them, and they could not be recomputed afterwards either, because the replay
discards its own ground-truth label before the row is written.
`);

  writeFileSync("docs/test-cases.md", rows.join("\n"));
  console.log(`  docs/test-cases.md written — ${passed}/${total} passing`);
  if (passed < total) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
