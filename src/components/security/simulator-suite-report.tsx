"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Ban,
  Check,
  EyeOff,
  FileX2,
  Layers,
  Scale,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SimulatorScenario } from "@/lib/simulator/scenarios";

/**
 * What the suite proves, rather than what each scenario did.
 *
 * A run used to leave eight separate verdicts and no way to read them together.
 * The question a reviewer actually asks is not "did prompt injection pass" but
 * "what does passing all of these establish" — which controls were exercised,
 * on which side of the model, and what is left untouched.
 *
 * The matrix answers the first half: inbound and outbound are graded separately
 * because a scenario can recognise an attack in the prompt and never look at the
 * reply. The coverage panel answers the second: everything the eight runs
 * collectively reached, counted from the runs themselves rather than asserted.
 */

export interface SuiteRow {
  key: string;
  name: string;
  category: string;
  passed: boolean | null;
  inbound: boolean;
  outbound: boolean | null;
  decision: string;
  riskScore: number;
  durationMs: number;
  eventId: string;
  incidentRef?: string;
  threatTypes: string[];
  layers: string[];
  outboundControls: string[];
  policies: string[];
  toolsRefused: number;
  documentsWithheld: number;
  redacted: boolean;
}

const DECISION_TONE: Record<string, string> = {
  BLOCK: "text-critical",
  REDACT: "text-redact",
  REQUIRE_APPROVAL: "text-approval",
  WARN: "text-warn",
  ALLOW: "text-ink-3",
};

function Tick({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <span className="font-mono text-[11px] text-ink-4">—</span>;
  }
  return ok ? (
    <Check className="size-3.5 text-allow" aria-label="passed" />
  ) : (
    <TriangleAlert className="size-3.5 text-critical" aria-label="failed" />
  );
}

function CoverageBlock({
  icon: Icon,
  label,
  items,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: string[];
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <Icon className="size-3 shrink-0 translate-y-0.5 text-ink-4" />
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
          {label}
        </span>
        <span className="ml-auto font-mono text-[12px] font-semibold tabular text-ink">
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {items.map((t) => (
            <span
              key={t}
              className="rounded bg-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-3"
            >
              {t.toLowerCase().replace(/^output\./, "").replace(/[_-]/g, " ")}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-ink-4">{hint ?? "Nothing reached this control."}</p>
      )}
    </div>
  );
}

export function SuiteReport({
  rows,
  scenarios,
  onOpen,
}: {
  rows: SuiteRow[];
  scenarios: SimulatorScenario[];
  onOpen: (key: string) => void;
}) {
  const graded = rows.filter((r) => r.passed !== null);
  const defended = graded.filter((r) => r.passed).length;
  const clean = graded.length > 0 && defended === graded.length;
  const totalMs = rows.reduce((n, r) => n + r.durationMs, 0);

  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const threatTypes = uniq(rows.flatMap((r) => r.threatTypes));
  const layers = uniq(rows.flatMap((r) => r.layers));
  const outboundControls = uniq(rows.flatMap((r) => r.outboundControls));
  const policies = uniq(rows.flatMap((r) => r.policies));

  const toolsRefused = rows.reduce((n, r) => n + r.toolsRefused, 0);
  const documentsWithheld = rows.reduce((n, r) => n + r.documentsWithheld, 0);
  const redactions = rows.filter((r) => r.redacted).length;
  const notRun = scenarios.filter((s) => !rows.some((r) => r.key === s.key));

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- headline */}
      <Card
        className={cn("overflow-hidden", clean ? "border-allow/35" : "border-critical/40")}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 px-5 py-4",
            clean ? "bg-allow-dim/25" : "bg-critical-dim/25",
          )}
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              clean ? "bg-allow/20 text-allow" : "bg-critical/20 text-critical",
            )}
          >
            {clean ? <ShieldCheck className="size-5" /> : <TriangleAlert className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-semibold",
                clean ? "text-allow" : "text-critical",
              )}
            >
              {defended}/{graded.length} defended
              {clean ? " — every control held" : " — control gaps below"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">
              Each run went through the production pipeline and is recorded as a real security
              event. Inbound and outbound are graded separately.
            </p>
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular text-ink-3">
            {(totalMs / 1000).toFixed(1)}s total
          </span>
        </div>
      </Card>

      {/* --------------------------------------------------------- matrix */}
      <Card className="p-4">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">Scenario matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["Scenario", "In", "Out", "Decision", "Risk", "Time", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className={cn(
                      "pb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-4",
                      i === 0 ? "text-left" : "text-center",
                      i >= 4 && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onOpen(r.key)}
                      className="group text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60"
                    >
                      <span className="block text-[12px] font-medium text-ink-2 group-hover:text-ink">
                        {r.name}
                      </span>
                      <span className="block font-mono text-[9px] text-ink-4">{r.category}</span>
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    <span className="inline-flex justify-center"><Tick ok={r.inbound} /></span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="inline-flex justify-center"><Tick ok={r.outbound} /></span>
                  </td>
                  <td className={cn("py-2 text-center font-mono text-[10px]", DECISION_TONE[r.decision] ?? "text-ink-3")}>
                    {r.decision.replace(/_/g, " ").toLowerCase()}
                  </td>
                  <td className="py-2 text-right font-mono text-[11px] tabular text-ink-2">
                    {r.riskScore}
                  </td>
                  <td className="py-2 text-right font-mono text-[10px] tabular text-ink-4">
                    {r.durationMs}ms
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <Link
                      href={`/monitor/${r.eventId}`}
                      className="inline-flex items-center gap-0.5 font-mono text-[9.5px] text-brand-text hover:underline"
                    >
                      event
                      <ArrowUpRight className="size-2.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {notRun.length > 0 && (
          <p className="mt-3 border-t border-line pt-2.5 font-mono text-[9.5px] text-ink-4">
            not run: {notRun.map((s) => s.name).join(", ")}
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------- coverage */}
      <Card className="p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">
            What this suite exercised
          </h3>
          <p className="font-mono text-[9.5px] text-ink-4">
            counted from the runs, not asserted
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CoverageBlock icon={Ban} label="Threat types detected" items={threatTypes} />
          <CoverageBlock icon={Layers} label="Detection layers used" items={layers} />
          <CoverageBlock
            icon={EyeOff}
            label="Outbound controls fired"
            items={outboundControls}
            hint="No reply was screened — the outbound half is untested."
          />
          <CoverageBlock icon={Scale} label="Policies matched" items={policies} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
          {[
            { icon: Wrench, label: "Tool calls refused", value: toolsRefused },
            { icon: FileX2, label: "Documents withheld", value: documentsWithheld },
            { icon: EyeOff, label: "Replies redacted", value: redactions },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <m.icon className={cn("size-3.5 shrink-0", m.value > 0 ? "text-brand" : "text-ink-4")} />
              <div className="min-w-0">
                <p className={cn("font-mono text-[15px] font-semibold tabular", m.value > 0 ? "text-ink" : "text-ink-3")}>
                  {m.value}
                </p>
                <p className="truncate text-[9.5px] text-ink-4">{m.label}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* -------------------------------------------------------- gaps */}
      {graded.some((r) => !r.passed) && (
        <Card className="border-critical/40 p-4">
          <h3 className="mb-2 text-[13px] font-semibold tracking-tight text-critical">
            Control gaps
          </h3>
          <ul className="space-y-1.5">
            {graded
              .filter((r) => !r.passed)
              .map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <TriangleAlert className="size-3 shrink-0 text-critical" />
                  <button
                    type="button"
                    onClick={() => onOpen(r.key)}
                    className="text-[11px] text-ink-2 underline-offset-2 hover:underline"
                  >
                    {r.name}
                  </button>
                  <Badge tone="outline" size="xs">
                    {!r.inbound && !r.outbound ? "both sides" : !r.inbound ? "inbound" : "outbound"}
                  </Badge>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
