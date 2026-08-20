import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/db";
import { StatTile } from "@/components/security/stat-tile";
import { AuditTable, type AuditRow } from "@/components/security/audit-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Log" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; outcome?: string }>;
}) {
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (params.category) where.category = params.category;
  if (params.outcome) where.outcome = params.outcome;
  if (params.q) {
    where.OR = [
      { description: { contains: params.q } },
      { actorName: { contains: params.q } },
      { action: { contains: params.q } },
      { targetLabel: { contains: params.q } },
    ];
  }

  const [logs, total, categories, failures] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ["category"], _count: true }),
    prisma.auditLog.count({ where: { outcome: "FAILURE" } }),
  ]);

  const configChanges = await prisma.auditLog.count({ where: { category: "CONFIG" } });

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every security decision, configuration change and analyst action, in the order it happened. Append-only: nothing here can be edited or removed from the console."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Entries" value={total} />
        <StatTile label="Categories" value={categories.length} />
        <StatTile label="Configuration Changes" value={configChanges} hint="Guardrail, policy and platform changes." />
        <StatTile label="Failure Outcomes" value={failures} polarity="higher-is-worse" hint="Blocked requests, refused tools and weakened controls — the entries that matter most." />
      </div>

      <AuditTable
        logs={logs as AuditRow[]}
        categories={categories.map((c) => ({ category: c.category, count: c._count }))}
      />

      {logs.length === 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 py-8 text-xs text-ink-4">
          <ScrollText className="size-4" />
          No audit entries match these filters.
        </p>
      )}
    </>
  );
}
