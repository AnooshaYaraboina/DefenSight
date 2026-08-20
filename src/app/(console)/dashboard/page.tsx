import Link from "next/link";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { getDashboardData, RANGES } from "@/lib/queries/dashboard";
import { getRecentEvents } from "@/lib/queries/events";
import { getAttentionQueue } from "@/lib/queries/attention";
import { getWorkspaceData } from "@/lib/queries/workspace";
import { CommandStrip } from "@/components/dashboard/command-strip";
import { ThreatCanvas } from "@/components/dashboard/threat-canvas";
import { Workspace } from "@/components/dashboard/workspace";
import { AttentionQueue } from "@/components/security/attention-queue";
import { RangeSwitcher } from "@/components/security/range-switcher";
import { TrafficControls } from "@/components/security/traffic-controls";
import { SeverityBadge } from "@/components/security/indicators";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security Overview" };

/**
 * The dashboard.
 *
 * Three bands, each answering a different kind of question:
 *
 *   1. The command strip — the state of things, in one horizontal read.
 *   2. The canvas and the queue — what is happening, and what needs a person.
 *   3. The workspace — one focused view at a time, switched by segment.
 *
 * The previous version placed every capability in its own card on one page,
 * which is the failure mode this layout exists to avoid: nine metrics and three
 * charts competing meant nothing led, and a reader had to assemble the story
 * themselves. Here the hierarchy does that work.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeKey } = await searchParams;
  const [data, recentEvents, attention, workspace] = await Promise.all([
    getDashboardData(rangeKey),
    getRecentEvents(24),
    getAttentionQueue(6),
    getWorkspaceData(),
  ]);

  const tile = (key: string) => data.tiles.find((t) => t.key === key);

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------- masthead */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Security Overview</h1>
          <p className="mt-0.5 text-xs text-ink-3">
            Northwind Group · {data.range.label} window
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TrafficControls />
          <RangeSwitcher current={data.range.key} options={RANGES} />
        </div>
      </header>

      {/* ------------------------------------------------- band 1: the state */}
      <CommandStrip
        score={data.securityScore}
        scoreDelta={data.securityScoreDelta}
        threatLevel={data.threatLevel}
        requests={tile("requests")?.value ?? 0}
        blocked={tile("blocked")?.value ?? 0}
        criticalIncidents={tile("criticalIncidents")?.value ?? 0}
        window={data.range.label}
        pulse={data.sparklines.requests ?? []}
        className="ds-rise"
      />

      {/* ------------------------------------- band 2: the picture + the work */}
      <div className="grid gap-4 xl:h-[26.5rem] xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        <section
          className="ds-panel ds-rise flex min-w-0 flex-col p-4"
          style={{ animationDelay: "40ms" }}
        >
          <div className="mb-3 shrink-0">
            <h2 className="ds-eyebrow">Threat activity</h2>
            <p className="mt-1 text-xs text-ink-3">
              Volume over the last {data.range.label}, with critical severity traced separately.
              The band beneath shows what each bucket was made of.
            </p>
          </div>
          <div className="min-h-[15rem] flex-1">
            <ThreatCanvas data={data.canvas} fill />
          </div>
        </section>

        <section
          className="ds-panel ds-rise flex min-h-0 flex-col p-4"
          style={{ animationDelay: "80ms" }}
        >
          <AttentionQueue
            items={attention.items}
            counts={attention.counts}
            className="min-h-0 flex-1"
          />
        </section>
      </div>

      {/* ---------------------------------------------- band 3: the workspace */}
      <Workspace
        data={workspace}
        initialEvents={recentEvents}
        className="ds-rise"
      />

      {/* ------------------------------------------------------ what to do */}
      {workspace.recommendations.length > 0 && (
        <section className="ds-panel ds-rise p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="ds-eyebrow flex items-center gap-1.5">
              <Lightbulb className="size-3 text-medium" />
              Recommendations
            </h2>
            <span className="text-[10px] text-ink-4">
              Derived from current posture, not a generic checklist
            </span>
          </div>

          <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {workspace.recommendations.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="ds-panel-interactive group flex h-full flex-col rounded-md border border-line bg-surface-2/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <SeverityBadge severity={r.severity} size="xs" showIcon={false} withTooltip={false} />
                    <ArrowUpRight className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-2 text-[11px] font-medium leading-snug text-ink-2">{r.title}</p>
                  <p className="mt-1.5 flex-1 text-[11px] leading-relaxed text-ink-4">{r.detail}</p>
                  <p className="mt-2.5 text-[10px] text-brand">{r.action} →</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
