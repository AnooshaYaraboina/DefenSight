"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity, ArrowUpRight, Bot, Database, Layers, Lock, ShieldCheck, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveFeed } from "@/components/security/live-feed";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";
import type { WorkspaceData } from "@/lib/queries/workspace";
import {
  CHANNEL_META,
  DECISION_META,
  type Channel,
  type Decision,
} from "@/lib/engine/taxonomy";

/**
 * The segmented workspace.
 *
 * The single most important decision in this layout: only one of these views is
 * on screen at a time. Showing live activity, defensive posture, estate health
 * and data security simultaneously is what made the previous dashboard a wall —
 * four unrelated questions competing for the same attention, none of them
 * answered well.
 *
 * Each segment is a complete answer to one question. Switching is instant and
 * costs nothing, because the data is already loaded.
 */

const SEGMENTS = [
  { key: "live", label: "Live activity", icon: Activity, question: "What is happening right now?" },
  { key: "defense", label: "Defense", icon: ShieldCheck, question: "Are the controls holding?" },
  { key: "estate", label: "AI estate", icon: Bot, question: "Is the estate healthy?" },
  { key: "data", label: "Data security", icon: Lock, question: "Is anything leaving?" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

export function Workspace({
  data,
  initialEvents,
  className,
}: {
  data: WorkspaceData;
  initialEvents: LiveSecurityEvent[];
  className?: string;
}) {
  const [active, setActive] = React.useState<SegmentKey>("live");
  const segment = SEGMENTS.find((s) => s.key === active)!;

  return (
    <section className={cn("ds-panel flex min-h-0 flex-col", className)}>
      {/* --------------------------------------------------- segment control */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div
          role="tablist"
          aria-label="Workspace view"
          className="flex items-center gap-0.5 rounded-md bg-inset p-0.5"
        >
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={active === s.key}
              onClick={() => setActive(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150",
                active === s.key
                  ? "bg-surface-2 text-ink shadow-sm"
                  : "text-ink-4 hover:text-ink-2",
              )}
            >
              <s.icon className={cn("size-3.5", active === s.key && "text-brand")} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        <p className="hidden text-[11px] text-ink-4 md:block">{segment.question}</p>
      </div>

      <div key={active} className="ds-rise min-h-[16.5rem] flex-1 p-4">
        {active === "live" && (
          <LiveFeed initialEvents={initialEvents} limit={30} className="h-[22rem]" />
        )}
        {active === "defense" && <DefenseView data={data.defense} />}
        {active === "estate" && <EstateView data={data.estate} />}
        {active === "data" && <DataView data={data.data} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ defense */

function DefenseView({ data }: { data: WorkspaceData["defense"] }) {
  const layerMax = Math.max(1, ...data.layers.map((l) => l.detections));
  const decisionTotal = data.decisions.reduce((s, d) => s + d.count, 0) || 1;

  const DECISION_TONE: Record<Decision, string> = {
    ALLOW: "var(--color-viz-allow)",
    WARN: "var(--color-viz-warn)",
    REDACT: "var(--color-viz-redact)",
    REQUIRE_APPROVAL: "var(--color-viz-1)",
    BLOCK: "var(--color-viz-block)",
  };
  const ORDER = ["ALLOW", "WARN", "REDACT", "REQUIRE_APPROVAL", "BLOCK"] as const;
  const threatMax = Math.max(1, ...data.topThreats.map((t) => t.count));
  const SEVERITY_TONE: Record<string, string> = {
    CRITICAL: "var(--color-viz-ord-5)",
    HIGH: "var(--color-viz-ord-4)",
    MEDIUM: "var(--color-viz-ord-2)",
    LOW: "var(--color-viz-ord-1)",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
      <Region title="Control coverage" href="/guardrails" action="Configure">
        <div className="grid grid-cols-2 gap-3">
          <Figure
            value={`${data.guardrails.enabled}/${data.guardrails.total}`}
            label="Guardrails active"
            tone={data.guardrails.enabled === data.guardrails.total ? "text-allow" : "text-medium"}
          />
          <Figure
            value={`${data.policies.enabled}/${data.policies.total}`}
            label="Policies enabled"
            tone={data.policies.enabled === data.policies.total ? "text-allow" : "text-medium"}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
          {data.policies.blocking} policies stop a request outright. The most restrictive matched
          action always wins, so evaluation order cannot weaken a verdict.
        </p>
      </Region>

      <Region title="What was attempted" href="/threats" action="All threats">
        {data.topThreats.length === 0 ? (
          <p className="text-[11px] text-ink-4">
            No threats detected in this window. Every request cleared all four layers.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.topThreats.map((t) => (
              <li key={t.type}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-ink-2">{t.label}</span>
                  <span className="font-mono text-[11px] tabular text-ink-3">{t.count}</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-inset">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${(t.count / threatMax) * 100}%`,
                      background: SEVERITY_TONE[t.severity] ?? "var(--color-viz-primary)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Region>

      <Region title="Detection layers" href="/detections" action="Inspect">
        <ul className="space-y-2">
          {data.layers.map((l) => (
            <li key={l.layer}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] capitalize text-ink-2">{l.layer.toLowerCase()}</span>
                <span className="font-mono text-[11px] tabular text-ink-3">{l.detections}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-inset">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${(l.detections / layerMax) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Region>

      <Region title="Decisions taken" href="/monitor" action="Open monitor">
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-inset">
          {ORDER.map((d) => {
            const count = data.decisions.find((x) => x.decision === d)?.count ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={d}
                className="h-full rounded-full"
                style={{ width: `${(count / decisionTotal) * 100}%`, background: DECISION_TONE[d] }}
              />
            );
          })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {ORDER.map((d) => {
            const count = data.decisions.find((x) => x.decision === d)?.count ?? 0;
            if (count === 0) return null;
            return (
              <li key={d} className="flex items-center gap-1.5 text-[10px] text-ink-4">
                <span className="size-1.5 rounded-[1px]" style={{ background: DECISION_TONE[d] }} />
                {DECISION_META[d].label}
                <span className="font-mono tabular text-ink-3">{count}</span>
              </li>
            );
          })}
        </ul>

        {data.topPolicies.length > 0 && (
          <>
            <p className="ds-eyebrow mt-4">Most-hit policies</p>
            <ul className="mt-2 space-y-1.5">
              {data.topPolicies.slice(0, 4).map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-ink-3">{p.name}</span>
                  <span className="font-mono text-[11px] tabular text-ink-4">{p.hits}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Region>
    </div>
  );
}

/* ------------------------------------------------------------------- estate */

function EstateView({ data }: { data: WorkspaceData["estate"] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Region title="Applications" href="/applications" action="View all">
        <ul className="space-y-2.5">
          {data.applications.slice(0, 5).map((a) => (
            <li key={a.slug}>
              <Link href={`/applications/${a.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-ink-2 transition-colors group-hover:text-brand">
                    {a.name}
                  </span>
                  <span className="font-mono text-[11px] tabular text-ink-3">{a.score}</span>
                </div>
                <ScoreBar score={a.score} />
                <p className="mt-1 font-mono text-[10px] text-ink-4">
                  {a.requests} req · {a.blocked} blocked
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Region>

      <Region title="Agents at risk" href="/agents" action="View all">
        <ul className="space-y-2.5">
          {data.agents.slice(0, 5).map((a) => (
            <li key={a.slug}>
              <Link href={`/agents/${a.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-ink-2 transition-colors group-hover:text-brand">
                    {a.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 font-mono text-[9px]",
                      a.riskLevel === "CRITICAL" ? "bg-critical-dim text-critical"
                        : a.riskLevel === "HIGH" ? "bg-high-dim text-high"
                          : a.riskLevel === "MEDIUM" ? "bg-medium-dim text-medium"
                            : "bg-surface-2 text-ink-4",
                    )}
                  >
                    {a.riskLevel}
                  </span>
                </div>
                <ScoreBar score={a.score} />
                <p className="mt-1 font-mono text-[10px] text-ink-4">
                  {a.blocked} blocked · {a.denied} tool calls refused
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Region>

      <Region title="Tool surface" href="/tools" action="Open gateway">
        <div className="grid grid-cols-2 gap-3">
          <Figure value={data.tools.total} label="Registered tools" />
          <Figure value={data.tools.tier5} label="Tier 5 · irreversible" tone="text-critical" />
          <Figure value={data.tools.denied7d} label="Refused (7d)" tone={data.tools.denied7d > 0 ? "text-critical" : undefined} />
          <Figure value={data.tools.pendingApprovals} label="Awaiting approval" tone={data.tools.pendingApprovals > 0 ? "text-approval" : undefined} />
        </div>
        {data.leastPrivilege > 0 && (
          <p className="mt-3 rounded border border-medium/25 bg-medium-dim/20 px-2.5 py-2 text-[11px] leading-relaxed text-medium">
            {data.leastPrivilege} permissions granted but barely exercised.
          </p>
        )}
      </Region>
    </div>
  );
}

/* --------------------------------------------------------------------- data */

function DataView({ data }: { data: WorkspaceData["data"] }) {
  const categoryMax = Math.max(1, ...data.byCategory.map((c) => c.values));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Region title="Sensitive data found" href="/data-protection" action="Open">
        <div className="grid grid-cols-2 gap-3">
          <Figure value={data.sensitiveTotal} label="Values detected (7d)" />
          <Figure
            value={data.credentials}
            label="Credential exposures"
            tone={data.credentials > 0 ? "text-critical" : "text-allow"}
          />
        </div>
        <ul className="mt-3 space-y-2">
          {data.byCategory.slice(0, 5).map((c) => (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] capitalize text-ink-3">{c.category.toLowerCase()}</span>
                <span className="font-mono text-[11px] tabular text-ink-3">{c.values}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-inset">
                <div
                  className={cn(
                    "h-full rounded-full",
                    c.category === "CREDENTIAL" ? "bg-critical" : "bg-brand",
                  )}
                  style={{ width: `${(c.values / categoryMax) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Region>

      <Region title="Monitored channels" href="/data-protection" action="Details">
        <ul className="space-y-2">
          {data.byChannel.map((c) => (
            <li key={c.channel} className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2/40 px-2.5 py-2">
              <span className="truncate text-[11px] text-ink-2">
                {CHANNEL_META[c.channel as Channel]?.label ?? c.channel}
              </span>
              <span className="font-mono text-[11px] tabular text-ink-3">{c.values}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
          Every channel is scanned with validated patterns — Luhn, mod-97, entropy — not regex
          alone.
        </p>
      </Region>

      <Region title="Knowledge base" href="/rag" action="RAG security">
        <div className="grid grid-cols-2 gap-3">
          <Figure value={data.rag.documents} label="Documents indexed" />
          <Figure value={data.rag.quarantined} label="Quarantined" tone={data.rag.quarantined > 0 ? "text-critical" : "text-allow"} />
          <Figure value={data.rag.external} label="From external feeds" tone="text-medium" />
          <Figure value={data.rag.withheld7d} label="Retrievals withheld" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
          Lowest source trust is{" "}
          <span className="font-mono text-ink-3">{data.rag.lowestTrust}/100</span>. Trust is
          inherited from provenance and can only fall.
        </p>
      </Region>
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

function Region({
  title, href, action, children,
}: {
  title: string; href: string; action: string; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="ds-eyebrow">{title}</h3>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-[10px] text-ink-4 transition-colors hover:text-brand"
        >
          {action}
          <ArrowUpRight className="size-2.5" />
        </Link>
      </div>
      {children}
    </div>
  );
}

function Figure({
  value, label, tone,
}: {
  value: React.ReactNode; label: string; tone?: string;
}) {
  return (
    <div>
      <p className={cn("ds-figure text-lg", tone ?? "text-ink")}>{value}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-ink-4">{label}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-inset">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          score >= 80 ? "bg-allow" : score >= 65 ? "bg-medium" : "bg-critical",
        )}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

export { Database, Layers, Wrench };
