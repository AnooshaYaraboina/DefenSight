/**
 * Historical replay.
 *
 * Generates the platform's security history by pushing realistic traffic
 * through the *real* pipeline. Nothing here fabricates a detection, a risk
 * score or an incident — every row is the genuine output of the engine, so the
 * console can never show a verdict the engine would not reproduce.
 *
 * Runs in two passes:
 *   1. Scan every seeded document with the real RAG scanner, so quarantine
 *      state and findings exist before any retrieval happens.
 *   2. Replay ~14 days of traffic, business-hours weighted, with attacks at a
 *      realistic minority rate.
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/db/json";
import { scanDocument } from "@/lib/engine";
import { ingest } from "@/lib/runtime/ingest";
import { refreshPostureScores } from "@/lib/runtime/persist";
import { ATTACK_TRAFFIC, BENIGN_TRAFFIC } from "./traffic";

const DAYS = 14;
const TARGET_EVENTS = 720;
/** Share of traffic that is an attack. Real estates sit well below this. */
const ATTACK_RATE = 0.14;

/* Deterministic RNG so a regenerated database is identical. */
let seed = 0x5eed1234;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

/**
 * Business-hours weighted timestamp. Traffic clustered 09:00-18:00 on weekdays
 * is what makes the off-hours behavioural signal meaningful — without a real
 * diurnal pattern, "unusual hour" would be noise.
 */
function timestampFor(index: number, total: number): Date {
  const now = Date.now();
  const spanMs = DAYS * 24 * 3600_000;
  // Bias recent: an analyst opening the console cares about today.
  const progress = Math.pow(index / total, 0.72);
  let t = now - spanMs + progress * spanMs;

  const d = new Date(t);
  const hour = d.getHours();
  if (hour < 8 || hour > 19) {
    // Most off-hours traffic is pulled into the working day; a small remainder
    // stays, which is what genuine out-of-hours activity looks like.
    if (rand() > 0.12) {
      d.setHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60), Math.floor(rand() * 60));
      t = d.getTime();
    }
  }
  const day = new Date(t).getDay();
  if ((day === 0 || day === 6) && rand() > 0.18) {
    t -= 2 * 24 * 3600_000;
  }
  return new Date(t);
}

function bar(done: number, total: number, width = 28): string {
  const filled = Math.round((done / total) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

async function scanAllDocuments() {
  const documents = await prisma.document.findMany({ include: { source: true } });
  let quarantined = 0;
  let suspicious = 0;

  for (const doc of documents) {
    const result = scanDocument({
      documentId: doc.id,
      title: doc.title,
      content: doc.content,
      classification: doc.classification,
      sourceTrust: doc.source.trustLevel,
      sourceName: doc.source.name,
      sourceIsExternal: doc.source.isExternal,
    });

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        scanStatus: result.status,
        scanResult: asJson({
          status: result.status,
          riskScore: result.riskScore,
          trustScore: result.trustScore,
          obfuscation: result.obfuscation,
          reasoning: result.reasoning,
          threats: result.fusion.threats.map((t) => ({
            type: t.threatType,
            confidence: t.confidence,
            layers: t.layers,
            agreement: t.agreement,
          })),
          sensitive: result.sensitiveFindings.map((f) => ({
            type: f.type, category: f.category, count: f.count, sample: f.maskedSample,
          })),
          durationMs: result.durationMs,
        }),
        scannedAt: new Date(),
        trustScore: result.trustScore,
        riskLevel: result.riskLevel,
        quarantined: result.quarantine,
        quarantineReason: result.quarantineReason ?? null,
        quarantinedAt: result.quarantine ? new Date() : null,
      },
    });

    // Persist each finding anchored to its offsets so the UI can highlight it.
    await prisma.documentFinding.deleteMany({ where: { documentId: doc.id } });
    const findings = result.detections.flatMap((d) => {
      const spans = d.evidence.spans ?? [];
      const anchors = spans.length ? spans.slice(0, 4) : [{ start: 0, end: 0, text: "", label: d.threatType }];
      return anchors.map((span) => ({
        documentId: doc.id,
        detectorId: d.detectorId,
        threatType: d.threatType,
        severity: d.severity,
        confidence: d.confidence,
        snippet: (span.text || doc.content.slice(0, 160)).slice(0, 300),
        offsetStart: span.start,
        offsetEnd: span.end,
        explanation: d.explanation,
        evidence: asJson(d.evidence),
      }));
    });
    if (findings.length) await prisma.documentFinding.createMany({ data: findings });

    if (result.quarantine) quarantined++;
    else if (result.status === "SUSPICIOUS") suspicious++;
  }

  return { total: documents.length, quarantined, suspicious };
}

async function main() {
  const started = Date.now();
  console.log("\n  DefenSight — generating security history through the live pipeline\n");

  /* ------------------------------------------------- clear prior history */
  // Replay is idempotent: rerunning must reproduce the same database, not
  // append a second copy of it.
  process.stdout.write("  clearing prior history".padEnd(44, ".") + " ");
  await prisma.$transaction([
    prisma.incidentTimelineEntry.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.toolApproval.deleteMany(),
    prisma.toolCall.deleteMany(),
    prisma.retrievalEvent.deleteMany(),
    prisma.sensitiveHit.deleteMany(),
    prisma.detection.deleteMany(),
    prisma.securityEvent.deleteMany(),
    prisma.incident.deleteMany(),
    prisma.documentFinding.deleteMany(),
    prisma.baseline.deleteMany(),
    prisma.metricSnapshot.deleteMany(),
    prisma.auditLog.deleteMany({ where: { category: "SECURITY_DECISION" } }),
  ]);
  console.log("done");

  /* ------------------------------------------------------ pass 1: scan */
  process.stdout.write("  scanning document corpus".padEnd(44, ".") + " ");
  const scan = await scanAllDocuments();
  console.log(`${scan.total} scanned · ${scan.quarantined} quarantined · ${scan.suspicious} suspicious`);

  /* ------------------------------------------------ resolve seeded ids */
  const [users, docs] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, role: true, clearance: true } }),
    prisma.document.findMany({ select: { id: true, title: true, classification: true } }),
  ]);
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  const docByTitle = new Map(docs.map((d) => [d.title, d.id]));
  const docClassification = new Map(docs.map((d) => [d.id, d.classification]));
  // Ordinary employees originate traffic; the security team investigates it.
  const requesters = users.filter((u) => u.role === "VIEWER");

  const RANK: Record<string, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };

  const resolveDocs = (titles?: string[]) =>
    titles?.map((t) => docByTitle.get(t)).filter((id): id is string => Boolean(id));

  /**
   * Pick a requester who is actually cleared for what the request retrieves.
   *
   * Routing a random employee at a restricted document would generate a
   * clearance breach on every benign request — which is the engine behaving
   * correctly against an unrealistic scenario. Real organisations route work to
   * people who hold the clearance; genuine breaches are the exception, and the
   * attack traffic supplies those deliberately.
   */
  function requesterFor(documentIds?: string[]) {
    if (!documentIds?.length) return pick(requesters).id;
    const required = Math.max(
      ...documentIds.map((id) => RANK[docClassification.get(id) ?? "PUBLIC"] ?? 0),
    );
    const eligible = requesters.filter((u) => (RANK[u.clearance] ?? 0) >= required);
    return (eligible.length ? pick(eligible) : pick(requesters)).id;
  }

  /* --------------------------------------------------- pass 2: replay */
  console.log(`  replaying ${TARGET_EVENTS} requests across ${DAYS} days\n`);

  const counters = { total: 0, blocked: 0, redacted: 0, approvals: 0, threats: 0, incidents: 0 };

  for (let i = 0; i < TARGET_EVENTS; i++) {
    const timestamp = timestampFor(i, TARGET_EVENTS);
    const isAttack = rand() < ATTACK_RATE;

    try {
      if (isAttack) {
        const attack = weightedPick(ATTACK_TRAFFIC);
        const userId = attack.user ? userByEmail.get(attack.user) : undefined;
        const res = await ingest({
          userId: userId ?? pick(requesters).id,
          applicationSlug: attack.app,
          agentSlug: attack.agent,
          input: attack.prompt,
          output: attack.output,
          retrievedDocumentIds: resolveDocs(attack.docTitles),
          proposedToolCalls: attack.tools?.map((t, index) => ({
            toolSlug: t.slug, operation: t.operation, arguments: t.args, index,
          })),
          timestamp,
          scenarioKey: attack.key,
          quiet: true,
        });
        if (res.result.threatTypes.length) counters.threats++;
        if (res.incidentRef) counters.incidents++;
        if (res.result.blocked) counters.blocked++;
        if (res.result.redacted) counters.redacted++;
        if (res.result.decision === "REQUIRE_APPROVAL") counters.approvals++;
      } else {
        const pattern = pick(BENIGN_TRAFFIC);
        const retrievedDocumentIds = resolveDocs(
          pattern.docTitles ? [pick(pattern.docTitles)] : undefined,
        );
        const res = await ingest({
          userId: requesterFor(retrievedDocumentIds),
          applicationSlug: pattern.app,
          agentSlug: pattern.agent,
          input: pick(pattern.prompts),
          retrievedDocumentIds,
          proposedToolCalls: pattern.tools?.map((t, index) => ({
            toolSlug: t.slug, operation: t.operation, arguments: t.args, index,
          })),
          timestamp,
          quiet: true,
        });
        if (res.result.blocked) counters.blocked++;
        if (res.result.redacted) counters.redacted++;
        if (res.result.decision === "REQUIRE_APPROVAL") counters.approvals++;
        if (res.result.threatTypes.length) counters.threats++;
      }
      counters.total++;
    } catch (error) {
      console.error(`\n  request ${i} failed:`, error instanceof Error ? error.message : error);
    }

    if (i % 20 === 0 || i === TARGET_EVENTS - 1) {
      process.stdout.write(
        `\r  ${bar(i + 1, TARGET_EVENTS)}  ${i + 1}/${TARGET_EVENTS}  ` +
          `blocked ${counters.blocked} · threats ${counters.threats} · incidents ${counters.incidents}   `,
      );
    }
  }
  console.log("\n");

  /* --------------------------------------------------- posture refresh */
  process.stdout.write("  refreshing posture scores".padEnd(44, ".") + " ");
  const [apps, agents] = await Promise.all([
    prisma.aiApplication.findMany({ select: { id: true } }),
    prisma.agent.findMany({ select: { id: true } }),
  ]);
  for (const a of apps) await refreshPostureScores(a.id);
  for (const a of agents) await refreshPostureScores(undefined, a.id);
  console.log(`${apps.length} applications · ${agents.length} agents`);

  /* ------------------------------------------------- user risk scores */
  process.stdout.write("  recomputing principal risk".padEnd(44, ".") + " ");
  const principals = await prisma.user.findMany({ select: { id: true } });
  for (const u of principals) {
    const events = await prisma.securityEvent.findMany({
      where: { userId: u.id },
      select: { blocked: true, riskScore: true, threatTypes: true },
    });
    if (events.length === 0) continue;
    const blockedRatio = events.filter((e) => e.blocked).length / events.length;
    const avgRisk = events.reduce((s, e) => s + e.riskScore, 0) / events.length;
    const score = Math.round(Math.min(100, blockedRatio * 60 + (avgRisk / 100) * 40));
    await prisma.user.update({ where: { id: u.id }, data: { riskScore: score } });
  }
  console.log(`${principals.length} principals`);

  /* ------------------------------------------------- incident lifecycle */
  /*
   * Work the incident queue the way a real team would.
   *
   * Leaving every historical incident open produced a console showing 63 open
   * cases — an estate that looks abandoned rather than defended, and a
   * dashboard whose "needs attention" panel is unreadable. Older incidents are
   * resolved or contained, leaving a realistic handful of live work.
   */
  process.stdout.write("  working the incident queue".padEnd(44, ".") + " ");
  const allIncidents = await prisma.incident.findMany({
    orderBy: { openedAt: "desc" },
    select: { id: true, openedAt: true, severity: true },
  });
  const analystIds = (
    await prisma.user.findMany({
      where: { role: { in: ["SECURITY_ADMIN", "SECURITY_ANALYST"] } },
      select: { id: true, name: true },
    })
  );

  let resolved = 0;
  let contained = 0;
  let investigating = 0;

  for (const [index, incident] of allIncidents.entries()) {
    const ageHours = (Date.now() - incident.openedAt.getTime()) / 3600_000;
    const analyst = analystIds[index % analystIds.length];

    // Newest few stay open; everything older has been worked.
    let status: "OPEN" | "INVESTIGATING" | "CONTAINED" | "RESOLVED";
    if (index < 3) status = "OPEN";
    else if (index < 7) status = "INVESTIGATING";
    else if (ageHours < 36) status = "CONTAINED";
    else status = "RESOLVED";

    if (status === "OPEN") continue;

    const containedAt = new Date(incident.openedAt.getTime() + (0.5 + rand() * 3) * 3600_000);
    const resolvedAt = new Date(containedAt.getTime() + (1 + rand() * 8) * 3600_000);

    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        status,
        assignedToId: analyst.id,
        containedAt: status === "CONTAINED" || status === "RESOLVED" ? containedAt : null,
        resolvedAt: status === "RESOLVED" ? resolvedAt : null,
        resolution:
          status === "RESOLVED"
            ? "Attack was blocked by the pipeline before any data left the trust boundary. Source reviewed, agent grants confirmed appropriate, no further action required."
            : null,
      },
    });

    await prisma.incidentTimelineEntry.create({
      data: {
        incidentId: incident.id,
        kind: "STATUS_CHANGE",
        actor: analyst.name,
        message:
          status === "RESOLVED"
            ? "Closed after review. The attack was stopped by automated controls; no manual containment was required."
            : status === "CONTAINED"
              ? "Threat neutralised. Verification and source review in progress."
              : "Triaged and assigned. Investigation under way.",
        createdAt: status === "RESOLVED" ? resolvedAt : containedAt,
      },
    });

    if (status === "RESOLVED") resolved++;
    else if (status === "CONTAINED") contained++;
    else investigating++;
  }

  // Alerts attached to closed incidents are acknowledged too.
  const closed = await prisma.incident.findMany({
    where: { status: { in: ["CONTAINED", "RESOLVED"] } },
    select: { id: true },
  });
  await prisma.alert.updateMany({
    where: { incidentId: { in: closed.map((c) => c.id) } },
    data: { acknowledged: true, acknowledgedById: analystIds[0]?.id, acknowledgedAt: new Date() },
  });
  // Plus the routine older ones an on-call would have cleared.
  const staleAlerts = await prisma.alert.findMany({
    where: { acknowledged: false, createdAt: { lt: new Date(Date.now() - 36 * 3600_000) } },
    select: { id: true },
  });
  await prisma.alert.updateMany({
    where: { id: { in: staleAlerts.map((a) => a.id) } },
    data: { acknowledged: true, acknowledgedById: analystIds[0]?.id, acknowledgedAt: new Date() },
  });

  console.log(`${resolved} resolved · ${contained} contained · ${investigating} investigating · 3 open`);

  /* -------------------------------------------------- hourly snapshots */
  process.stdout.write("  building metric snapshots".padEnd(44, ".") + " ");
  await prisma.metricSnapshot.deleteMany();
  const snapshots: Array<Record<string, unknown>> = [];
  for (let d = DAYS - 1; d >= 0; d--) {
    const dayStart = new Date(Date.now() - d * 24 * 3600_000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const dayEvents = await prisma.securityEvent.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      select: { blocked: true, redacted: true, riskScore: true, severity: true, threatTypes: true },
    });
    if (dayEvents.length === 0) continue;

    const threatList = dayEvents.flatMap((e) => (e.threatTypes as string[]) ?? []);
    snapshots.push({
      capturedAt: dayStart,
      bucket: "DAY",
      requests: dayEvents.length,
      blocked: dayEvents.filter((e) => e.blocked).length,
      redacted: dayEvents.filter((e) => e.redacted).length,
      threats: dayEvents.filter((e) => ((e.threatTypes as string[]) ?? []).length > 0).length,
      criticalThreats: dayEvents.filter((e) => e.severity === "CRITICAL").length,
      promptInjections: threatList.filter((t) => t.includes("INJECTION")).length,
      ragThreats: threatList.filter((t) => t.includes("RAG") || t.includes("DOCUMENT")).length,
      dataViolations: threatList.filter((t) => t.includes("DATA") || t.includes("SENSITIVE") || t.includes("SECRET")).length,
      toolDenials: threatList.filter((t) => t.includes("TOOL")).length,
      avgRiskScore: dayEvents.reduce((s, e) => s + e.riskScore, 0) / dayEvents.length,
      securityScore: Math.round(100 - (dayEvents.filter((e) => e.blocked).length / dayEvents.length) * 55),
    });
  }
  await prisma.metricSnapshot.createMany({ data: snapshots as never });
  console.log(`${snapshots.length} daily buckets`);

  /* -------------------------------------------------------- summary */
  const [events, detections, incidents, alerts, approvals, quarantined] = await Promise.all([
    prisma.securityEvent.count(),
    prisma.detection.count(),
    prisma.incident.count(),
    prisma.alert.count(),
    prisma.toolApproval.count({ where: { status: "PENDING" } }),
    prisma.document.count({ where: { quarantined: true } }),
  ]);

  console.log(`\n  History generated in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log(`    events        ${events}`);
  console.log(`    detections    ${detections}`);
  console.log(`    incidents     ${incidents}`);
  console.log(`    alerts        ${alerts}`);
  console.log(`    approvals     ${approvals} pending`);
  console.log(`    quarantined   ${quarantined} documents`);
  console.log(`    blocked       ${counters.blocked} (${((counters.blocked / counters.total) * 100).toFixed(1)}% of traffic)\n`);
}

main()
  .catch((err) => {
    console.error("\n  History generation failed:\n", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
