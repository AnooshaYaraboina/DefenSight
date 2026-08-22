import Link from "next/link";
import { Siren, Clock, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getIncidents } from "@/lib/queries/incidents";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { IncidentStatusBadge, SeverityBadge, ThreatBadge } from "@/components/security/indicators";
import { AttackChainStrip } from "@/components/security/attack-chain";
import { MetricStrip } from "@/components/security/metric-strip";
import { StatusFilter } from "@/components/security/status-filter";
import { ReportActions } from "@/components/security/report-actions";
import { formatRelative } from "@/lib/utils/format";
import { INCIDENT_STATUSES, INCIDENT_STATUS_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { incidents, counts, total, page, pageCount } = await getIncidents({
    ...params,
    page: params.page ? Number(params.page) : 1,
  });

  const open = incidents.filter((i) => i.status === "OPEN" || i.status === "INVESTIGATING").length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Critical threats open a case automatically, seeded with the attack chain the pipeline recorded. Investigate, contain, resolve."
        actions={
          <ReportActions
            endpoint="/api/reports/estate"
            filename="defensight-incident-review.pdf"
            label="consolidated review"
          />
        }
      />

      <MetricStrip
        className="mb-4"
        metrics={INCIDENT_STATUSES.map((status) => ({
          label: INCIDENT_STATUS_META[status].label,
          value: counts[status] ?? 0,
          note: INCIDENT_STATUS_META[status].description,
        }))}
      />

      <StatusFilter
        current={params.status}
        counts={counts}
        total={total}
        className="mb-3"
      />

      {incidents.length === 0 ? (
        <Card>
          <EmptyState
            icon={Siren}
            title="No incidents match this filter"
            description={
              open === 0
                ? "No cases are currently open. Critical threats raise an incident automatically."
                : "Try a different status filter."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link href={`/incidents/${incident.id}`}>
                <Card
                  interactive
                  className={
                    incident.severity === "CRITICAL" && incident.status === "OPEN"
                      ? "border-critical/35 p-4"
                      : "p-4"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-4">{incident.ref}</span>
                        <SeverityBadge severity={incident.severity} size="xs" withTooltip={false} />
                        <IncidentStatusBadge status={incident.status} size="xs" />
                        <ThreatBadge threat={incident.threatType} size="xs" severity={incident.severity} withTooltip={false} />
                      </div>

                      <h3 className="mt-1.5 truncate text-sm font-medium text-ink">
                        {incident.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-3">
                        {incident.summary}
                      </p>

                      {incident.attackChain.length > 0 && (
                        <AttackChainStrip stages={incident.attackChain} className="mt-2.5" />
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-[10px] text-ink-4">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelative(incident.openedAt)}
                      </span>
                      {incident.assignedTo ? (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {incident.assignedTo.name}
                        </span>
                      ) : (
                        <Badge tone="outline" size="xs">Unassigned</Badge>
                      )}
                      <span className="font-mono">
                        {incident._count.events} event{incident._count.events === 1 ? "" : "s"}
                      </span>
                      {incident.subjectUser && (
                        <span className="max-w-40 truncate">{incident.subjectUser}</span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3"
          aria-label="Incident pages"
        >
          <p className="font-mono text-[11px] text-ink-4">
            {(page - 1) * 25 + 1}&ndash;{Math.min(page * 25, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <PageLink params={params} page={page - 1} disabled={page <= 1}>
              Previous
            </PageLink>
            <span className="font-mono text-[11px] tabular text-ink-3">
              {page} / {pageCount}
            </span>
            <PageLink params={params} page={page + 1} disabled={page >= pageCount}>
              Next
            </PageLink>
          </div>
        </nav>
      )}
    </>
  );
}

/**
 * A page link that preserves the current filters.
 *
 * Every filter on this screen lives in the URL so a view can be shared as a
 * link; paging has to keep that property rather than dropping back to page one
 * of everything.
 */
function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-4">
        {children}
      </span>
    );
  }
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") next.set(k, v);
  }
  next.set("page", String(page));
  return (
    <Link
      href={`/incidents?${next.toString()}`}
      className="rounded-md border border-line-strong px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-brand/50 hover:text-ink"
    >
      {children}
    </Link>
  );
}
