import Link from "next/link";
import { ArrowUpRight, Crosshair } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getDashboardData, RANGES } from "@/lib/queries/dashboard";
import { getRecentEvents } from "@/lib/queries/events";
import { PostureHero } from "@/components/security/posture-hero";
import { StatTile } from "@/components/security/stat-tile";
import { LiveFeed } from "@/components/security/live-feed";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList, OrdinalDistribution } from "@/components/charts/bar-charts";
import { Card } from "@/components/ui/card";
import { RiskPill } from "@/components/security/risk-score";
import { SeverityBadge } from "@/components/security/indicators";
import { RangeSwitcher } from "@/components/security/range-switcher";
import { TrafficControls } from "@/components/security/traffic-controls";
import { formatRelative } from "@/lib/utils/format";
import { THREAT_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Security Overview" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeKey } = await searchParams;
  const [data, recentEvents] = await Promise.all([
    getDashboardData(rangeKey),
    getRecentEvents(24),
  ]);

  const requests = data.tiles.find((t) => t.key === "requests")?.value ?? 0;

  // Categorical hues are assigned in fixed slot order and never cycled.
  const CATEGORICAL = [
    "var(--color-viz-1)", "var(--color-viz-2)", "var(--color-viz-3)",
    "var(--color-viz-4)", "var(--color-viz-5)", "var(--color-viz-6)",
  ];
  const families = [...new Set(data.attackCategories.map((c) => c.family))];
  const familyColor = (family: string) =>
    CATEGORICAL[families.indexOf(family) % CATEGORICAL.length];

  return (
    <>
      <PageHeader
        title="Security Overview"
        description="Posture, live threat activity and defensive actions across the Northwind AI estate."
        actions={
          <div className="flex items-center gap-2">
            <TrafficControls />
            <RangeSwitcher current={data.range.key} options={RANGES} />
          </div>
        }
      />

      <PostureHero
        score={data.securityScore}
        delta={data.securityScoreDelta}
        requests={requests}
        decisionMix={data.decisionMix}
        window={data.range.label}
        className="mb-4"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {data.tiles.slice(0, 5).map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            delta={tile.delta}
            polarity={tile.polarity}
            hint={tile.hint}
            href={tile.href}
          />
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.tiles.slice(5).map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            delta={tile.delta}
            polarity={tile.polarity}
            hint={tile.hint}
            href={tile.href}
          />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <TrendChart
            data={data.threatTrend.map((t) => ({
              label: t.label,
              total: t.total,
              critical: t.critical,
            }))}
            title="Threat activity"
            subtitle={`Detections over the last ${data.range.label}, with critical severity called out separately.`}
            height={200}
          />
        </Card>

        <Card className="p-4">
          <OrdinalDistribution
            title="Risk distribution"
            subtitle="Where scored requests land on the 0-100 scale."
            data={data.riskDistribution.map((b) => ({
              label: b.band,
              value: b.count,
              sublabel: b.severity.charAt(0) + b.severity.slice(1).toLowerCase(),
            }))}
            height={200}
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card className="p-4">
          <BarList
            title="Attack categories"
            subtitle="Threat types detected in this window."
            data={data.attackCategories.map((c) => ({
              label: c.label,
              value: c.count,
              color: familyColor(c.family),
              meta: THREAT_META[c.threatType]?.owasp,
            }))}
            maxRows={7}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Agent activity"
            subtitle="Requests handled, with blocked share."
            color="var(--color-viz-1)"
            data={data.agentActivity.map((a) => ({
              label: a.name,
              value: a.requests,
              meta: a.blocked > 0 ? `${a.blocked} blocked` : undefined,
              color: a.blocked > 0 ? "var(--color-viz-2)" : "var(--color-viz-1)",
            }))}
            maxRows={7}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Tool gateway"
            subtitle="Invocations evaluated, by tool."
            data={data.toolUsage.map((t) => ({
              label: t.name,
              value: t.allowed + t.blocked + t.approval,
              meta:
                t.blocked > 0
                  ? `${t.blocked} denied`
                  : t.approval > 0
                    ? `${t.approval} held`
                    : undefined,
              color:
                t.blocked > 0
                  ? "var(--color-viz-block)"
                  : t.approval > 0
                    ? "var(--color-viz-1)"
                    : "var(--color-viz-3)",
            }))}
            maxRows={7}
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col p-4">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold tracking-tight text-ink">Live activity</h3>
              <p className="mt-0.5 text-[11px] text-ink-4">
                Every AI request as the pipeline evaluates it.
              </p>
            </div>
            <Link
              href="/monitor"
              className="flex items-center gap-1 text-[11px] text-brand transition-colors hover:text-brand/80"
            >
              Open monitor
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <LiveFeed initialEvents={recentEvents} limit={30} compact className="mt-2 h-[420px]" />
        </Card>

        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-semibold tracking-tight text-ink">Highest risk</h3>
            <p className="mt-0.5 text-[11px] text-ink-4">
              Requests scoring 65 or above, newest first.
            </p>
          </div>
          {data.topRisks.length === 0 ? (
            <p className="py-10 text-center text-[11px] text-ink-4">
              No high-risk activity in this window.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.topRisks.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/monitor/${r.id}`}
                    className="flex items-start gap-2.5 rounded-md border border-line bg-surface-2/40 p-2.5 transition-colors hover:border-line-strong hover:bg-surface-2"
                  >
                    <Crosshair className="mt-0.5 size-3.5 shrink-0 text-critical" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink-2">
                        {r.title}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <SeverityBadge severity={r.severity} size="xs" showIcon={false} withTooltip={false} />
                        <span className="truncate text-[10px] text-ink-4">{r.application}</span>
                        <span className="shrink-0 text-[10px] text-ink-4">
                          {formatRelative(r.createdAt)}
                        </span>
                      </span>
                    </span>
                    <RiskPill score={r.riskScore} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
