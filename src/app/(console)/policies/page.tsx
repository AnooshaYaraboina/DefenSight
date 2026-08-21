import { Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getPolicies } from "@/lib/queries/defense";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricStrip } from "@/components/security/metric-strip";
import { PolicyTable, type PolicyRow } from "@/components/security/policy-table";
import { FACT_CATALOGUE } from "@/lib/engine/policy/facts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security Policies" };

export default async function PoliciesPage() {
  const { policies, evaluatedAgainst } = await getPolicies();
  const disabled = policies.filter((p) => !p.enabled).length;
  const blocking = policies.filter((p) => p.action === "BLOCK").length;
  const approval = policies.filter((p) => p.requiresApproval).length;

  return (
    <>
      <PageHeader
        title="Security Policy Engine"
        description="Policies are stored as declarative conditions and evaluated as data — adding or retuning one is a configuration change, not a deployment."
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Policies", value: policies.length },
          {
            label: "Blocking Policies",
            value: blocking,
            hint: "Policies whose action stops the request outright.",
          },
          {
            label: "Require Approval",
            value: approval,
            hint: "Policies that hold the action for a named human.",
          },
          { label: "Disabled", value: disabled, polarity: "higher-is-worse" },
        ]}
      />

      <Card className="mb-4 border-brand/20 bg-brand-dim/10">
        <CardContent className="flex gap-3">
          <Scale className="mt-0.5 size-4 shrink-0 text-brand" />
          <div>
            <p className="text-xs font-semibold text-brand">How policies are evaluated</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
              Every enabled policy is evaluated against the same fact bag for each request, and the
              final decision is the most restrictive outcome among those that matched. Evaluation
              is order-independent by construction: priority controls only the order results are
              reported in, so a stricter policy can never be overtaken by a looser one that ran
              later. All {policies.filter((p) => p.enabled).length} enabled policies were evaluated
              against {evaluatedAgainst.toLocaleString()} requests this week.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <PolicyTable policies={policies as PolicyRow[]} />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <div>
              <CardTitle>Available facts</CardTitle>
              <p className="mt-0.5 text-xs text-ink-3">
                The complete vocabulary a policy condition can reference.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {FACT_CATALOGUE.map((f) => (
                <li key={f.fact} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="font-mono text-[10px] text-brand-text">{f.fact}</code>
                    <span className="shrink-0 rounded bg-inset px-1 py-px font-mono text-[9px] text-ink-4">
                      {f.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-ink-4">{f.description}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
