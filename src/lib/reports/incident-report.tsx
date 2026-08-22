import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { IncidentDetail } from "@/lib/queries/incidents";
import { C, s, decisionColour, duration, excerpt, formatWhen, severityColour } from "./theme";
import { Bar, Chip, CoverMark, Field, PageFooter, Section, StageTrace } from "./parts";

/**
 * One incident, closed out.
 *
 * Written to be read by three people who never meet: an analyst who wants the
 * trace, a manager who reads only the summary, and an auditor who wants the
 * framework mapping and the timestamps. The order below serves them in that
 * priority — evidence first, provenance last — and every figure in it comes
 * from the recorded event rather than being restated prose.
 */

const OWASP: Record<string, string> = {
  PROMPT_INJECTION: "LLM01 Prompt Injection",
  INDIRECT_PROMPT_INJECTION: "LLM01 Prompt Injection (indirect)",
  INSTRUCTION_OVERRIDE: "LLM01 Prompt Injection",
  ROLE_MANIPULATION: "LLM01 Prompt Injection",
  JAILBREAK: "LLM01 Prompt Injection",
  SYSTEM_PROMPT_EXTRACTION: "LLM07 System Prompt Leakage",
  RAG_POISONING: "LLM08 Vector and Embedding Weaknesses",
  MALICIOUS_DOCUMENT: "LLM08 Vector and Embedding Weaknesses",
  UNAUTHORIZED_DOCUMENT_ACCESS: "LLM02 Sensitive Information Disclosure",
  DATA_LEAKAGE: "LLM02 Sensitive Information Disclosure",
  DATA_EXFILTRATION: "LLM02 Sensitive Information Disclosure",
  SENSITIVE_DATA_EXPOSURE: "LLM02 Sensitive Information Disclosure",
  SECRET_EXPOSURE: "LLM02 Sensitive Information Disclosure",
  UNAUTHORIZED_TOOL_CALL: "LLM06 Excessive Agency",
  TOOL_ABUSE: "LLM06 Excessive Agency",
  EXCESSIVE_PERMISSIONS: "LLM06 Excessive Agency",
  AGENT_GOAL_DIVERGENCE: "LLM06 Excessive Agency",
  AGENT_ANOMALY: "LLM06 Excessive Agency",
};

const ATLAS: Record<string, string> = {
  PROMPT_INJECTION: "AML.T0051 LLM Prompt Injection",
  INDIRECT_PROMPT_INJECTION: "AML.T0051.001 Indirect",
  INSTRUCTION_OVERRIDE: "AML.T0054 LLM Jailbreak",
  JAILBREAK: "AML.T0054 LLM Jailbreak",
  ROLE_MANIPULATION: "AML.T0054 LLM Jailbreak",
  SYSTEM_PROMPT_EXTRACTION: "AML.T0056 Meta Prompt Extraction",
  RAG_POISONING: "AML.T0070 RAG Poisoning",
  MALICIOUS_DOCUMENT: "AML.T0070 RAG Poisoning",
  DATA_EXFILTRATION: "AML.T0057 LLM Data Leakage",
  DATA_LEAKAGE: "AML.T0057 LLM Data Leakage",
  SECRET_EXPOSURE: "AML.T0057 LLM Data Leakage",
  UNAUTHORIZED_TOOL_CALL: "AML.T0053 LLM Plugin Compromise",
  TOOL_ABUSE: "AML.T0053 LLM Plugin Compromise",
};

const label = (t: string) => t.toLowerCase().replace(/_/g, " ");

export function IncidentReport({
  incident,
  org,
  preparedFor,
  generatedAt,
}: {
  incident: IncidentDetail;
  org: string;
  preparedFor: string;
  generatedAt: Date;
}) {
  const when = formatWhen(generatedAt);
  const primary = incident.events[0];
  const detections = incident.events.flatMap((e) => e.detections);
  const topDetections = [...detections].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
  const refusedTools = incident.events.flatMap((e) =>
    e.toolCalls.filter((t) => t.decision === "BLOCK"),
  );
  const withheld = incident.events.flatMap((e) => e.retrievals.filter((r) => !r.allowed));
  const sensitive = incident.events.flatMap((e) => e.sensitiveHits);
  const resolved = incident.status === "RESOLVED" || incident.status === "CONTAINED";
  const closedAt = incident.resolvedAt ?? incident.timeline.at(-1)?.createdAt ?? null;

  const riskFactors =
    (primary?.riskFactors as Array<{ label?: string; contribution?: number }> | null) ?? [];

  return (
    <Document
      title={`${incident.ref} — Incident Report`}
      author="DefenSight"
      subject={incident.title}
      creator="DefenSight Security Console"
    >
      {/* ============================================================ cover */}
      <Page size="A4" style={s.cover}>
        <CoverMark />
        <Text style={s.coverEyebrow}>SECURITY INCIDENT REPORT</Text>
        <Text style={s.coverTitle}>{incident.title}</Text>
        <Text style={s.coverLead}>
          {excerpt(incident.summary ?? "", 240)}
        </Text>
        <View style={s.coverRule} />

        <View style={s.coverMetaRow}>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>REFERENCE</Text>
            <Text style={s.coverMetaValue}>{incident.ref}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>SEVERITY</Text>
            <Text style={[s.coverMetaValue, { color: severityColour(incident.severity).fg }]}>
              {incident.severity}
            </Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>STATUS</Text>
            <Text style={s.coverMetaValue}>{incident.status.replace(/_/g, " ")}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>THREAT</Text>
            <Text style={s.coverMetaValue}>{label(incident.threatType)}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>OPENED</Text>
            <Text style={s.coverMetaValue}>{formatWhen(incident.openedAt)}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>{resolved ? "TIME TO RESOLVE" : "AGE"}</Text>
            <Text style={s.coverMetaValue}>
              {duration(incident.openedAt, closedAt ?? new Date())}
            </Text>
          </View>
        </View>

        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>{org.toUpperCase()}</Text>
          <Text style={s.coverFooterText}>PREPARED FOR {preparedFor.toUpperCase()}</Text>
          <Text style={s.coverFooterText}>{when}</Text>
        </View>
      </Page>

      {/* ========================================================== content */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={incident.ref} generatedAt={when} />

        <Section index="01" title="Executive summary">
          <Text style={s.lead}>{incident.summary}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            <Field label="Application" value={incident.application?.name ?? "—"} />
            <Field label="Agent" value={incident.agent?.name ?? "—"} />
            <Field label="Requesting user" value={primary?.user?.name ?? "—"} />
            <Field
              label="Final decision"
              value={(primary?.decision ?? "—").replace(/_/g, " ")}
              colour={decisionColour(primary?.decision ?? "").fg}
            />
            <Field label="Risk score" value={`${primary?.riskScore ?? 0} / 100`} />
            <Field label="Events in case" value={String(incident.events.length)} />
          </View>
        </Section>

        <Section index="02" title="The attack">
          <Text style={s.body}>
            What reached the pipeline, as submitted. Nothing below is paraphrased.
          </Text>
          <View style={[s.quote, { marginTop: 8, marginBottom: 12 }]}>
            <Text style={[s.mono, { color: C.ink }]}>
              {excerpt(primary?.requestText ?? "No request body recorded.", 700)}
            </Text>
          </View>

          <Text style={s.h3}>Threats identified</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
            {(primary?.threatTypes ?? [incident.threatType]).map((t) => {
              const col = severityColour(incident.severity);
              return <Chip key={t} label={label(t)} fg={col.fg} bg={col.bg} />;
            })}
          </View>

          {topDetections.length > 0 && (
            <>
              <Text style={s.h3}>Detection confidence by layer</Text>
              {topDetections.map((d, i) => (
                <Bar
                  key={`${d.id}-${i}`}
                  label={`${label(d.threatType)}  ·  ${d.layer.toLowerCase()}`}
                  value={Math.round(d.confidence * 100)}
                  max={100}
                  suffix="%"
                  colour={severityColour(d.severity).fg}
                />
              ))}
            </>
          )}
        </Section>
      </Page>

      {/* ======================================================== pipeline */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={incident.ref} generatedAt={when} />

        <Section index="03" title="Defensive pipeline">
          <Text style={s.body}>
            Every request crosses the same ordered stages. This is the trace the engine recorded
            for this one, and the highlighted stage is where it was stopped.
          </Text>
          <View style={{ marginTop: 10 }}>
            <StageTrace stages={incident.attackChain} />
          </View>
        </Section>

        {riskFactors.length > 0 && (
          <Section index="04" title="Risk assessment">
            <Text style={s.body}>
              The score is explainable by construction: the contributions below sum to it.
            </Text>
            <View style={{ marginTop: 10 }}>
              {riskFactors.slice(0, 8).map((f, i) => (
                <Bar
                  key={i}
                  label={f.label ?? `Factor ${i + 1}`}
                  value={Math.round(f.contribution ?? 0)}
                  max={Math.max(...riskFactors.map((x) => x.contribution ?? 0), 1)}
                  colour={C.brand}
                />
              ))}
            </View>
          </Section>
        )}
      </Page>

      {/* ======================================================== controls */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={incident.ref} generatedAt={when} />

        <Section index="05" title="Controls that acted">
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Field label="Tool calls refused" value={String(refusedTools.length)} width="25%" />
            <Field label="Documents withheld" value={String(withheld.length)} width="25%" />
            <Field label="Sensitive values found" value={String(sensitive.length)} width="25%" />
            <Field
              label="Response redacted"
              value={primary?.redacted ? "Yes" : "No"}
              width="25%"
            />
          </View>

          {refusedTools.length > 0 && (
            <>
              <Text style={s.h3}>Refused tool calls</Text>
              {refusedTools.slice(0, 6).map((t) => (
                <View key={t.id} style={[s.trBorder, { paddingVertical: 5 }]}>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}>
                    {t.tool?.name ?? t.toolId} · {t.operation}
                  </Text>
                  <Text style={s.muted}>{t.reason ?? "Refused by the gateway."}</Text>
                </View>
              ))}
            </>
          )}

          {withheld.length > 0 && (
            <>
              <Text style={s.h3}>Documents withheld from retrieval</Text>
              {withheld.slice(0, 6).map((r) => (
                <View key={r.id} style={[s.trBorder, { paddingVertical: 5 }]}>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}>
                    {r.document?.title ?? "Document"}
                  </Text>
                  <Text style={s.muted}>
                    {r.document?.classification} · trust {r.document?.trustScore ?? "—"}/100
                    {r.document?.quarantined ? " · quarantined" : ""}
                    {r.withheldReason ? ` — ${r.withheldReason}` : ""}
                  </Text>
                </View>
              ))}
            </>
          )}
        </Section>

        <Section index="06" title="Response timeline">
          {incident.timeline.map((entry) => (
            <View
              key={entry.id}
              style={[s.trBorder, { flexDirection: "row", gap: 12, paddingVertical: 6 }]}
              wrap={false}
            >
              <Text style={{ fontSize: 8, fontFamily: "Courier", color: C.faint, width: 92 }}>
                {formatWhen(entry.createdAt)}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}>
                  {entry.kind.replace(/_/g, " ").toLowerCase()}
                </Text>
                <Text style={s.muted}>{entry.message}</Text>
              </View>
              {entry.actor ? (
                <Text style={{ fontSize: 8, color: C.muted, width: 90, textAlign: "right" }}>
                  {entry.actor}
                </Text>
              ) : null}
            </View>
          ))}
        </Section>
      </Page>

      {/* ========================================================= closing */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={incident.ref} generatedAt={when} />

        <Section index="07" title="Framework mapping">
          <Text style={s.body}>
            Where this incident sits against the two references a reviewer is most likely to
            ask for.
          </Text>
          <View style={{ marginTop: 10 }}>
            {(primary?.threatTypes ?? [incident.threatType]).map((t) => (
              <View
                key={t}
                style={[s.trBorder, { flexDirection: "row", paddingVertical: 7 }]}
                wrap={false}
              >
                <Text style={{ fontSize: 9, color: C.ink, width: "32%", fontFamily: "Helvetica-Bold" }}>
                  {label(t)}
                </Text>
                <Text style={{ fontSize: 9, color: C.inkSoft, width: "36%" }}>
                  {OWASP[t] ?? "—"}
                </Text>
                <Text style={{ fontSize: 9, color: C.inkSoft, width: "32%" }}>
                  {ATLAS[t] ?? "—"}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[s.muted, { marginTop: 8 }]}>
            OWASP Top 10 for LLM Applications, and MITRE ATLAS.
          </Text>
        </Section>

        {incident.aiRecommendations.length > 0 && (
          <Section index="08" title="Recommended follow-up">
            {incident.aiRecommendations.slice(0, 6).map((r, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 9, color: C.brand, fontFamily: "Helvetica-Bold" }}>
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text style={[s.body, { flex: 1 }]}>{r}</Text>
              </View>
            ))}
            <Text style={[s.muted, { marginTop: 6 }]}>
              Advisory. Automation runs after the verdict and never changes a decision, a score or
              a policy outcome.
            </Text>
          </Section>
        )}

        <Section index="09" title="Sign-off">
          <View style={s.card}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Field label="Case status" value={incident.status.replace(/_/g, " ")} width="50%" />
              <Field
                label={resolved ? "Closed" : "Still open"}
                value={closedAt ? formatWhen(closedAt) : "—"}
                width="50%"
              />
              <Field label="Assigned to" value={incident.assignedTo?.name ?? "Unassigned"} width="50%" />
              <Field label="Report prepared for" value={preparedFor} width="50%" />
            </View>
            {incident.resolution ? (
              <>
                <Text style={[s.th, { paddingTop: 4 }]}>RESOLUTION NOTE</Text>
                <Text style={s.body}>{incident.resolution}</Text>
              </>
            ) : null}
          </View>
          <Text style={[s.muted, { marginTop: 10 }]}>
            Generated by DefenSight on {when} from the recorded security event. Every figure in
            this document is read from that event rather than restated — the detections, the risk
            contributions and the pipeline trace are the engine&rsquo;s own output.
          </Text>
        </Section>
      </Page>
    </Document>
  );
}
