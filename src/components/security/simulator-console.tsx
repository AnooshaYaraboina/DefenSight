"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronRight, CircleDot, Crosshair, Loader2, Play, Siren, TriangleAlert, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AttackChain } from "./attack-chain";
import { RiskBreakdown } from "./risk-breakdown";
import { DecisionBadge, ThreatBadge } from "./indicators";
import { RiskPill } from "./risk-score";
import { CodePanel } from "./evidence";
import { formatDuration } from "@/lib/utils/format";
import type { SimulatorScenario } from "@/lib/simulator/scenarios";
import type { Decision, Severity, ThreatType } from "@/lib/engine/taxonomy";
import type { RiskFactor, StageTrace } from "@/lib/engine/types";

interface RunResult {
  scenarioKey: string;
  eventId: string;
  eventRef: string;
  incidentRef?: string;
  durationMs: number;
  passed: boolean;
  grading: {
    threats: { expected: string[]; detected: string[]; met: string[]; passed: boolean };
    decision: { expected: string[]; actual: string; passed: boolean };
    risk: { minimum: number; actual: number; passed: boolean };
  };
  result: {
    decision: Decision;
    riskScore: number;
    severity: Severity;
    threatTypes: ThreatType[];
    blocked: boolean;
    redacted: boolean;
    summary: string;
    latencyMs: number;
    detections: Array<{ detectorId: string; layer: string; threatType: string; confidence: number; severity: string; explanation: string }>;
    risk: { score: number; rationale: string; topDrivers: string[]; factors: RiskFactor[] };
    policies: Array<{ key: string; name: string; action: string; conditions: string[] }>;
    toolDecisions: Array<{ tool: string; operation: string; decision: string; riskScore: number; reason: string; failedChecks: string[] }>;
    withheldRetrievals: Array<{ documentId: string; title: string; reason: string }>;
    intent: { divergence: number; unrelatedActions: string[]; explanation: string } | null;
    stageTrace: StageTrace[];
  };
}

/**
 * Attack simulator console (§19).
 *
 * Presents each run as Attack → Detection → Risk Score → Defense → Final
 * Result, and grades the outcome against what the scenario asserts the platform
 * should do. Runs go through the production pipeline, so a control regression
 * shows up here as a failed scenario rather than being papered over.
 */
export function SimulatorConsole({ scenarios }: { scenarios: SimulatorScenario[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState(scenarios[0].key);
  const [running, setRunning] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, RunResult>>({});
  const [runningAll, setRunningAll] = React.useState(false);

  const scenario = scenarios.find((s) => s.key === selected)!;
  const result = results[selected];

  async function run(key: string) {
    setRunning(key);
    try {
      const res = await fetch("/api/simulate/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");
      setResults((prev) => ({ ...prev, [key]: data }));
      if (data.passed) {
        toast.success(`${scenarios.find((s) => s.key === key)?.name}: defended`, {
          description: data.result.summary,
        });
      } else {
        toast.error(`${scenarios.find((s) => s.key === key)?.name}: control gap`, {
          description: "The engine's verdict did not meet this scenario's expectation.",
        });
      }
      return data as RunResult;
    } catch (error) {
      toast.error("Simulation failed", {
        description: error instanceof Error ? error.message : undefined,
      });
      return null;
    } finally {
      setRunning(null);
    }
  }

  async function runAll() {
    setRunningAll(true);
    for (const s of scenarios) {
      setSelected(s.key);
      await run(s.key);
    }
    setRunningAll(false);
    router.refresh();
  }

  const completed = Object.values(results);
  const passedCount = completed.filter((r) => r.passed).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* -------------------------------------------------- scenario list */}
      <div className="min-w-0 space-y-3">
        <Card className="p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-2">
              {scenarios.length} scenarios
            </span>
            {completed.length > 0 && (
              <span
                className={cn(
                  "font-mono text-[11px] tabular",
                  passedCount === completed.length ? "text-allow" : "text-critical",
                )}
              >
                {passedCount}/{completed.length} defended
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={runAll}
            loading={runningAll}
            disabled={running !== null}
          >
            <Zap />
            Run full test suite
          </Button>
        </Card>

        <ul className="space-y-1.5">
          {scenarios.map((s) => {
            const r = results[s.key];
            const isRunning = running === s.key;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setSelected(s.key)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                    selected === s.key
                      ? "border-brand/40 bg-brand-dim/30"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" />
                    ) : r ? (
                      r.passed ? (
                        <Check className="size-3.5 shrink-0 text-allow" />
                      ) : (
                        <TriangleAlert className="size-3.5 shrink-0 text-critical" />
                      )
                    ) : (
                      <CircleDot className="size-3.5 shrink-0 text-ink-4" />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate text-xs font-medium",
                        selected === s.key ? "text-ink" : "text-ink-2",
                      )}
                    >
                      {s.name}
                    </span>
                    {r && <RiskPill score={r.result.riskScore} />}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-ink-4">{s.category}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ------------------------------------------------------- detail */}
      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Crosshair className="size-4 text-critical" />
                <h2 className="text-base font-semibold tracking-tight text-ink">{scenario.name}</h2>
                <Badge tone="outline" size="xs">{scenario.category}</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-2">
                {scenario.description}
              </p>
            </div>
            <Button
              onClick={() => run(scenario.key)}
              loading={running === scenario.key}
              disabled={runningAll}
            >
              <Play />
              Run scenario
            </Button>
          </div>

          <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Attacker objective
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-ink-2">{scenario.objective}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Control under test
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-ink-2">{scenario.control}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2.5">
            <CodePanel label="Attack payload" tone="danger" copyValue={scenario.prompt}>
              <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
                {scenario.prompt}
              </p>
            </CodePanel>

            {scenario.documents && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-high/25 bg-high-dim/20 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-high">
                  Retrieved
                </span>
                {scenario.documents.map((d) => (
                  <span key={d} className="text-[11px] text-ink-2">{d}</span>
                ))}
              </div>
            )}

            {scenario.toolCalls && (
              <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  Tool calls the agent will attempt
                </p>
                <ul className="space-y-1">
                  {scenario.toolCalls.map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                        {t.slug}
                      </code>
                      <Badge tone="outline" size="xs">{t.operation}</Badge>
                      <span className="truncate font-mono text-[10px] text-ink-4">
                        {JSON.stringify(t.args).slice(0, 90)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        {result ? (
          <ResultPanel result={result} />
        ) : (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-full border border-line bg-surface-2">
              <Play className="size-5 text-ink-4" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium text-ink-2">Scenario not yet run</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-4">
                Running pushes this attack through the production pipeline. The detections, risk
                score and decision shown will be whatever the engine actually concludes — nothing
                here is scripted.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ result */

const FLOW = ["Attack", "Detection", "Risk Score", "Defense", "Final Result"];

function ResultPanel({ result }: { result: RunResult }) {
  const r = result.result;

  return (
    <>
      {/* Verdict banner */}
      <Card
        className={cn(
          "overflow-hidden",
          result.passed ? "border-allow/35" : "border-critical/40",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 px-5 py-4",
            result.passed ? "bg-allow-dim/25" : "bg-critical-dim/25",
          )}
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              result.passed ? "bg-allow/20 text-allow" : "bg-critical/20 text-critical",
            )}
          >
            {result.passed ? <Check className="size-5" /> : <TriangleAlert className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold", result.passed ? "text-allow" : "text-critical")}>
              {result.passed ? "Attack defended" : "Control gap — expectation not met"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{r.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RiskPill score={r.riskScore} showLabel />
            <DecisionBadge decision={r.decision} />
          </div>
        </div>

        {/* Attack → Detection → Risk Score → Defense → Final Result */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-5 py-3">
          {FLOW.map((step, i) => (
            <React.Fragment key={step}>
              {i > 0 && <ChevronRight className="size-3 text-ink-4" />}
              <span
                className={cn(
                  "rounded border px-2 py-0.5 text-[10px] font-medium",
                  i === FLOW.length - 1
                    ? result.passed
                      ? "border-allow/35 bg-allow-dim text-allow"
                      : "border-critical/35 bg-critical-dim text-critical"
                    : "border-brand/30 bg-brand-dim/40 text-brand",
                )}
              >
                {step}
              </span>
            </React.Fragment>
          ))}
          <span className="ml-auto font-mono text-[10px] text-ink-4">
            pipeline {formatDuration(r.latencyMs)} · round trip {formatDuration(result.durationMs)}
          </span>
        </div>
      </Card>

      {/* Grading */}
      <Card className="p-4">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">
          Assertion check
        </h3>
        <ul className="space-y-2">
          <GradeRow
            label="Threats detected"
            passed={result.grading.threats.passed}
            expected={result.grading.threats.expected.map((t) => t.replace(/_/g, " ").toLowerCase()).join(", ")}
            actual={
              result.grading.threats.detected.length
                ? result.grading.threats.detected.map((t) => t.replace(/_/g, " ").toLowerCase()).join(", ")
                : "none"
            }
          />
          <GradeRow
            label="Decision"
            passed={result.grading.decision.passed}
            expected={result.grading.decision.expected.join(" or ").toLowerCase()}
            actual={result.grading.decision.actual.toLowerCase()}
          />
          <GradeRow
            label="Risk score"
            passed={result.grading.risk.passed}
            expected={`at least ${result.grading.risk.minimum}`}
            actual={String(result.grading.risk.actual)}
          />
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">
            Detections ({r.detections.length})
          </h3>
          {r.detections.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-4">No detector fired.</p>
          ) : (
            <ul className="space-y-2">
              {r.detections.slice(0, 8).map((d, i) => (
                <li key={i} className="rounded-md border border-line bg-surface-2/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ThreatBadge threat={d.threatType as ThreatType} size="xs" severity={d.severity as Severity} withTooltip={false} />
                    <Badge tone="outline" size="xs">{d.layer}</Badge>
                    <span className="ml-auto font-mono text-[10px] text-ink-4">
                      {(d.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-ink-3">
                    {d.explanation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">
            Defensive actions
          </h3>
          <div className="space-y-3">
            {r.policies.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  Policies matched
                </p>
                <ul className="space-y-1">
                  {r.policies.map((p) => (
                    <li key={p.key} className="flex items-center gap-2 rounded border border-line bg-surface-2/40 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{p.name}</span>
                      <DecisionBadge decision={p.action as Decision} size="xs" showIcon={false} withTooltip={false} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.toolDecisions.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  Tool gateway
                </p>
                <ul className="space-y-1">
                  {r.toolDecisions.map((t, i) => (
                    <li key={i} className="rounded border border-line bg-surface-2/40 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                          {t.tool} ({t.operation})
                        </span>
                        <DecisionBadge decision={t.decision as Decision} size="xs" showIcon={false} withTooltip={false} />
                      </div>
                      {t.failedChecks.length > 0 && (
                        <p className="mt-1 text-[10px] text-critical">
                          Failed: {t.failedChecks.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.withheldRetrievals.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  Content withheld
                </p>
                <ul className="space-y-1">
                  {r.withheldRetrievals.map((w) => (
                    <li key={w.documentId} className="rounded border border-critical/25 bg-critical-dim/25 px-2 py-1.5">
                      <p className="truncate text-[11px] text-ink-2">{w.title}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-critical">{w.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.intent && r.intent.divergence > 0 && (
              <div className="rounded border border-medium/30 bg-medium-dim/25 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-medium">
                  Agent divergence {(r.intent.divergence * 100).toFixed(0)}%
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{r.intent.explanation}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">Attack chain</h3>
          <AttackChain stages={r.stageTrace} />
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">
              Risk assessment
            </h3>
            <RiskBreakdown
              score={r.risk.score}
              confidence={0.9}
              rationale={r.risk.rationale}
              factors={r.risk.factors}
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-[13px] font-semibold tracking-tight text-ink">
              Recorded evidence
            </h3>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-3">
              This run is a real security event. It appears in the monitor, contributes to
              analytics, and is fully investigable.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/monitor/${result.eventId}`}>
                  <Crosshair />
                  {result.eventRef}
                </Link>
              </Button>
              {result.incidentRef && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/incidents">
                    <Siren />
                    {result.incidentRef}
                  </Link>
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function GradeRow({
  label,
  passed,
  expected,
  actual,
}: {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border px-3 py-2",
        passed ? "border-allow/25 bg-allow-dim/20" : "border-critical/30 bg-critical-dim/20",
      )}
    >
      {passed ? (
        <Check className="size-3.5 shrink-0 text-allow" />
      ) : (
        <X className="size-3.5 shrink-0 text-critical" />
      )}
      <span className="text-[11px] font-medium text-ink-2">{label}</span>
      <span className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[10px]">
        <span className="text-ink-4">expected {expected}</span>
        <span className={passed ? "text-allow" : "text-critical"}>got {actual}</span>
      </span>
    </li>
  );
}
