import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { C, s, duration, excerpt, formatWhen, severityColour } from "./theme";
import { Bar, Chip, CoverMark, Field, PageFooter, Section } from "./parts";

/**
 * Every incident in a window, in one document.
 *
 * Deliberately not a stack of the single-incident reports. A reader who wants
 * one case opens that case's report; this one exists to answer questions the
 * individual reports cannot — what recurred, which controls carried the load,
 * how long cases stayed open, and what is still unresolved.
 *
 * So the per-incident entries here are condensed to a line each, and the space
 * goes to the aggregate. The register at the end is the compliance artefact:
 * every case, its disposition and its closing timestamp.
 */

export interface EstateRow {
  id: string;
  ref: string;
  title: string;
  severity: string;
  status: string;
  threatType: string;
  openedAt: Date;
  resolvedAt: Date | null;
  application: string | null;
  agent: string | null;
  resolution: string | null;
  riskScore: number;
  stoppedAt: string | null;
}

export interface EstateStats {
  events: number;
  blocked: number;
  redacted: number;
  approvals: number;
  quarantined: number;
  detectionLayers: string[];
  topThreats: Array<{ label: string; count: number }>;
  topControls: Array<{ label: string; count: number }>;
}

const label = (t: string) => t.toLowerCase().replace(/_/g, " ");

export function EstateReport({
  rows,
  stats,
  org,
  preparedFor,
  windowLabel,
  generatedAt,
}: {
  rows: EstateRow[];
  stats: EstateStats;
  org: string;
  preparedFor: string;
  windowLabel: string;
  generatedAt: Date;
}) {
  const when = formatWhen(generatedAt);
  const resolved = rows.filter((r) => r.status === "RESOLVED");
  const contained = rows.filter((r) => r.status === "CONTAINED");
  const open = rows.filter((r) => r.status === "OPEN" || r.status === "INVESTIGATING");
  const critical = rows.filter((r) => r.severity === "CRITICAL");

  const closed = [...resolved, ...contained].filter((r) => r.resolvedAt);
  const meanMinutes =
    closed.length > 0
      ? Math.round(
          closed.reduce(
            (n, r) => n + (new Date(r.resolvedAt!).getTime() - new Date(r.openedAt).getTime()) / 60000,
            0,
          ) / closed.length,
        )
      : 0;

  const REF = "ESTATE REVIEW";

  return (
    <Document
      title={`DefenSight — Incident Review, ${windowLabel}`}
      author="DefenSight"
      subject={`Consolidated incident review for ${org}`}
      creator="DefenSight Security Console"
    >
      {/* ============================================================ cover */}
      <Page size="A4" style={s.cover}>
        <CoverMark />
        <Text style={s.coverEyebrow}>CONSOLIDATED SECURITY REVIEW</Text>
        <Text style={s.coverTitle}>Incident review{"\n"}{windowLabel}</Text>
        <Text style={s.coverLead}>
          Every case raised in this window, its final disposition, and what the estate&rsquo;s
          defences did about it.
        </Text>
        <View style={s.coverRule} />

        <View style={s.coverMetaRow}>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>INCIDENTS</Text>
            <Text style={s.coverMetaValue}>{rows.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>RESOLVED</Text>
            <Text style={[s.coverMetaValue, { color: "#3ddbb8" }]}>{resolved.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>CRITICAL</Text>
            <Text style={[s.coverMetaValue, { color: "#ff6b81" }]}>{critical.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>STILL OPEN</Text>
            <Text style={s.coverMetaValue}>{open.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>REQUESTS ANALYSED</Text>
            <Text style={s.coverMetaValue}>{stats.events.toLocaleString()}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>MEAN TIME TO CLOSE</Text>
            <Text style={s.coverMetaValue}>
              {meanMinutes < 60 ? `${meanMinutes} min` : `${Math.round(meanMinutes / 60)} h`}
            </Text>
          </View>
        </View>

        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>{org.toUpperCase()}</Text>
          <Text style={s.coverFooterText}>PREPARED FOR {preparedFor.toUpperCase()}</Text>
          <Text style={s.coverFooterText}>{when}</Text>
        </View>
      </Page>

      {/* ========================================================= posture */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={REF} generatedAt={when} />

        <Section index="01" title="Where the estate stands">
          <Text style={s.lead}>
            {rows.length} incidents were raised in this window. {resolved.length} are resolved,{" "}
            {contained.length} contained and {open.length} still open. The pipeline evaluated{" "}
            {stats.events.toLocaleString()} requests over the same period and acted on{" "}
            {stats.blocked} of them.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            <Field label="Requests blocked" value={String(stats.blocked)} width="25%" />
            <Field label="Responses redacted" value={String(stats.redacted)} width="25%" />
            <Field label="Awaiting approval" value={String(stats.approvals)} width="25%" />
            <Field label="Documents quarantined" value={String(stats.quarantined)} width="25%" />
          </View>
        </Section>

        {stats.topThreats.length > 0 && (
          <Section index="02" title="What recurred">
            <Text style={s.body}>
              Threat types by volume. A single dominant type is a tuning question as often as it is
              an attack pattern.
            </Text>
            <View style={{ marginTop: 10 }}>
              {stats.topThreats.slice(0, 8).map((t) => (
                <Bar
                  key={t.label}
                  label={label(t.label)}
                  value={t.count}
                  max={stats.topThreats[0]?.count ?? 1}
                  colour={C.brand}
                />
              ))}
            </View>
          </Section>
        )}

        {stats.topControls.length > 0 && (
          <Section index="03" title="Which controls carried the load">
            <Text style={s.body}>
              Policies by the number of requests they were the deciding control on.
            </Text>
            <View style={{ marginTop: 10 }}>
              {stats.topControls.slice(0, 8).map((c) => (
                <Bar
                  key={c.label}
                  label={c.label}
                  value={c.count}
                  max={stats.topControls[0]?.count ?? 1}
                  colour={C.allow}
                />
              ))}
            </View>
          </Section>
        )}
      </Page>

      {/* ================================================= closed register */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={REF} generatedAt={when} />

        <Section index="04" title="Closed cases">
          <Text style={s.body}>
            Every case closed in this window, with its disposition and closing record. This is the
            section an auditor reads.
          </Text>

          <View style={{ flexDirection: "row", marginTop: 12, paddingBottom: 4 }}>
            <Text style={[s.th, { width: "17%" }]}>REFERENCE</Text>
            <Text style={[s.th, { width: "40%" }]}>CASE</Text>
            <Text style={[s.th, { width: "13%" }]}>SEVERITY</Text>
            <Text style={[s.th, { width: "15%" }]}>CLOSED</Text>
            <Text style={[s.th, { width: "15%" }]}>OPEN FOR</Text>
          </View>

          {closed.length === 0 ? (
            <Text style={s.muted}>No cases were closed in this window.</Text>
          ) : (
            closed.map((r) => (
              <View key={r.id} style={[s.trBorder, { paddingVertical: 6 }]} wrap={false}>
                <View style={{ flexDirection: "row" }}>
                  <Text style={{ width: "17%", fontSize: 8.5, fontFamily: "Courier", color: C.inkSoft }}>
                    {r.ref}
                  </Text>
                  <Text style={{ width: "40%", fontSize: 9, color: C.ink, fontFamily: "Helvetica-Bold", paddingRight: 8 }}>
                    {excerpt(r.title, 58)}
                  </Text>
                  <Text style={{ width: "13%", fontSize: 8.5, color: severityColour(r.severity).fg, fontFamily: "Helvetica-Bold" }}>
                    {r.severity}
                  </Text>
                  <Text style={{ width: "15%", fontSize: 8, color: C.muted }}>
                    {r.resolvedAt ? formatWhen(r.resolvedAt).split(",")[0] : "—"}
                  </Text>
                  <Text style={{ width: "15%", fontSize: 8, color: C.muted }}>
                    {r.resolvedAt ? duration(r.openedAt, r.resolvedAt) : "—"}
                  </Text>
                </View>
                {r.resolution ? (
                  <Text style={[s.muted, { paddingLeft: "17%", paddingTop: 2 }]}>
                    {excerpt(r.resolution, 150)}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </Page>

      {/* ==================================================== still open */}
      {open.length > 0 && (
        <Page size="A4" style={s.page}>
          <PageFooter ref_={REF} generatedAt={when} />

          <Section index="05" title="Still open">
            <Text style={s.body}>
              Cases carried beyond this window. Ordered by severity, then by how long they have
              been open.
            </Text>
            <View style={{ marginTop: 10 }}>
              {open
                .slice()
                .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
                .map((r) => {
                  const col = severityColour(r.severity);
                  return (
                    <View key={r.id} style={[s.trBorder, { paddingVertical: 7 }]} wrap={false}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Chip label={r.severity} fg={col.fg} bg={col.bg} />
                        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink, flex: 1 }}>
                          {excerpt(r.title, 64)}
                        </Text>
                        <Text style={{ fontSize: 8, fontFamily: "Courier", color: C.muted }}>
                          {r.ref}
                        </Text>
                      </View>
                      <Text style={[s.muted, { paddingTop: 3 }]}>
                        {r.application ?? "—"}
                        {r.agent ? ` › ${r.agent}` : ""} · open {duration(r.openedAt, generatedAt)}
                        {r.stoppedAt ? ` · stopped at ${r.stoppedAt}` : ""}
                      </Text>
                    </View>
                  );
                })}
            </View>
          </Section>
        </Page>
      )}

      {/* ======================================================== closing */}
      <Page size="A4" style={s.page}>
        <PageFooter ref_={REF} generatedAt={when} />

        <Section index={open.length > 0 ? "06" : "05"} title="How to read this">
          <Text style={s.body}>
            Every figure in this document is read from recorded security events. The detections,
            risk contributions and pipeline traces are the engine&rsquo;s own output rather than a
            restatement of it, and each case listed here has a full report of its own containing
            the payload as submitted and the stage-by-stage trace.
          </Text>
          <View style={[s.card, { marginTop: 14 }]}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Field label="Window" value={windowLabel} width="50%" />
              <Field label="Organisation" value={org} width="50%" />
              <Field label="Prepared for" value={preparedFor} width="50%" />
              <Field label="Generated" value={when} width="50%" />
            </View>
          </View>
          <Text style={[s.muted, { marginTop: 12 }]}>
            Detection layers exercised in this window: {stats.detectionLayers.join(", ") || "none"}.
          </Text>
        </Section>
      </Page>
    </Document>
  );
}
