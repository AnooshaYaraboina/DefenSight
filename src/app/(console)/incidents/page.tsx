import Link from "next/link";
import { Siren, Clock, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getIncidents } from "@/lib/queries/incidents";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { IncidentStatusBadge, SeverityBadge, ThreatBadge } from "@/components/security/indicators";
import { AttackChainStrip } from "@/components/security/attack-chain";
import { StatusFilter } from "@/components/security/status-filter";
import { formatRelative } from "@/lib/utils/format";
import { INCIDENT_STATUSES, INCIDENT_STATUS_META } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; q?: string }>;
}) {
  const params = await searchParams;
  const { incidents, counts } = await getIncidents(params);

  const open = incidents.filter((i) => i.status === "OPEN" || i.status === "INVESTIGATING").length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Critical threats open a case automatically, seeded with the attack chain the pipeline recorded. Investigate, contain, resolve."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {INCIDENT_STATUSES.map((status) => (
          <Card key={status} className="p-3.5">
            <p className="text-[11px] font-medium text-ink-3">
              {INCIDENT_STATUS_META[status].label}
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular text-ink">
              {counts[status] ?? 0}
            </p>
            <p className="mt-1.5 text-[10px] leading-snug text-ink-4">
              {INCIDENT_STATUS_META[status].description}
            </p>
          </Card>
        ))}
      </div>

      <StatusFilter
        current={params.status}
        counts={counts}
        total={incidents.length}
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
                        <SeverityBadge severity={incident.severity} size="xs" />
                        <IncidentStatusBadge status={incident.status} size="xs" />
                        <ThreatBadge threat={incident.threatType} size="xs" severity={incident.severity} />
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
    </>
  );
}
