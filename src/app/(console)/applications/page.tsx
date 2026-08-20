import Link from "next/link";
import { AppWindow, Bot, Database, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getApplications } from "@/lib/queries/estate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { StatTile } from "@/components/security/stat-tile";
import { RiskPill } from "@/components/security/risk-score";
import { formatRelative } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Applications" };

export default async function ApplicationsPage() {
  const apps = await getApplications();

  const totals = apps.reduce(
    (acc, a) => ({
      requests: acc.requests + a.requests,
      blocked: acc.blocked + a.blocked,
      agents: acc.agents + a._count.agents,
      incidents: acc.incidents + a._count.incidents,
      open: acc.open + a.openIncidents,
    }),
    { requests: 0, blocked: 0, agents: 0, incidents: 0, open: 0 },
  );

  return (
    <>
      <PageHeader
        title="AI Applications"
        description="Every AI application registered for monitoring, with its posture derived from observed behaviour rather than declared configuration."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Applications" value={apps.length} hint="Registered and monitored." />
        <StatTile label="Agents Deployed" value={totals.agents} hint="Across all applications." />
        <StatTile label="Requests (7d)" value={totals.requests} hint="Requests evaluated by the pipeline this week." />
        <StatTile label="Open Incidents" value={totals.open} polarity="higher-is-worse" hint="Cases still open or under investigation across these applications." />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {apps.map((app) => (
          <Link key={app.id} href={`/applications/${app.slug}`}>
            <Card
              interactive
              className={
                app.securityScore < 70 ? "h-full border-medium/25 p-4" : "h-full p-4"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2.5">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                    <AppWindow className="size-4 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink">{app.name}</h3>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-ink-4">
                      {app.model.name}
                    </p>
                  </div>
                </div>
                <Badge tone={app.status === "ACTIVE" ? "allow" : "neutral"} size="xs">
                  {app.status}
                </Badge>
              </div>

              <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">
                {app.description}
              </p>

              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Security score
                  </span>
                  <span className="font-mono text-[11px] tabular text-ink-2">
                    {app.securityScore}/100
                  </span>
                </div>
                <Meter
                  value={app.securityScore}
                  tone={app.securityScore >= 80 ? "allow" : app.securityScore >= 65 ? "medium" : "critical"}
                  aria-label={`Security score ${app.securityScore} of 100`}
                />
              </div>

              <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-2.5">
                <Stat label="Agents" value={app._count.agents} />
                <Stat label="Requests" value={app.requests} />
                <Stat label="Threats" value={app.threats} tone={app.threats > 0 ? "critical" : undefined} />
                <Stat label="Blocked" value={app.blocked} tone={app.blocked > 0 ? "critical" : undefined} />
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                <span className="flex items-center gap-1 text-[10px] text-ink-4">
                  <Database className="size-3" />
                  {app.vectorStores.length} store{app.vectorStores.length === 1 ? "" : "s"}
                </span>
                {app.openIncidents > 0 ? (
                  <Badge tone="critical" size="xs">
                    <ShieldAlert />
                    {app.openIncidents} open
                  </Badge>
                ) : app._count.incidents > 0 ? (
                  <Badge tone="outline" size="xs">
                    {app._count.incidents} resolved
                  </Badge>
                ) : null}
                {app.avgRisk > 0 && <RiskPill score={app.avgRisk} />}
                <span className="ml-auto text-[10px] text-ink-4">
                  {formatRelative(app.lastActivityAt)}
                </span>
              </div>

              <p className="mt-2.5 truncate text-[10px] text-ink-4">
                <Bot className="mr-1 inline size-2.5" />
                Owner: {app.owner}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "critical" }) {
  return (
    <div>
      <dt className="text-[10px] text-ink-4">{label}</dt>
      <dd
        className={
          tone === "critical"
            ? "mt-0.5 font-mono text-sm font-semibold tabular text-critical"
            : "mt-0.5 font-mono text-sm font-semibold tabular text-ink-2"
        }
      >
        {value}
      </dd>
    </div>
  );
}
