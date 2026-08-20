import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/db";
import { MetricStrip } from "@/components/security/metric-strip";
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

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Total Alerts", value: alerts.length },
          { label: "Unacknowledged", value: unacknowledged, polarity: "higher-is-worse" },
          { label: "Critical Outstanding", value: critical, polarity: "higher-is-worse" },
          {
            label: "Acknowledged",
            value: alerts.length - unacknowledged,
            polarity: "higher-is-better",
          },
        ]}
      />

      <AlertList alerts={alerts as AlertRow[]} />
    </>
  );
}
