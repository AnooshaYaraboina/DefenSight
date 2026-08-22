/**
 * DefenSight database seed.
 *
 * Builds the Northwind Group AI estate: users, applications, agents, tools and
 * grants, the knowledge base with its adversarial corpus, and the full control
 * set. Deterministic — running it twice produces the same database.
 *
 * Security history (events, detections, incidents) is generated separately by
 * scripts/generate-history.ts, which replays traffic through the real detection
 * pipeline rather than fabricating rows. Seeded events would not match what the
 * engine actually produces, and a security console whose history disagrees with
 * its own engine is worse than one with no history at all.
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { seedOrganization, DEMO_PASSWORD } from "./seed/organization";
import { seedTools } from "./seed/tools";
import { seedKnowledge } from "./seed/knowledge";
import { seedControls } from "./seed/controls";

/** Order matters: children are removed before the rows they reference. */
async function reset() {
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
    prisma.document.deleteMany(),
    prisma.vectorStoreOnApp.deleteMany(),
    prisma.vectorStore.deleteMany(),
    prisma.dataSource.deleteMany(),
    prisma.toolGrant.deleteMany(),
    prisma.tool.deleteMany(),
    prisma.agentPermission.deleteMany(),
    prisma.baseline.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.aiApplication.deleteMany(),
    prisma.llmModel.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.policy.deleteMany(),
    prisma.guardrail.deleteMany(),
    prisma.metricSnapshot.deleteMany(),
  ]);
}

function step(label: string) {
  process.stdout.write(`  ${label.padEnd(42, ".")} `);
}

async function main() {
  const started = Date.now();
  console.log("\n  DefenSight — seeding Northwind Group estate\n");

  step("clearing existing data");
  await reset();
  console.log("done");

  step("organisation, applications, agents");
  const org = await seedOrganization(prisma);
  console.log(
    `${Object.keys(org.users).length} users · ${Object.keys(org.apps).length} apps · ${Object.keys(org.agents).length} agents`,
  );

  step("tool catalogue and grants");
  const tools = await seedTools(prisma, org.agents);
  const grants = await prisma.toolGrant.count();
  console.log(`${Object.keys(tools).length} tools · ${grants} grants`);

  step("knowledge base and document corpus");
  const knowledge = await seedKnowledge(prisma, org.users);
  const docs = await prisma.document.count();
  console.log(
    `${Object.keys(knowledge.sources).length} sources · ${Object.keys(knowledge.stores).length} vector stores · ${docs} documents`,
  );

  step("guardrails and policies");
  const controls = await seedControls(prisma);
  console.log(`${controls.guardrailCount} guardrails · ${controls.policyCount} policies`);

  step("linking vector stores to applications");
  const storeLinks: Array<[string, string]> = [
    ["atlas-assistant", "pgvector-corp"],
    ["atlas-assistant", "pinecone-support"],
    ["ledger-insights", "pgvector-corp"],
    ["talentdesk-ai", "pgvector-corp"],
    ["clientpulse", "pinecone-support"],
    ["devops-copilot", "pgvector-corp"],
    ["contract-analyzer", "qdrant-legal"],
  ];
  for (const [app, store] of storeLinks) {
    await prisma.vectorStoreOnApp.create({
      data: { applicationId: org.apps[app], vectorStoreId: knowledge.stores[store] },
    });
  }
  console.log(`${storeLinks.length} links`);

  step("seeding audit trail");
  const admin = org.users["admin@defensight.example"];
  await prisma.auditLog.createMany({
    data: [
      { actorId: admin, actorName: "Admin", actorRole: "SECURITY_ADMIN", action: "platform.initialise", category: "ADMIN", description: "DefenSight deployed and connected to the Northwind AI estate.", outcome: "SUCCESS" },
      { actorId: admin, actorName: "Admin", actorRole: "SECURITY_ADMIN", action: "guardrail.enable_all", category: "CONFIG", description: `Enabled ${controls.guardrailCount} default guardrails across input and output channels.`, outcome: "SUCCESS" },
      { actorId: admin, actorName: "Admin", actorRole: "SECURITY_ADMIN", action: "policy.import_baseline", category: "CONFIG", description: `Imported ${controls.policyCount} baseline security policies.`, outcome: "SUCCESS" },
      { actorId: admin, actorName: "Admin", actorRole: "SECURITY_ADMIN", action: "application.register", category: "CONFIG", description: "Registered 6 AI applications for monitoring.", outcome: "SUCCESS" },
    ],
  });
  console.log("4 entries");

  console.log(`\n  Seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  Sign-in password for every seeded account: ${DEMO_PASSWORD}`);
  console.log(`  Administrator: admin@defensight.example\n`);
  console.log(`  Next: npm run db:history  — replays traffic through the detection engine\n`);
}

main()
  .catch((err) => {
    console.error("\n  Seed failed:\n", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
