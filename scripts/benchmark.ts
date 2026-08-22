/**
 * Detection benchmark.
 *
 * Measures what the README claims rather than restating it. The figures on the
 * landing page and in docs/test-cases.md used to be literal text — nothing
 * recomputed them, so a regression would have left the claim standing.
 *
 * They also could not be recomputed after the fact: the historical replay knows
 * whether it is sending an attack, but SecurityEvent has no ground-truth column,
 * so the label is gone by the time the row is written. This script keeps the
 * label instead of discarding it.
 *
 * Method
 * ------
 * Every labelled pattern in scripts/traffic.ts goes through the production
 * pipeline: buildAnalysisContext -> analyze. That is the same path live traffic,
 * the simulator and the replay take, minus persistence — persistAnalysis is
 * simply not called, so a benchmark run leaves no rows behind and can be run
 * against a live database.
 *
 * traffic.ts is deliberately the measurement set. It is held out: the semantic
 * layer scores against detectors/corpus.ts, so benchmarking on that corpus would
 * be scoring a model on its own reference data and would report a meaningless
 * ~100%.
 *
 * Coverage is exhaustive, not sampled. The replay picks patterns at random and
 * weights attacks by likelihood; here every attack pattern and every benign
 * prompt runs exactly once, so a miss is a named pattern rather than a number.
 *
 * One caveat the run prints for itself: behavioural signals read a principal's
 * trailing hour from the database, so the result is not independent of what the
 * database has just been doing. A burst of manual testing beforehand attributes
 * those threats to the principals the benchmark then reuses, and ordinary
 * requests start looking anomalous. The ambient line below reports how much
 * traffic landed in that window, so a noisy run is visible rather than mistaken
 * for a detection defect. Re-seed before trusting a surprising result.
 */
import { buildAnalysisContext } from "@/lib/runtime/context";
import { analyze } from "@/lib/engine";
import type { AnalysisResult } from "@/lib/engine/types";
import { prisma } from "@/lib/db";
import { ATTACK_TRAFFIC, BENIGN_TRAFFIC } from "./traffic";

/** Detection is required to stay at or above this. */
const MIN_DETECTION_RATE = 0.9;
/** A benign request being blocked or redacted is a failure at any rate above this. */
const MAX_FALSE_POSITIVE_RATE = 0.0;
/** Share of benign traffic a threat type may fire on before it stops discriminating. */
const NOISE_THRESHOLD = 0.5;

const RANK: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

/** Every way the pipeline can act on a request, in the order worth reporting. */
function mitigations(result: AnalysisResult): string[] {
  const out: string[] = [];
  if (result.blocked) out.push("blocked");
  if (result.redacted) out.push("redacted");
  if (result.decision === "REQUIRE_APPROVAL") out.push("approval required");
  if (result.withheldRetrievals.length) out.push(`${result.withheldRetrievals.length} withheld`);
  const refused = result.toolDecisions.filter((t) => t.decision === "BLOCK");
  if (refused.length) out.push(`${refused.length} tool refused`);
  return out;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function bar(value: number, width = 22): string {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

interface Row {
  label: string;
  detail: string;
  risk: number;
  threats: number;
  actions: string[];
  types: string[];
  /** For an attack: was it actioned. For a benign request: was it wrongly actioned. */
  ok: boolean;
}

async function main() {
  const started = Date.now();

  /* ------------------------------------------------------------ fixtures */
  const [users, documents] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, role: true, clearance: true } }),
    prisma.document.findMany({ select: { id: true, title: true, classification: true } }),
  ]);

  if (!users.length || !documents.length) {
    console.error("  No estate found. Run `npm run db:seed` first.");
    process.exitCode = 1;
    return;
  }

  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  const docByTitle = new Map(documents.map((d) => [d.title, d.id]));
  const docClass = new Map(documents.map((d) => [d.id, d.classification as string]));
  const requesters = users.filter((u) => u.role === "VIEWER");

  const resolveDocs = (titles?: string[]) =>
    titles?.map((t) => docByTitle.get(t)).filter((id): id is string => Boolean(id));

  /* Route each benign request to someone actually cleared for what it reads.
     Sending a random employee at a restricted document would manufacture a
     clearance breach on every benign case — the engine behaving correctly
     against a scenario no real organisation produces. This mirrors the replay. */
  /* Rotate through eligible requesters instead of reusing one. Behavioural
     signals key off a principal's trailing history, so sending all 44 benign
     prompts as the same person concentrates every past threat in the database
     onto that one principal and makes their next ordinary request look
     anomalous. The replay spreads traffic across people; so does this. */
  let turn = 0;
  const requesterFor = (documentIds?: string[]) => {
    const eligible = !documentIds?.length
      ? requesters
      : requesters.filter((u) => {
          const required = Math.max(
            ...documentIds.map((id) => RANK[docClass.get(id) ?? "PUBLIC"] ?? 0),
          );
          return (RANK[u.clearance] ?? 0) >= required;
        });
    const pool = eligible.length ? eligible : requesters.length ? requesters : users;
    return pool[turn++ % pool.length].id;
  };

  const run = async (req: Parameters<typeof buildAnalysisContext>[0]) =>
    analyze(await buildAnalysisContext(req));

  /* -------------------------------------------------------- attack sweep */
  const recent = await prisma.securityEvent.count({
    where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });

  console.log("\n  DefenSight detection benchmark");
  console.log(`  ${ATTACK_TRAFFIC.length} attack patterns · ` +
    `${BENIGN_TRAFFIC.reduce((n, p) => n + p.prompts.length, 0)} benign prompts · ` +
    "production pipeline, nothing persisted");
  console.log(`  ambient: ${recent} event(s) in the trailing hour` +
    (recent > 100
      ? " — heavy recent traffic inflates behavioural signals; re-seed for a clean reading"
      : "") + "\n");

  const attackRows: Row[] = [];
  for (const attack of ATTACK_TRAFFIC) {
    const result = await run({
      requestId: `bench-attack-${attack.key}`,
      userId: (attack.user ? userByEmail.get(attack.user) : undefined) ?? requesterFor(),
      applicationSlug: attack.app,
      agentSlug: attack.agent,
      input: attack.prompt,
      output: attack.output,
      retrievedDocumentIds: resolveDocs(attack.docTitles),
      proposedToolCalls: attack.tools?.map((t, index) => ({
        toolSlug: t.slug,
        operation: t.operation,
        arguments: t.args,
        index,
      })),
    });
    const actions = mitigations(result);
    attackRows.push({
      label: attack.key,
      detail: attack.prompt.slice(0, 46).replace(/\s+/g, " "),
      risk: result.riskScore,
      threats: result.threatTypes.length,
      actions,
      types: result.threatTypes,
      ok: actions.length > 0,
    });
  }

  /* -------------------------------------------------------- benign sweep */
  const benignRows: Row[] = [];
  for (const pattern of BENIGN_TRAFFIC) {
    for (const prompt of pattern.prompts) {
      const retrievedDocumentIds = resolveDocs(pattern.docTitles?.slice(0, 1));
      const result = await run({
        requestId: `bench-benign-${benignRows.length}`,
        userId: requesterFor(retrievedDocumentIds),
        applicationSlug: pattern.app,
        agentSlug: pattern.agent,
        input: prompt,
        retrievedDocumentIds,
        proposedToolCalls: pattern.tools?.map((t, index) => ({
          toolSlug: t.slug,
          operation: t.operation,
          arguments: t.args,
          index,
        })),
      });
      /* A false positive is an action taken against legitimate work. Naming a
         threat without acting is a lead, not a failure — the console shows it
         and nobody is stopped. Only blocking or redaction interrupts someone. */
      const harmful = result.blocked || result.redacted;
      benignRows.push({
        label: pattern.agent,
        detail: prompt.slice(0, 46).replace(/\s+/g, " "),
        risk: result.riskScore,
        threats: result.threatTypes.length,
        actions: mitigations(result),
        types: result.threatTypes,
        ok: !harmful,
      });
    }
  }

  /* -------------------------------------------------------------- report */
  const caught = attackRows.filter((r) => r.ok);
  const missed = attackRows.filter((r) => !r.ok);
  const falsePositives = benignRows.filter((r) => !r.ok);
  const flaggedNotBlocked = benignRows.filter((r) => r.ok && r.threats > 0);

  const detectionRate = caught.length / attackRows.length;
  const fpRate = falsePositives.length / benignRows.length;

  /* A threat type that fires on most legitimate traffic is not a detection, it
     is a constant. It costs nothing to raise, so it inflates every threat count
     in the console while telling an analyst nothing about which request to look
     at. Worth failing on, because the number looks healthy either way. */
  const benignTally = new Map<string, number>();
  for (const r of benignRows) for (const t of r.types) benignTally.set(t, (benignTally.get(t) ?? 0) + 1);
  const nonDiscriminative = [...benignTally]
    .filter(([, n]) => n / benignRows.length >= NOISE_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  console.log("  ATTACK TRAFFIC");
  for (const r of attackRows.sort((a, b) => Number(a.ok) - Number(b.ok) || b.risk - a.risk)) {
    console.log(
      `    ${r.ok ? "✓" : "✗"}  ${r.label.padEnd(24)} risk ${String(r.risk).padStart(3)}  ` +
      `${String(r.threats).padStart(2)} threat(s)  ${r.actions.join(", ") || "NOT ACTIONED"}`,
    );
  }

  console.log("\n  BENIGN TRAFFIC");
  if (falsePositives.length === 0) {
    console.log(`    ✓  all ${benignRows.length} legitimate requests completed`);
  } else {
    for (const r of falsePositives) {
      console.log(`    ✗  ${r.label.padEnd(24)} risk ${String(r.risk).padStart(3)}  ` +
        `${r.actions.join(", ")}  "${r.detail}"`);
    }
  }
  if (flaggedNotBlocked.length) {
    console.log(`    ·  ${flaggedNotBlocked.length} flagged a threat but were allowed through ` +
      "(a lead for the analyst, not an interruption)");
    for (const [t, n] of [...benignTally].sort((a, b) => b[1] - a[1])) {
      console.log(`       ${String(n).padStart(3)} x ${t}`);
    }
  }

  console.log("\n  RESULT");
  console.log(`    detection      ${bar(detectionRate)}  ${pct(detectionRate)}  ` +
    `(${caught.length}/${attackRows.length} actioned)`);
  console.log(`    false positive ${bar(fpRate)}  ${pct(fpRate)}  ` +
    `(${falsePositives.length}/${benignRows.length} interrupted)`);
  console.log(`\n  completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (missed.length) {
    console.log("\n  NOT ACTIONED — these are the gaps worth closing:");
    for (const r of missed) console.log(`    · ${r.label} — "${r.detail}"`);
  }

  /* ------------------------------------------------------------ verdict */
  const failures: string[] = [];
  if (detectionRate < MIN_DETECTION_RATE) {
    failures.push(`detection ${pct(detectionRate)} is below the ${pct(MIN_DETECTION_RATE)} floor`);
  }
  if (fpRate > MAX_FALSE_POSITIVE_RATE) {
    failures.push(`false positives ${pct(fpRate)} exceed the ${pct(MAX_FALSE_POSITIVE_RATE)} ceiling`);
  }
  for (const [t, n] of nonDiscriminative) {
    failures.push(`${t} fires on ${pct(n / benignRows.length)} of benign traffic`);
  }

  if (failures.length) {
    console.log(`\n  FAILED — ${failures.join("; ")}\n`);
    process.exitCode = 1;
  } else {
    console.log("\n  PASSED — both thresholds met\n");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
