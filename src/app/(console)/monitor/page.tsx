import { PageHeader } from "@/components/layout/page-header";
import { EventTable } from "@/components/security/event-table";
import { LiveTicker } from "@/components/security/live-ticker";
import { TrafficControls } from "@/components/security/traffic-controls";
import { getEvents, getFilterOptions } from "@/lib/queries/monitor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Monitor" };

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ events, total, page, pageCount }, options] = await Promise.all([
    getEvents({
      q: params.q,
      severity: params.severity,
      decision: params.decision,
      application: params.application,
      agent: params.agent,
      threat: params.threat,
      page: params.page ? Number(params.page) : 1,
    }),
    getFilterOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description="Every AI request as the pipeline evaluates it. Filters are held in the URL, so any view here can be shared as a link."
        actions={<TrafficControls />}
      />

      <LiveTicker className="mb-4" />

      <EventTable
        events={events}
        total={total}
        page={page}
        pageCount={pageCount}
        applications={options.applications}
        agents={options.agents}
      />
    </>
  );
}
