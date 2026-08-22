import Link from "next/link";
import { Clock, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getAnalytics, RANGES } from "@/lib/queries/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricStrip } from "@/components/security/metric-strip";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList, CompositionBar } from "@/components/charts/bar-charts";
import { RangeSwitcher } from "@/components/security/range-switcher";
import { AnalyticsFilters } from "@/components/security/analytics-filters";
import { RiskPill } from "@/components/security/risk-score";
import { SEVERITY_META, type Severity } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const CATEGORICAL = [
  "var(--color-viz-1)", "var(--color-viz-2)", "var(--color-viz-3)",
  "var(--color-viz-4)", "var(--color-viz-5)", "var(--color-viz-6)",
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const data = await getAnalytics({
    range: params.range,
    application: params.application,
    agent: params.agent,
    severity: params.severity,
  });

  const severityTotal = data.severityCounts.reduce((sum, s) => sum + s.count, 0);

  const severityColor = (s: Severity) =>
    ({
      CRITICAL: "var(--color-viz-ord-5)", HIGH: "var(--color-viz-ord-4)",
      MEDIUM: "var(--color-viz-ord-3)", LOW: "var(--color-viz-ord-2)",
      INFO: "var(--color-viz-ord-1)",
    })[s];

  return (
    <>
      <PageHeader
        title="Security Analytics"
        description="Trends, breakdowns and reporting across the AI estate. Every filter is held in the URL, so a view can be shared as a link."
        actions={
          <div className="flex items-center gap-2">
            <RangeSwitcher current={data.range.key} options={RANGES} />
          </div>
        }
      />

      <AnalyticsFilters
        applications={data.applications}
        agents={data.agents}
        className="mb-4"
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Requests", value: data.totals.requests },
          { label: "Threats", value: data.totals.threats, polarity: "higher-is-worse" },
          { label: "Blocked", value: data.totals.blocked },
          { label: "Redacted", value: data.totals.redacted },
          { label: "Incidents", value: data.totals.incidents, polarity: "higher-is-worse" },
          {
            label: "Average Risk",
            value: Math.round(data.totals.avgRisk),
            polarity: "higher-is-worse",
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <TrendChart
            data={data.overTime}
            title="Threat activity over time"
            subtitle={`Detections across the last ${data.range.label}, with critical severity called out.`}
            height={200}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-semibold tracking-tight text-ink">Severity mix</h3>
            <p className="mt-0.5 text-[11px] text-ink-4">
              Distribution of scored events by severity band.
            </p>
          </div>
          {/*
            The bar carries its own legend; rendering a second list beneath it
            duplicated every label. This list is the legend — it adds the count
            and share the inline one cannot fit.
          */}
          <CompositionBar
            showLegend={false}
            segments={data.severityCounts.map((s) => ({
              label: SEVERITY_META[s.severity].label,
              value: s.count,
              color: severityColor(s.severity),
            }))}
          />

          <dl className="mt-5 space-y-2.5">
            {data.severityCounts.map((s) => {
              const share = severityTotal > 0 ? (s.count / severityTotal) * 100 : 0;
              return (
                <div key={s.severity} className="flex items-center gap-3">
                  <dt className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: severityColor(s.severity) }}
                    />
                    <span className="truncate text-xs text-ink-2">
                      {SEVERITY_META[s.severity].label}
                    </span>
                  </dt>
                  <dd className="flex shrink-0 items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold tabular text-ink">
                      {s.count}
                    </span>
                    <span className="w-10 text-right font-mono text-[10px] tabular text-ink-4">
                      {share.toFixed(0)}%
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <TrendChart
            data={data.injectionTrend}
            title="Prompt injection trend"
            subtitle="Direct and indirect injection attempts detected."
            height={170}
          />
        </Card>
        <Card className="p-4">
          <TrendChart
            data={data.leakageTrend}
            title="Data leakage trend"
            subtitle="Sensitive values found, with credentials called out separately."
            height={170}
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <BarList
            title="Threats by category"
            subtitle="Most frequent threat types."
            data={data.threatCategories.slice(0, 8).map((t, i) => ({
              label: t.label,
              value: t.count,
              color: CATEGORICAL[i % CATEGORICAL.length],
            }))}
            maxRows={8}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Targeted applications"
            subtitle="Threat events by application."
            data={data.byApplication.slice(0, 8).map((a) => ({
              label: a.name,
              value: a.threats,
              meta: `${a.requests} req`,
              color: "var(--color-viz-2)",
            }))}
            maxRows={8}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Targeted agents"
            subtitle="Threat events by agent."
            data={data.byAgent.slice(0, 8).map((a) => ({
              label: a.name,
              value: a.threats,
              meta: a.blocked > 0 ? `${a.blocked} blocked` : undefined,
              color: "var(--color-viz-6)",
            }))}
            maxRows={8}
          />
        </Card>

        <Card className="p-4">
          <BarList
            title="Blocked tools"
            subtitle="Tool calls the gateway refused."
            data={data.blockedTools.slice(0, 8).map((t) => ({
              label: t.name,
              value: t.count,
              color: "var(--color-viz-block)",
            }))}
            maxRows={8}
          />
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader>
          <div>
            <CardTitle>Security summary</CardTitle>
            <p className="mt-0.5 text-xs text-ink-3">
              Reporting view for the last {data.range.label}.
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-4">
            <Download className="size-3" />
            Print or save as PDF from your browser
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Posture
              </h3>
              <p className="text-xs leading-relaxed text-ink-2">
                DefenSight evaluated <strong className="text-ink">{data.totals.requests.toLocaleString()}</strong> AI
                requests in this window. <strong className="text-ink">{data.totals.threats}</strong> carried at
                least one confirmed threat, of which{" "}
                <strong className="text-ink">{data.totals.blocked}</strong> were blocked outright and{" "}
                <strong className="text-ink">{data.totals.redacted}</strong> were delivered with
                redaction applied. Mean risk across all scored requests was{" "}
                <strong className="text-ink">{data.totals.avgRisk.toFixed(1)}</strong>/100.
              </p>
              {data.totals.meanTimeToResolve !== null && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
                  <Clock className="size-3.5" />
                  Mean time to resolve: {data.totals.meanTimeToResolve.toFixed(1)} hours across{" "}
                  {data.totals.incidents} incident{data.totals.incidents === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Principal risk
              </h3>
              {data.byUser.length === 0 ? (
                <p className="text-xs text-ink-4">No principal activity in this window.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.byUser.slice(0, 6).map((u) => (
                    <li key={u.name} className="flex items-center gap-3 rounded border border-line bg-surface-2/40 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] text-ink-2">{u.name}</span>
                        <span className="block truncate text-[10px] text-ink-4">{u.department}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-4">
                        {u.requests} req
                      </span>
                      <RiskPill
                        score={u.requests ? Math.round((u.threats / u.requests) * 100) : 0}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              Most active threat types
            </h3>
            <ul className="flex flex-wrap gap-2">
              {data.threatCategories.slice(0, 6).map((t) => (
                <li key={t.type}>
                  <Link
                    href={`/monitor?threat=${t.type}`}
                    className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-brand/40 hover:text-brand-text"
                  >
                    {t.label}
                    <span className="font-mono tabular text-ink-4">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
