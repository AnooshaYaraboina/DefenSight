import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/db";
import { StatTile } from "@/components/security/stat-tile";
import { AlertList, type AlertRow } from "@/components/security/alert-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const [alerts, unacknowledged, critical] = await Promise.all([
    prisma.alert.findMany({
      orderBy: [{ acknowledged: "asc" }, { createdAt: "desc" }],
      take: 60,
      include: {
        acknowledgedBy: { select: { name: true } },
        incident: { select: { ref: true } },
      },
    }),
    prisma.alert.count({ where: { acknowledged: false } }),
    prisma.alert.count({ where: { severity: "CRITICAL", acknowledged: false } }),
  ]);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Raised automatically when the engine confirms a high or critical threat. New alerts arrive over the same live stream the monitor uses."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Alerts" value={alerts.length} />
        <StatTile label="Unacknowledged" value={unacknowledged} polarity="higher-is-worse" />
        <StatTile label="Critical Outstanding" value={critical} polarity="higher-is-worse" />
        <StatTile label="Acknowledged" value={alerts.length - unacknowledged} polarity="higher-is-better" />
      </div>

      <AlertList alerts={alerts as AlertRow[]} />
    </>
  );
}
