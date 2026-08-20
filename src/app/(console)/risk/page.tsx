import { Gauge, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getRiskEngineData } from "@/lib/queries/defense";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { StatTile } from "@/components/security/stat-tile";
import { OrdinalDistribution } from "@/components/charts/bar-charts";
import { RISK_WEIGHTS } from "@/lib/engine/risk";
import { severityFromRisk } from "@/lib/engine/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Risk Engine" };

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  threatConfidence: "How certain the detection engine is, after fusing all agreeing layers.",
  threatSeverity: "The intrinsic seriousness of the threat type identified, before confidence.",
  dataSensitivity: "Weight of the sensitive values found, with credentials far above identifiers.",
  toolSensitivity: "Blast radius of the highest-impact tool requested, and any refusals.",
  agentDivergence: "How far the agent's actions drift from the user's stated intent.",
  documentTrust: "Provenance of the least-trusted retrieved document. Also reduces risk when high.",
  clearanceBreach: "Distance between content classification and the requester's clearance.",
  userRisk: "The principal's standing behavioural risk. Reduces risk for trusted operators.",
  behaviouralDeviation: "Deviation from this subject's own rolling baseline, in standard deviations.",
  obfuscation: "Strength of deliberate concealment — encoding, invisible characters, homoglyphs.",
  toolVolume: "Number of tool calls against the agent's configured ceiling.",
  agentPosture: "The acting agent's security score. Reduces risk when strong.",
};

const THRESHOLDS = [
  { at: 15, label: "Low", note: "Recorded for correlation. No action." },
  { at: 40, label: "Medium", note: "Surfaced to analysts for review." },
  { at: 65, label: "High", note: "Elevated. Policies begin to warn." },
  { at: 85, label: "Critical", note: "Blocked by the catch-all backstop policy." },
];

export default async function RiskPage() {
  const data = await getRiskEngineData();
  const maxWeight = Math.max(...Object.values(RISK_WEIGHTS));

  return (
    <>
      <PageHeader
        title="AI Risk Engine"
        description="Every relevant interaction is scored 0-100 from independent weighted signals. The score is explainable by construction: each factor's contribution is recorded, and they sum to the score an analyst sees."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Requests Scored (7d)" value={data.scored} />
        <StatTile label="Average Score" value={Math.round(data.averageScore)} polarity="higher-is-worse" />
        <StatTile label="Scoring Factors" value={Object.keys(RISK_WEIGHTS).length} hint="Independent signals combined into the score." />
        <StatTile label="Factors Observed" value={data.factorStats.length} hint="Factors that actually contributed this week." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <OrdinalDistribution
            title="Score distribution"
            subtitle="Where scored requests land across the 0-100 scale."
            data={data.distribution.map((b) => ({
              label: b.band,
              value: b.count,
              sublabel: b.severity.charAt(0) + b.severity.slice(1).toLowerCase(),
            }))}
            height={190}
          />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Severity thresholds</CardTitle>
              <p className="mt-0.5 text-xs text-ink-3">
                Where the score crosses into each band, and what happens there.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {THRESHOLDS.map((t) => (
                <li key={t.at} className="flex items-center gap-3 rounded-md border border-line bg-surface-2/40 px-3 py-2.5">
                  <span className="w-10 shrink-0 font-mono text-sm font-semibold tabular text-ink">
                    {t.at}+
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-ink-2">{t.label}</span>
                    <span className="block text-[10px] text-ink-4">{t.note}</span>
                  </span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background: {
                        LOW: "var(--color-low)", MEDIUM: "var(--color-medium)",
                        HIGH: "var(--color-high)", CRITICAL: "var(--color-critical)",
                        INFO: "var(--color-info)",
                      }[severityFromRisk(t.at)],
                    }}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-3.5 text-brand" />
              Scoring model
            </CardTitle>
            <p className="mt-0.5 text-xs text-ink-3">
              Declared weight beside observed behaviour. Weights are the model&apos;s policy;
              the right-hand columns show what each factor actually did this week.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-4">Factor</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-4">What it measures</th>
                  <th className="py-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-4">Weight</th>
                  <th className="py-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-4">Observed</th>
                  <th className="py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-4">Avg points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(RISK_WEIGHTS)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, weight]) => {
                    const observed = data.factorStats.find((f) => f.key === key);
                    return (
                      <tr key={key}>
                        <td className="py-2.5 pr-3">
                          <span className="font-mono text-[11px] text-brand">{key}</span>
                        </td>
                        <td className="max-w-md py-2.5 pr-3 text-[11px] leading-relaxed text-ink-3">
                          {FACTOR_DESCRIPTIONS[key]}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center justify-end gap-2">
                            <span className="w-16">
                              <Meter value={(weight / maxWeight) * 100} tone="brand" aria-label={`Weight ${weight}`} />
                            </span>
                            <span className="w-5 text-right font-mono text-[11px] tabular text-ink-2">{weight}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-[11px] tabular text-ink-3">
                          {observed ? observed.occurrences : "—"}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[11px] tabular text-ink-2">
                          {observed ? observed.averageContribution.toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <Method
              title="Normalise first"
              detail="Every factor is scaled to 0-1 before weighting, so weights are comparable and changing one is a policy decision rather than a guess."
            />
            <Method
              title="Saturate, don't average"
              detail="Points accumulate with diminishing returns. Averaging would let a confirmed exfiltration be diluted by a dozen benign signals — exactly backwards for security."
            />
            <Method
              title="Some factors reduce risk"
              detail="A well-scoped read-only agent inside its baseline on a public document scores lower than the same request from an over-privileged one, and the score says so."
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Method({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2">
        <Info className="size-3 text-brand" />
        {title}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-4">{detail}</p>
    </div>
  );
}
