import Link from "next/link";
import { Crosshair } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getThreatCenter } from "@/lib/queries/defense";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { MetricStrip } from "@/components/security/metric-strip";
import { DecisionBadge, SeverityBar, ThreatBadge } from "@/components/security/indicators";
import { RiskPill } from "@/components/security/risk-score";
import { FamilyFilter } from "@/components/security/family-filter";
import { formatRelative, truncate } from "@/lib/utils/format";
import { THREAT_FAMILY_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Threat Center" };

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string }>;
}) {
  const { family } = await searchParams;
  const data = await getThreatCenter(family);

  const visible = data.selected
    ? data.families.filter((f) => f.family === data.selected)
    : data.families;

  return (
    <>
      <PageHeader
        title="Threat Center"
        description="Every threat type the engine can identify, grouped by attack family, with the detection layers that found each one."
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Threat Events (7d)", value: data.totals.events, polarity: "higher-is-worse" },
          { label: "Blocked", value: data.totals.blocked },
          { label: "Critical Severity", value: data.totals.critical, polarity: "higher-is-worse" },
          {
            label: "Incidents Raised",
            value: data.totals.incidents,
            polarity: "higher-is-worse",
            href: "/incidents",
          },
        ]}
      />

      <FamilyFilter
        current={data.selected}
        families={data.families.map((f) => ({ key: f.family, total: f.total }))}
        className="mb-4"
      />

      <div className="space-y-4">
        {visible.map((f) => (
          <Card key={f.family}>
            <CardHeader>
              <div>
                <CardTitle>{THREAT_FAMILY_META[f.family].label}</CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  {THREAT_FAMILY_META[f.family].description}
                </p>
              </div>
              <span className="font-mono text-sm tabular text-ink-2">{f.total}</span>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 md:grid-cols-2">
                {f.types.map((t) => (
                  <li
                    key={t.type}
                    className={
                      t.events > 0
                        ? "rounded-md border border-line bg-surface-2/40 p-3"
                        : "rounded-md border border-line/60 bg-surface p-3 opacity-60"
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ThreatBadge threat={t.type} size="xs" />
                      <span className="flex items-center gap-2">
                        {t.incidents > 0 && (
                          <Badge tone="critical" size="xs">{t.incidents} incident{t.incidents === 1 ? "" : "s"}</Badge>
                        )}
                        <span className="font-mono text-sm font-semibold tabular text-ink">
                          {t.events}
                        </span>
                      </span>
                    </div>

                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                      {t.meta.description}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.meta.owasp && (
                        <Badge tone="outline" size="xs">OWASP {t.meta.owasp}</Badge>
                      )}
                      {t.meta.atlas && (
                        <Badge tone="outline" size="xs">ATLAS {t.meta.atlas}</Badge>
                      )}
                      {t.blocked > 0 && (
                        <Badge tone="allow" size="xs">{t.blocked} blocked</Badge>
                      )}
                    </div>

                    {t.layers.length > 0 && (
                      <div className="mt-2 border-t border-line pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                          Detected by
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {t.layers.map((l) => (
                            <span
                              key={l.layer}
                              className="rounded bg-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-3"
                              title={`${l.count} detections, ${(l.avgConfidence * 100).toFixed(0)}% average confidence`}
                            >
                              {l.layer.toLowerCase()} ×{l.count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent threat activity</CardTitle>
            <p className="mt-0.5 text-xs text-ink-3">
              {data.selected
                ? `Events involving ${THREAT_FAMILY_META[data.selected].label.toLowerCase()}.`
                : "All events where the engine confirmed at least one threat."}
            </p>
          </div>
          <Link href="/monitor" className="text-[11px] text-brand hover:underline">
            Open monitor
          </Link>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <EmptyState icon={Crosshair} title="No threat activity in this window" />
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map((e) => (
                <li key={e.id}>
                  <Link href={`/monitor/${e.id}`} className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-2/50">
                    <SeverityBar severity={e.severity} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-ink-2">{e.user?.name}</span>
                        <span className="text-[10px] text-ink-4">{e.application?.name}</span>
                        <span className="text-[10px] text-ink-4">{formatRelative(e.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-3">
                        {truncate(e.requestText, 110)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {e.threatTypes.slice(0, 3).map((t) => (
                          <ThreatBadge key={t} threat={t} size="xs" severity={e.severity} withTooltip={false} />
                        ))}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <RiskPill score={e.riskScore} />
                      <DecisionBadge decision={e.decision} size="xs" showIcon={false} withTooltip={false} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
