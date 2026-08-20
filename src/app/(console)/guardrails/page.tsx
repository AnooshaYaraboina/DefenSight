import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getGuardrails } from "@/lib/queries/defense";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/security/stat-tile";
import { GuardrailCard, type GuardrailRow } from "@/components/security/guardrail-card";
import { SectionHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guardrails" };

/** Maps each control type to the threat types it is responsible for. */
const CONTROL_THREATS: Record<string, string[]> = {
  PROMPT_INJECTION: ["PROMPT_INJECTION", "INSTRUCTION_OVERRIDE", "ROLE_MANIPULATION"],
  INDIRECT_INJECTION: ["INDIRECT_PROMPT_INJECTION", "RAG_POISONING"],
  JAILBREAK: ["JAILBREAK"],
  SYSTEM_PROMPT_EXTRACTION: ["SYSTEM_PROMPT_EXTRACTION"],
  SYSTEM_PROMPT_LEAK: ["SYSTEM_PROMPT_EXTRACTION"],
  ENCODED_PAYLOAD: ["ENCODED_PAYLOAD"],
  MALICIOUS_INSTRUCTION: ["TOOL_ABUSE", "PROMPT_INJECTION"],
  EXFILTRATION: ["DATA_EXFILTRATION"],
  UNSAFE_CONTENT: ["UNSAFE_OUTPUT"],
  CONFIDENTIAL_DATA: ["UNAUTHORIZED_DOCUMENT_ACCESS", "DATA_LEAKAGE"],
  UNAUTHORIZED_INFO: ["UNAUTHORIZED_ACCESS", "DATA_LEAKAGE"],
  PII: ["DATA_LEAKAGE", "SENSITIVE_DATA_EXPOSURE"],
  SECRETS: ["SECRET_EXPOSURE"],
};

export default async function GuardrailsPage() {
  const { guardrails, detectionCounts } = await getGuardrails();

  const input = guardrails.filter((g) => g.direction === "INPUT");
  const output = guardrails.filter((g) => g.direction === "OUTPUT");
  const disabled = guardrails.filter((g) => !g.enabled).length;

  const detectionsFor = (controlType: string) =>
    (CONTROL_THREATS[controlType] ?? []).reduce((s, t) => s + (detectionCounts[t] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Guardrails Center"
        description="Configurable input and output controls over the detection engine. Changes take effect on the next request — the pipeline reads this configuration per request rather than caching it at boot."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Controls Configured" value={guardrails.length} />
        <StatTile label="Input Controls" value={input.length} hint="Screen content before it reaches the model." />
        <StatTile label="Output Controls" value={output.length} hint="Screen the response before it reaches the user." />
        <StatTile label="Disabled" value={disabled} polarity="higher-is-worse" hint="Controls currently checking nothing." />
      </div>

      {disabled > 0 && (
        <Card className="mb-4 border-critical/35 bg-critical-dim/20">
          <CardContent className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-critical" />
            <div>
              <p className="text-xs font-semibold text-critical">
                {disabled} control{disabled === 1 ? " is" : "s are"} disabled
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                Requests that would have been caught are passing. Every disable is recorded in the
                audit log with the administrator who made the change.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="mb-6">
        <SectionHeader
          title={
            <span className="flex items-center gap-2">
              <ArrowDownToLine className="size-3.5 text-brand" />
              Input controls
            </span>
          }
          description="Applied to user prompts, retrieved documents, tool arguments and tool results before the model sees them."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {input.map((g) => (
            <GuardrailCard
              key={g.key}
              guardrail={g as GuardrailRow}
              detections={detectionsFor(g.controlType)}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title={
            <span className="flex items-center gap-2">
              <ArrowUpFromLine className="size-3.5 text-redact" />
              Output controls
            </span>
          }
          description="Applied to the model's response before delivery. A leak is a leak regardless of whether the model generated it or retrieved it."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {output.map((g) => (
            <GuardrailCard
              key={g.key}
              guardrail={g as GuardrailRow}
              detections={detectionsFor(g.controlType)}
            />
          ))}
        </div>
      </section>
    </>
  );
}
