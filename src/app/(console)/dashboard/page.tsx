import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getDashboardData, RANGES } from "@/lib/queries/dashboard";
import { getRecentEvents } from "@/lib/queries/events";
import { getAttentionQueue } from "@/lib/queries/attention";
import { PostureHero } from "@/components/security/posture-hero";
import { AttentionQueue } from "@/components/security/attention-queue";
import { StatTile } from "@/components/security/stat-tile";
import { LiveFeed } from "@/components/security/live-feed";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card } from "@/components/ui/card";
import { RangeSwitcher } from "@/components/security/range-switcher";
import { TrafficControls } from "@/components/security/traffic-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security Overview" };

/**
 * The dashboard.
 *
 * Deliberately restrained. The previous version showed nine metric tiles and
 * three side-by-side bar charts — a wall of data with no focal point, where
 * everything competed and nothing led.
 *
 * This version has one: the posture score. Four metrics beneath it, one chart,
 * and a work queue. The breakdowns it used to carry now live in Analytics,
 * which is where someone goes to ask "why", while this page answers "what is
 * happening and what needs me".
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeKey } = await searchParams;
  const [data, recentEvents, attention] = await Promise.all([
    getDashboardData(rangeKey),
    getRecentEvents(24),
    getAttentionQueue(7),
  ]);

  const tile = (key: string) => data.tiles.find((t) => t.key === key);
  const headline = ["activeThreats", "blocked", "criticalIncidents", "requests"]
    .map(tile)
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <>
      <PageHeader
        title="Security Overview"
        description="Posture across the Northwind AI estate."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TrafficControls />
            <RangeSwitcher current={data.range.key} options={RANGES} />
          </div>
        }
      />

      <PostureHero
        score={data.securityScore}
        delta={data.securityScoreDelta}
        requests={tile("requests")?.value ?? 0}
        decisionMix={data.decisionMix}
        window={data.range.label}
        trend={data.postureTrend}
        className="mb-5"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headline.map((t) => (
          <StatTile
            key={t.key}
            label={t.label}
            value={t.value}
            delta={t.delta}
            polarity={t.polarity}
            hint={t.hint}
            href={t.href}
            spark={data.sparklines[t.key]}
          />
        ))}
      </div>

      <Card className="mb-5 p-5">
        <TrendChart
          data={data.threatTrend.map((t) => ({
            label: t.label,
            total: t.total,
            critical: t.critical,
          }))}
          title="Threat activity"
          subtitle={`Detections over the last ${data.range.label}, with critical severity called out separately.`}
          height={220}
        />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-ink">Live activity</h2>
              <p className="mt-1 text-xs text-ink-3">
                Every AI request as the pipeline evaluates it.
              </p>
            </div>
            <Link
              href="/monitor"
              className="flex shrink-0 items-center gap-1 text-xs text-brand transition-colors hover:text-brand/80"
            >
              Open monitor
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <LiveFeed initialEvents={recentEvents} limit={30} compact className="h-[26rem]" />
        </Card>

        <Card className="flex min-h-0 flex-col p-5">
          <AttentionQueue
            items={attention.items}
            counts={attention.counts}
            className="min-h-0 flex-1"
          />
        </Card>
      </div>
    </>
  );
}
