import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  C,
  duration,
  excerpt,
  formatDay,
  formatWhen,
  label,
  s,
  severityColour,
  share,
  statusColour,
  titleCase,
} from "./theme";
import {
  Bar,
  Callout,
  Chip,
  Col,
  Columns,
  Composition,
  ContentsRow,
  CoverMark,
  Field,
  PageFooter,
  RunningHeader,
  Section,
  StatTile,
  SubHead,
  THead,
  TRow,
} from "./parts";
import { ATLAS, GLOSSARY, OWASP } from "./frameworks";

/**
 * Every incident in a window, in one document.
 *
 * Deliberately not a stack of the single-incident reports. A reader who wants
 * one case opens that case's report; this one exists to answer questions the
 * individual reports cannot — what recurred, which controls carried the load,
 * where in the estate it happened, how long cases stayed open, and what is
 * still unresolved.
 *
 * The register at the end is the compliance artefact: every case in the
 * window, complete, with its disposition. Nothing is sampled and nothing is
 * truncated to make the page count smaller — an incomplete register is not
 * evidence of anything.
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
  detections: number;
  decisions: Array<{ label: string; count: number }>;
  layers: Array<{ label: string; count: number }>;
  topThreats: Array<{ label: string; count: number }>;
  topControls: Array<{ label: string; count: number }>;
  topGuardrails: Array<{ label: string; count: number; direction: string }>;
  estate: {
    applications: number;
    agents: number;
    policies: number;
    guardrails: number;
  };
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_ORDER = ["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED"];

/** Counts by a key, ordered by a fixed sequence first and then by volume. */
function tally<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function ranked(
  m: Map<string, number>,
): Array<{ label: string; count: number }> {
  return [...m]
    .map(([l, count]) => ({ label: l, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function EstateReport({
  rows,
  stats,
  org,
  preparedFor,
  windowLabel,
  windowDays,
  generatedAt,
}: {
  rows: EstateRow[];
  stats: EstateStats;
  org: string;
  preparedFor: string;
  windowLabel: string;
  windowDays: number;
  generatedAt: Date;
}) {
  const when = formatWhen(generatedAt);
  const windowStart = new Date(generatedAt.getTime() - windowDays * 86_400_000);

  const resolved = rows.filter((r) => r.status === "RESOLVED");
  const contained = rows.filter((r) => r.status === "CONTAINED");
  const open = rows.filter(
    (r) => r.status === "OPEN" || r.status === "INVESTIGATING",
  );
  const critical = rows.filter((r) => r.severity === "CRITICAL");

  const closed = [...resolved, ...contained]
    .filter((r) => r.resolvedAt)
    .sort(
      (a, b) =>
        new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime(),
    );

  const meanMinutes =
    closed.length > 0
      ? Math.round(
          closed.reduce(
            (n, r) =>
              n +
              (new Date(r.resolvedAt!).getTime() -
                new Date(r.openedAt).getTime()) /
                60000,
            0,
          ) / closed.length,
        )
      : 0;
  const meanLabel =
    closed.length === 0
      ? "n/a"
      : meanMinutes < 60
        ? `${meanMinutes} min`
        : `${Math.round(meanMinutes / 60)} h`;

  const sevCounts = tally(rows, (r) => r.severity);
  const statusCounts = tally(rows, (r) => r.status);
  const byApp = ranked(tally(rows, (r) => r.application ?? "Unattributed"));
  const byAgent = ranked(tally(rows, (r) => r.agent ?? "Unattributed"));

  /* One column per day of the window, including the days nothing happened —
     the gaps are as informative as the spikes, and dropping empty days would
     silently compress the timeline. */
  const daily: Array<{ day: string; value: number }> = [];
  for (let i = 0; i < windowDays; i += 1) {
    const from = new Date(windowStart.getTime() + i * 86_400_000);
    const to = new Date(from.getTime() + 86_400_000);
    daily.push({
      day: from.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value: rows.filter((r) => {
        const t = new Date(r.openedAt).getTime();
        return t >= from.getTime() && t < to.getTime();
      }).length,
    });
  }

  const actedOn = stats.blocked + stats.redacted + stats.approvals;
  const glossaryTerms = ranked(tally(rows, (r) => r.threatType)).filter(
    (t) => GLOSSARY[t.label] !== undefined,
  );

  /* Section numbers are assigned from the sections that actually render, so a
     window with nothing still open does not leave a gap in the sequence. */
  const order = [
    "summary",
    "posture",
    "breakdown",
    "threats",
    "controls",
    "surface",
    "activity",
    "coverage",
    "closed",
    ...(open.length > 0 ? ["open"] : []),
    "register",
    "method",
    "glossary",
    "frameworks",
  ];
  const n = (key: string) => String(order.indexOf(key) + 1).padStart(2, "0");

  const DOC = "Incident review";
  const REF = "ESTATE REVIEW";
  const chrome = (section: string) => (
    <>
      <RunningHeader doc={DOC} section={section} />
      <PageFooter ref_={REF} generatedAt={when} />
    </>
  );

  const registerCols: Col[] = [
    { label: "Reference", width: "14%" },
    { label: "Case", width: "28%" },
    { label: "Threat", width: "14%" },
    { label: "Application", width: "14%" },
    { label: "Sev", width: "8%" },
    { label: "Status", width: "10%" },
    { label: "Opened", width: "12%", align: "right" },
  ];

  return (
    <Document
      title={`DefenSight — Incident Review, ${windowLabel}`}
      author="DefenSight"
      subject={`Consolidated incident review for ${org}`}
      keywords="AI security, incident review, LLM, OWASP, MITRE ATLAS"
      creator="DefenSight Security Console"
    >
      {/* ============================================================ cover */}
      <Page size="A4" style={s.cover} bookmark={{ title: "Cover", fit: true }}>
        <CoverMark />
        <Text style={s.coverEyebrow}>CONSOLIDATED SECURITY REVIEW</Text>
        <Text style={s.coverTitle}>
          Incident review{"\n"}
          {windowLabel}
        </Text>
        <Text style={s.coverLead}>
          Every case raised in this window, its final disposition, and what the
          estate&rsquo;s defences did about it.
        </Text>
        <View style={s.coverRule} />

        <View style={s.coverMetaRow}>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>INCIDENTS RAISED</Text>
            <Text style={s.coverMetaValue}>{rows.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>REQUESTS ANALYSED</Text>
            <Text style={s.coverMetaValue}>
              {stats.events.toLocaleString()}
            </Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>CLOSED</Text>
            <Text style={[s.coverMetaValue, { color: "#4fd8b6" }]}>
              {closed.length}
            </Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>STILL OPEN</Text>
            <Text style={[s.coverMetaValue, { color: "#ff8095" }]}>
              {open.length}
            </Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>CRITICAL SEVERITY</Text>
            <Text style={s.coverMetaValue}>{critical.length}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>MEAN TIME TO CLOSE</Text>
            <Text style={s.coverMetaValue}>{meanLabel}</Text>
          </View>
        </View>

        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>{org.toUpperCase()}</Text>
          <Text style={s.coverFooterText}>
            PREPARED FOR {preparedFor.toUpperCase()}
          </Text>
          <Text style={s.coverFooterText}>{when}</Text>
        </View>
      </Page>

      {/* ========================================================= contents */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Contents", fit: true }}
      >
        {chrome("Contents")}

        <Text style={s.h1}>Contents</Text>
        <Text style={[s.body, { marginBottom: 12 }]}>
          The document runs from judgement to evidence. A reader who needs only
          the position should read sections {n("summary")} to {n("breakdown")};
          a reader verifying a specific case should go straight to the
          registers. Every section is bookmarked for the viewer sidebar.
        </Text>

        {/* Document control sits above the list, in one row, and never wraps.
            Below the list it overflowed onto a page of its own — and because
            each field wraps independently, it broke between the labels and
            their values, leaving three headings stranded on the page before. */}
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1.6,
            borderTopColor: C.ink900,
            borderBottomWidth: 0.75,
            borderBottomColor: C.ruleSoft,
            paddingTop: 9,
            marginBottom: 14,
          }}
          wrap={false}
        >
          <Field
            label="Classification"
            value="Confidential — internal"
            width="34%"
          />
          <Field label="Prepared for" value={preparedFor} width="33%" />
          <Field label="Generated" value={when} width="33%" />
        </View>

        <ContentsRow
          index={n("summary")}
          title="Executive summary"
          detail="What the window shows, and what needs a decision."
        />
        <ContentsRow
          index={n("posture")}
          title="Where the estate stands"
          detail="Volume, interventions and the standing configuration behind them."
        />
        <ContentsRow
          index={n("breakdown")}
          title="How the caseload breaks down"
          detail="Severity and status composition of every case raised."
        />
        <ContentsRow
          index={n("threats")}
          title="What recurred"
          detail="Threat types by volume, mapped to OWASP and MITRE ATLAS."
        />
        <ContentsRow
          index={n("controls")}
          title="Which controls carried the load"
          detail="Policies and guardrails ranked by the decisions they made."
        />
        <ContentsRow
          index={n("surface")}
          title="Where it happened"
          detail="Applications and agents that produced the caseload."
        />
        <ContentsRow
          index={n("activity")}
          title="Activity across the window"
          detail="Daily incident volume and the shape of the period."
        />
        <ContentsRow
          index={n("coverage")}
          title="Detection coverage"
          detail="Which layers fired, and what the pipeline decided."
        />
        <ContentsRow
          index={n("closed")}
          title="Closed case register"
          detail={`${closed.length} cases closed in this window, with disposition and closing record.`}
        />
        {open.length > 0 && (
          <ContentsRow
            index={n("open")}
            title="Cases still open"
            detail={`${open.length} cases carried beyond this window, oldest first.`}
          />
        )}
        <ContentsRow
          index={n("register")}
          title="Complete incident register"
          detail={`All ${rows.length} cases raised in the window, unabridged.`}
        />
        <ContentsRow
          index={n("method")}
          title="Method and provenance"
          detail="Where each figure comes from and how it was derived."
        />
        <ContentsRow
          index={n("glossary")}
          title="Threat glossary"
          detail="Plain definitions for every threat type named in this document."
        />
        <ContentsRow
          index={n("frameworks")}
          title="Control framework mapping"
          detail="OWASP Top 10 for LLM Applications and MITRE ATLAS references."
        />
      </Page>

      {/* ================================================ executive summary */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Executive summary", fit: true }}
      >
        {chrome("Executive summary")}

        <Section index={n("summary")} title="Executive summary">
          <Text style={s.lead}>
            Between {formatDay(windowStart)} and {formatDay(generatedAt)},
            DefenSight evaluated {stats.events.toLocaleString()} requests across{" "}
            {stats.estate.applications} registered AI applications and{" "}
            {stats.estate.agents} agents. It intervened on {actedOn} of them —{" "}
            {stats.blocked} blocked outright, {stats.redacted} responses
            redacted before reaching a user, and {stats.approvals} actions held
            for human approval — and removed {stats.quarantined} documents from
            retrieval.
          </Text>
          <Text style={[s.body, { marginBottom: 14 }]}>
            {rows.length} of those interventions were escalated into incidents.{" "}
            {closed.length} {closed.length === 1 ? "has" : "have"} since been
            closed, at a mean time to close of {meanLabel}, and {open.length}{" "}
            {open.length === 1 ? "remains" : "remain"} open at the end of the
            period. No attack in this window is recorded as having reached its
            objective: every case listed here was stopped at a named stage of
            the pipeline, and the stage is given for each one in the registers.
          </Text>

          <View style={{ flexDirection: "row", marginBottom: 16 }}>
            <StatTile
              label="Cases raised"
              value={rows.length}
              accent={C.brand}
              note={`over ${windowDays} days`}
            />
            <StatTile
              label="Closed"
              value={closed.length}
              accent={C.allow}
              note={share(closed.length, rows.length)}
            />
            <StatTile
              label="Still open"
              value={open.length}
              accent={C.critical}
              note={share(open.length, rows.length)}
            />
            <StatTile
              label="Mean close"
              value={meanLabel}
              accent={C.low}
              note="opened to resolved"
            />
          </View>

          <Callout
            title="What needs a decision"
            accent={C.critical}
            bg={C.criticalWash}
          >
            <View>
              {sevCounts.size === 1 && rows.length > 0 ? (
                <Text
                  style={{
                    fontSize: 9.4,
                    lineHeight: 1.6,
                    color: C.ink,
                    marginBottom: 6,
                  }}
                >
                  Every case in this window was raised at{" "}
                  {label([...sevCounts.keys()][0])} severity. A register with no
                  severity spread cannot be triaged by severity, and the scoring
                  thresholds should be reviewed before the next period.
                </Text>
              ) : null}
              {open.length > closed.length ? (
                <Text
                  style={{
                    fontSize: 9.4,
                    lineHeight: 1.6,
                    color: C.ink,
                    marginBottom: 6,
                  }}
                >
                  {open.length} of {rows.length} cases (
                  {share(open.length, rows.length)}) are still open, against{" "}
                  {closed.length} closed. The backlog is growing faster than it
                  is being worked, which is a staffing question rather than a
                  detection one.
                </Text>
              ) : null}
              {byApp.length > 0 &&
              byApp[0].count / Math.max(rows.length, 1) > 0.3 ? (
                <Text style={{ fontSize: 9.4, lineHeight: 1.6, color: C.ink }}>
                  {byApp[0].label} accounts for{" "}
                  {share(byApp[0].count, rows.length)} of the caseload on its
                  own. Either that application is exposed in a way the others
                  are not, or its policy set is tuned more aggressively —
                  section {n("surface")} carries the distribution.
                </Text>
              ) : null}
              {sevCounts.size > 1 &&
              open.length <= closed.length &&
              byApp.length === 0 ? (
                <Text style={{ fontSize: 9.4, lineHeight: 1.6, color: C.ink }}>
                  Nothing in this window departs from the expected pattern. The
                  registers are provided for verification rather than for
                  action.
                </Text>
              ) : null}
            </View>
          </Callout>

          <SubHead>What was stopped</SubHead>
          <Text style={s.body}>
            The figures below are counts of requests, not of incidents — a
            single case can span several requests, and a request can be acted on
            without becoming a case.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <StatTile
              label="Requests blocked"
              value={stats.blocked.toLocaleString()}
              accent={C.critical}
              note={share(stats.blocked, stats.events)}
            />
            <StatTile
              label="Responses redacted"
              value={stats.redacted.toLocaleString()}
              accent="#78338f"
              note="before delivery"
            />
            <StatTile
              label="Held for approval"
              value={stats.approvals.toLocaleString()}
              accent={C.low}
              note="awaiting a human"
            />
            <StatTile
              label="Docs quarantined"
              value={stats.quarantined.toLocaleString()}
              accent={C.medium}
              note="removed from retrieval"
            />
          </View>
        </Section>
      </Page>

      {/* ======================================= analysis, as a single flow
           Sections 02 to 08 share one Page element and paginate themselves.
           Giving each its own Page produced a document where most pages ended
           a third of the way down — technically correct, and it reads as
           padding. Letting them flow fills every page but the last. */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Analysis and controls", fit: true }}
      >
        {chrome("Analysis")}

        <Section index={n("posture")} title="Where the estate stands">
          <Text style={s.body}>
            The estate under management, and the standing configuration that
            produced the decisions in this report. Controls are counted as
            configured, not as triggered — section {n("controls")} covers what
            actually fired.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <StatTile
              label="AI applications"
              value={stats.estate.applications}
              accent={C.brand}
              note="registered and monitored"
            />
            <StatTile
              label="Agents"
              value={stats.estate.agents}
              accent={C.brand}
              note="under authorisation control"
            />
            <StatTile
              label="Policies"
              value={stats.estate.policies}
              accent={C.allow}
              note="in force"
            />
            <StatTile
              label="Guardrails"
              value={stats.estate.guardrails}
              accent={C.allow}
              note="configured"
            />
          </View>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <StatTile
              label="Requests analysed"
              value={stats.events.toLocaleString()}
              accent={C.ink900}
              note={`over ${windowDays} days`}
            />
            <StatTile
              label="Detections"
              value={stats.detections.toLocaleString()}
              accent={C.ink900}
              note="across all layers"
            />
            <StatTile
              label="Intervention rate"
              value={share(actedOn, stats.events)}
              accent={C.medium}
              note="requests acted on"
            />
            <StatTile
              label="Escalation rate"
              value={share(rows.length, stats.events)}
              accent={C.medium}
              note="requests becoming cases"
            />
          </View>
        </Section>

        <Section index={n("breakdown")} title="How the caseload breaks down">
          <SubHead>By severity</SubHead>
          <Composition
            total={rows.length}
            segments={SEVERITY_ORDER.filter(
              (sv) => (sevCounts.get(sv) ?? 0) > 0,
            ).map((sv) => ({
              label: titleCase(sv),
              value: sevCounts.get(sv) ?? 0,
              colour: severityColour(sv).fg,
            }))}
          />

          <SubHead>By status at the close of the window</SubHead>
          <Composition
            total={rows.length}
            segments={STATUS_ORDER.filter(
              (st) => (statusCounts.get(st) ?? 0) > 0,
            ).map((st) => ({
              label: titleCase(st),
              value: statusCounts.get(st) ?? 0,
              colour: statusColour(st).fg,
            }))}
          />

          <Text style={[s.muted, { marginTop: 12 }]}>
            Resolved means the case was investigated and closed with a recorded
            disposition. Contained means the threat was stopped and the surface
            secured, but the review is not finished. Open and investigating
            cases are listed in full later in this document.
          </Text>
        </Section>
        <Section
          index={n("threats")}
          title="What recurred"
          subtitle="Threat types by the number of cases they produced, with the external framework reference for each. A single dominant type is a tuning question as often as it is an attack pattern."
        >
          <THead
            repeat={false}
            cols={[
              { label: "Threat type", width: "26%" },
              { label: "Cases", width: "9%", align: "right" },
              { label: "Share", width: "9%", align: "right" },
              { label: "OWASP LLM Top 10", width: "30%" },
              { label: "MITRE ATLAS", width: "26%" },
            ]}
          />
          {stats.topThreats.length === 0 ? (
            <Text style={[s.muted, { paddingTop: 10 }]}>
              No cases were raised in this window.
            </Text>
          ) : (
            stats.topThreats.map((t, i) => (
              <TRow key={t.label} index={i}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[s.tdStrong, { width: "26%", paddingRight: 5 }]}>
                    {titleCase(t.label)}
                  </Text>
                  <Text
                    style={[
                      s.tdStrong,
                      { width: "9%", textAlign: "right", paddingRight: 5 },
                    ]}
                  >
                    {t.count}
                  </Text>
                  <Text
                    style={[
                      s.td,
                      { width: "9%", textAlign: "right", paddingRight: 5 },
                    ]}
                  >
                    {share(t.count, rows.length)}
                  </Text>
                  <Text style={[s.td, { width: "30%", paddingRight: 5 }]}>
                    {OWASP[t.label] ?? "—"}
                  </Text>
                  <Text style={[s.td, { width: "26%", color: C.muted }]}>
                    {ATLAS[t.label] ?? "—"}
                  </Text>
                </View>
              </TRow>
            ))
          )}

          {stats.topThreats.length > 0 && (
            <>
              <SubHead>Relative volume</SubHead>
              {stats.topThreats.slice(0, 8).map((t) => (
                <Bar
                  key={t.label}
                  label={titleCase(t.label)}
                  value={t.count}
                  max={stats.topThreats[0]?.count ?? 1}
                  colour={C.brand}
                  note={share(t.count, rows.length)}
                />
              ))}
            </>
          )}
        </Section>
        <Section
          index={n("controls")}
          title="Which controls carried the load"
          subtitle="Policies ranked by the number of requests on which they were the deciding control. A control at the top of this table is doing the work; a configured control absent from it has never been exercised."
        >
          <THead
            repeat={false}
            cols={[
              { label: "Policy", width: "48%" },
              { label: "Decisions", width: "13%", align: "right" },
              { label: "Share", width: "11%", align: "right" },
              { label: "Relative", width: "28%" },
            ]}
          />
          {stats.topControls.length === 0 ? (
            <Text style={[s.muted, { paddingTop: 10 }]}>
              No policy recorded a decision in this window.
            </Text>
          ) : (
            stats.topControls.map((c, i) => {
              const max = stats.topControls[0]?.count ?? 1;
              const total = stats.topControls.reduce((a, b) => a + b.count, 0);
              return (
                <TRow key={c.label} index={i}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={[s.tdStrong, { width: "48%", paddingRight: 6 }]}
                    >
                      {c.label}
                    </Text>
                    <Text
                      style={[
                        s.tdStrong,
                        { width: "13%", textAlign: "right", paddingRight: 6 },
                      ]}
                    >
                      {c.count.toLocaleString()}
                    </Text>
                    <Text
                      style={[
                        s.td,
                        { width: "11%", textAlign: "right", paddingRight: 8 },
                      ]}
                    >
                      {share(c.count, total)}
                    </Text>
                    <View
                      style={{
                        width: "28%",
                        height: 6,
                        backgroundColor: C.ruleSoft,
                        borderRadius: 1,
                      }}
                    >
                      <View
                        style={{
                          height: 6,
                          width: `${Math.max(1.5, (c.count / max) * 100)}%`,
                          backgroundColor: C.allow,
                          borderRadius: 1,
                        }}
                      />
                    </View>
                  </View>
                </TRow>
              );
            })
          )}

          {stats.topGuardrails.length > 0 && (
            <>
              <SubHead>Guardrails that fired</SubHead>
              <Text style={[s.body, { marginBottom: 9 }]}>
                Guardrails run ahead of policy and stop a request on pattern
                rather than on judgement. These are the ones that triggered in
                this window.
              </Text>
              <THead
                repeat={false}
                cols={[
                  { label: "Guardrail", width: "50%" },
                  { label: "Pass", width: "26%" },
                  { label: "Triggers", width: "24%", align: "right" },
                ]}
              />
              {stats.topGuardrails.map((g, i) => (
                <TRow key={g.label} index={i} pad={5}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={[s.tdStrong, { width: "50%", paddingRight: 6 }]}
                    >
                      {g.label}
                    </Text>
                    <Text style={[s.td, { width: "26%", color: C.muted }]}>
                      {g.direction === "INPUT"
                        ? "Inbound request"
                        : "Outbound reply"}
                    </Text>
                    <Text
                      style={[s.tdStrong, { width: "24%", textAlign: "right" }]}
                    >
                      {g.count.toLocaleString()}
                    </Text>
                  </View>
                </TRow>
              ))}
            </>
          )}
        </Section>
        <Section
          index={n("surface")}
          title="Where it happened"
          subtitle="The caseload attributed to the applications and agents that produced it. Concentration here is worth more attention than the raw totals: a single application carrying most of the register is either the most exposed surface in the estate or the most aggressively policed one."
        >
          <SubHead>By application</SubHead>
          <THead
            repeat={false}
            cols={[
              { label: "Application", width: "44%" },
              { label: "Cases", width: "12%", align: "right" },
              { label: "Share", width: "12%", align: "right" },
              { label: "Relative", width: "32%" },
            ]}
          />
          {byApp.map((a, i) => (
            <TRow key={a.label} index={i} pad={5}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[s.tdStrong, { width: "44%", paddingRight: 6 }]}>
                  {a.label}
                </Text>
                <Text
                  style={[
                    s.tdStrong,
                    { width: "12%", textAlign: "right", paddingRight: 6 },
                  ]}
                >
                  {a.count}
                </Text>
                <Text
                  style={[
                    s.td,
                    { width: "12%", textAlign: "right", paddingRight: 8 },
                  ]}
                >
                  {share(a.count, rows.length)}
                </Text>
                <View
                  style={{
                    width: "32%",
                    height: 6,
                    backgroundColor: C.ruleSoft,
                    borderRadius: 1,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      width: `${Math.max(1.5, (a.count / (byApp[0]?.count ?? 1)) * 100)}%`,
                      backgroundColor: C.brand,
                      borderRadius: 1,
                    }}
                  />
                </View>
              </View>
            </TRow>
          ))}

          <SubHead>By agent</SubHead>
          <THead
            repeat={false}
            cols={[
              { label: "Agent", width: "44%" },
              { label: "Cases", width: "12%", align: "right" },
              { label: "Share", width: "12%", align: "right" },
              { label: "Relative", width: "32%" },
            ]}
          />
          {byAgent.map((a, i) => (
            <TRow key={a.label} index={i} pad={5}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[s.tdStrong, { width: "44%", paddingRight: 6 }]}>
                  {a.label}
                </Text>
                <Text
                  style={[
                    s.tdStrong,
                    { width: "12%", textAlign: "right", paddingRight: 6 },
                  ]}
                >
                  {a.count}
                </Text>
                <Text
                  style={[
                    s.td,
                    { width: "12%", textAlign: "right", paddingRight: 8 },
                  ]}
                >
                  {share(a.count, rows.length)}
                </Text>
                <View
                  style={{
                    width: "32%",
                    height: 6,
                    backgroundColor: C.ruleSoft,
                    borderRadius: 1,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      width: `${Math.max(1.5, (a.count / (byAgent[0]?.count ?? 1)) * 100)}%`,
                      backgroundColor: C.low,
                      borderRadius: 1,
                    }}
                  />
                </View>
              </View>
            </TRow>
          ))}
        </Section>
        <Section
          index={n("activity")}
          title="Activity across the window"
          subtitle={`Cases opened per day over the ${windowDays} days covered. Days with no cases are shown as gaps rather than omitted, so the shape of the period is honest.`}
        >
          <Columns data={daily} colour={C.brand} />
        </Section>

        <Section
          index={n("coverage")}
          title="Detection coverage"
          subtitle="Which detection layers contributed, and what the pipeline finally decided. A layer with no contribution is either unnecessary for this traffic or misconfigured — the distinction matters, and this table is where it becomes visible."
        >
          <SubHead>Detections by layer</SubHead>
          {stats.layers.length === 0 ? (
            <Text style={s.muted}>
              No detections were recorded in this window.
            </Text>
          ) : (
            stats.layers.map((l) => (
              <Bar
                key={l.label}
                label={titleCase(l.label)}
                value={l.count}
                max={stats.layers[0]?.count ?? 1}
                colour={C.brandDeep}
                note={share(l.count, stats.detections)}
              />
            ))
          )}

          <SubHead>Final decisions on analysed requests</SubHead>
          {/* Kept together. Split across a page break this table left two rows
              stranded on an otherwise empty page. */}
          <View wrap={false}>
            <THead
              repeat={false}
              cols={[
                { label: "Decision", width: "40%" },
                { label: "Requests", width: "20%", align: "right" },
                { label: "Share", width: "16%", align: "right" },
                { label: "Meaning", width: "24%" },
              ]}
            />
            {stats.decisions.map((d, i) => (
              <TRow key={d.label} index={i} pad={5}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[s.tdStrong, { width: "40%" }]}>
                    {titleCase(d.label)}
                  </Text>
                  <Text
                    style={[
                      s.tdStrong,
                      { width: "20%", textAlign: "right", paddingRight: 6 },
                    ]}
                  >
                    {d.count.toLocaleString()}
                  </Text>
                  <Text
                    style={[
                      s.td,
                      { width: "16%", textAlign: "right", paddingRight: 8 },
                    ]}
                  >
                    {share(d.count, stats.events)}
                  </Text>
                  <Text
                    style={[
                      s.td,
                      { width: "24%", fontSize: 7.6, color: C.muted },
                    ]}
                  >
                    {d.label === "BLOCK"
                      ? "Stopped before the model"
                      : d.label === "REDACT"
                        ? "Reply edited on the way out"
                        : d.label === "REQUIRE_APPROVAL"
                          ? "Held for a human"
                          : d.label === "WARN"
                            ? "Delivered, flagged"
                            : "Delivered unchanged"}
                  </Text>
                </View>
              </TRow>
            ))}
          </View>
        </Section>
      </Page>

      {/* ================================================= closed register */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Closed case register", fit: true }}
      >
        {chrome("Closed cases")}

        <Section
          index={n("closed")}
          title="Closed case register"
          subtitle="Every case closed in this window, most recent first, with its disposition and closing record. This is the section an auditor reads."
        >
          {closed.length === 0 ? (
            <Text style={s.muted}>No cases were closed in this window.</Text>
          ) : (
            <>
              <THead
                cols={[
                  { label: "Reference", width: "15%" },
                  { label: "Case", width: "40%" },
                  { label: "Sev", width: "9%" },
                  { label: "Closed", width: "18%" },
                  { label: "Open for", width: "17%", align: "right" },
                ]}
              />
              {closed.map((r, i) => (
                <TRow key={r.id} index={i} pad={7}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[s.tdMono, { width: "15%", paddingRight: 6 }]}>
                      {r.ref}
                    </Text>
                    <Text
                      style={[s.tdStrong, { width: "40%", paddingRight: 8 }]}
                    >
                      {excerpt(r.title, 52)}
                    </Text>
                    <Text
                      style={{
                        width: "9%",
                        fontSize: 7.4,
                        fontFamily: "Helvetica-Bold",
                        color: severityColour(r.severity).fg,
                      }}
                    >
                      {r.severity.slice(0, 4)}
                    </Text>
                    <Text style={[s.td, { width: "18%", fontSize: 7.8 }]}>
                      {r.resolvedAt ? formatWhen(r.resolvedAt) : "—"}
                    </Text>
                    <Text
                      style={[
                        s.td,
                        { width: "17%", textAlign: "right", fontSize: 7.8 },
                      ]}
                    >
                      {r.resolvedAt ? duration(r.openedAt, r.resolvedAt) : "—"}
                    </Text>
                  </View>
                  {r.resolution ? (
                    <Text
                      style={{
                        fontSize: 7.8,
                        color: C.muted,
                        lineHeight: 1.45,
                        paddingLeft: "15%",
                        paddingTop: 3,
                        paddingRight: 6,
                      }}
                    >
                      {excerpt(r.resolution, 190)}
                    </Text>
                  ) : null}
                </TRow>
              ))}
            </>
          )}
        </Section>
      </Page>

      {/* ==================================================== still open */}
      {open.length > 0 && (
        <Page
          size="A4"
          style={s.page}
          bookmark={{ title: "Cases still open", fit: true }}
        >
          {chrome("Open cases")}

          <Section
            index={n("open")}
            title="Cases still open"
            subtitle="Cases carried beyond this window, oldest first. Age is measured from the moment the case was raised to the moment this document was generated."
          >
            <THead
              cols={[
                { label: "Reference", width: "15%" },
                { label: "Case", width: "35%" },
                { label: "Application", width: "20%" },
                { label: "Stopped at", width: "17%" },
                { label: "Age", width: "13%", align: "right" },
              ]}
            />
            {open
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.openedAt).getTime() -
                  new Date(b.openedAt).getTime(),
              )
              .map((r, i) => (
                <TRow key={r.id} index={i} pad={6}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[s.tdMono, { width: "15%", paddingRight: 6 }]}>
                      {r.ref}
                    </Text>
                    <Text
                      style={[s.tdStrong, { width: "35%", paddingRight: 8 }]}
                    >
                      {excerpt(r.title, 46)}
                    </Text>
                    <Text
                      style={[
                        s.td,
                        { width: "20%", fontSize: 7.8, paddingRight: 6 },
                      ]}
                    >
                      {r.application ?? "—"}
                    </Text>
                    <Text
                      style={[
                        s.td,
                        {
                          width: "17%",
                          fontSize: 7.6,
                          color: C.muted,
                          paddingRight: 6,
                        },
                      ]}
                    >
                      {r.stoppedAt ?? "—"}
                    </Text>
                    <Text
                      style={{
                        width: "13%",
                        textAlign: "right",
                        fontSize: 7.8,
                        fontFamily: "Helvetica-Bold",
                        color: C.critical,
                      }}
                    >
                      {duration(r.openedAt, generatedAt)}
                    </Text>
                  </View>
                </TRow>
              ))}
          </Section>
        </Page>
      )}

      {/* =============================================== complete register */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Complete incident register", fit: true }}
      >
        {chrome("Full register")}

        <Section
          index={n("register")}
          title="Complete incident register"
          subtitle={`All ${rows.length} cases raised in this window, ordered by the date they were opened. Nothing is sampled or abridged — this table is the authoritative list, and each row can be reconciled against the case's own report by its reference.`}
        >
          <THead cols={registerCols} />
          {rows
            .slice()
            .sort(
              (a, b) =>
                new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
            )
            .map((r, i) => {
              const st = statusColour(r.status);
              return (
                <TRow key={r.id} index={i} pad={5}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        width: "14%",
                        fontSize: 7.2,
                        fontFamily: "Courier",
                        color: C.muted,
                        paddingRight: 6,
                      }}
                    >
                      {r.ref}
                    </Text>
                    <Text
                      style={{
                        width: "28%",
                        fontSize: 7.8,
                        fontFamily: "Helvetica-Bold",
                        color: C.ink,
                        paddingRight: 6,
                      }}
                    >
                      {excerpt(r.title, 44)}
                    </Text>
                    <Text
                      style={{
                        width: "14%",
                        fontSize: 7.2,
                        color: C.inkSoft,
                        paddingRight: 5,
                      }}
                    >
                      {titleCase(r.threatType)}
                    </Text>
                    <Text
                      style={{
                        width: "14%",
                        fontSize: 7.2,
                        color: C.inkSoft,
                        paddingRight: 5,
                      }}
                    >
                      {excerpt(r.application ?? "—", 22)}
                    </Text>
                    <Text
                      style={{
                        width: "8%",
                        fontSize: 7,
                        fontFamily: "Helvetica-Bold",
                        color: severityColour(r.severity).fg,
                      }}
                    >
                      {r.severity.slice(0, 4)}
                    </Text>
                    <Text
                      style={{
                        width: "10%",
                        fontSize: 7,
                        fontFamily: "Helvetica-Bold",
                        color: st.fg,
                      }}
                    >
                      {r.status.slice(0, 5)}
                    </Text>
                    <Text
                      style={{
                        width: "12%",
                        fontSize: 7,
                        color: C.muted,
                        textAlign: "right",
                      }}
                    >
                      {formatDay(r.openedAt)}
                    </Text>
                  </View>
                </TRow>
              );
            })}
        </Section>
      </Page>

      {/* =========================================================== method */}
      <Page
        size="A4"
        style={s.page}
        bookmark={{ title: "Reference", fit: true }}
      >
        {chrome("Reference")}

        <Section index={n("method")} title="Method and provenance">
          <Text style={s.lead}>
            Every figure in this document is read from recorded security events.
            Nothing is estimated, sampled or restated from a previous report.
          </Text>
          <Text style={[s.body, { marginBottom: 12 }]}>
            The detections, risk contributions and pipeline traces reproduced
            here are the engine&rsquo;s own output. Each case listed in the
            registers has a full report of its own containing the payload
            exactly as submitted, the stage-by-stage trace, and the control that
            made the final decision.
          </Text>

          <SubHead>How each figure was derived</SubHead>
          <THead
            repeat={false}
            cols={[
              { label: "Figure", width: "30%" },
              { label: "Derivation", width: "70%" },
            ]}
          />
          {[
            [
              "Requests analysed",
              "Count of security events recorded in the window, one per request evaluated by the pipeline.",
            ],
            [
              "Requests blocked",
              "Events whose final decision was BLOCK — stopped before reaching the model.",
            ],
            [
              "Responses redacted",
              "Events where the outbound reply was edited before delivery.",
            ],
            [
              "Held for approval",
              "Tool calls currently in the PENDING state, awaiting a human decision.",
            ],
            [
              "Documents quarantined",
              "Documents currently flagged as quarantined and excluded from retrieval.",
            ],
            [
              "Cases raised",
              "Incidents whose opening timestamp falls inside the window.",
            ],
            [
              "Mean time to close",
              "Mean of (resolved − opened) across cases with a recorded closing timestamp.",
            ],
            [
              "Detections by layer",
              "Detection rows grouped by the layer that produced them; one request can produce several.",
            ],
            [
              "Policy decisions",
              "Per-policy counter incremented when that policy was the deciding control on a request.",
            ],
            [
              "Case age",
              "Time from the opening timestamp to the generation time of this document.",
            ],
          ].map(([f, d], i) => (
            <TRow key={f} index={i} pad={5}>
              <View style={{ flexDirection: "row" }}>
                <Text style={[s.tdStrong, { width: "30%", paddingRight: 8 }]}>
                  {f}
                </Text>
                <Text
                  style={[
                    s.td,
                    { width: "70%", fontSize: 8, lineHeight: 1.45 },
                  ]}
                >
                  {d}
                </Text>
              </View>
            </TRow>
          ))}

          <SubHead>Scope and limits</SubHead>
          <Text style={s.body}>
            Counts of requests and counts of cases are not interchangeable: one
            case can span several requests, and most acted-on requests never
            become a case. Percentages against the request total are therefore
            not comparable with percentages against the case total, and each
            table states which denominator it uses. Controls counted as
            configured include those currently disabled; controls counted as
            fired do not.
          </Text>

          <View style={[s.card, { marginTop: 14 }]}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Field
                label="Window"
                value={`${formatDay(windowStart)} to ${formatDay(generatedAt)}`}
                width="50%"
              />
              <Field label="Organisation" value={org} width="50%" />
              <Field label="Prepared for" value={preparedFor} width="50%" />
              <Field label="Generated" value={when} width="50%" />
              <Field
                label="Cases in scope"
                value={`${rows.length}`}
                width="50%"
              />
              <Field
                label="Requests in scope"
                value={stats.events.toLocaleString()}
                width="50%"
              />
            </View>
          </View>
        </Section>

        {/* ====================================================== glossary */}
        {glossaryTerms.length > 0 && (
          <Section
            index={n("glossary")}
            title="Threat glossary"
            subtitle="Every threat type named in this document, defined in the terms a reader outside the security team will accept. Only types present in this window are listed."
          >
            {glossaryTerms.map((t, i) => (
              <View
                key={t.label}
                style={{
                  paddingVertical: 9,
                  borderBottomWidth: i === glossaryTerms.length - 1 ? 0 : 0.75,
                  borderBottomColor: C.ruleSoft,
                }}
                wrap={false}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: "Helvetica-Bold",
                      color: C.ink,
                    }}
                  >
                    {titleCase(t.label)}
                  </Text>
                  <Chip
                    label={`${t.count} case${t.count === 1 ? "" : "s"}`}
                    fg={C.brand}
                    bg={C.brandWash}
                  />
                </View>
                <Text
                  style={{ fontSize: 8.8, lineHeight: 1.55, color: C.inkSoft }}
                >
                  {GLOSSARY[t.label]}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* =================================================== frameworks */}
        <Section
          index={n("frameworks")}
          title="Control framework mapping"
          subtitle="Each threat type observed in this window, against the two frameworks an external assessor is most likely to ask for. The mapping is fixed in the product rather than assigned per case, so two reports covering the same threat always cite the same reference."
        >
          <THead
            repeat={false}
            cols={[
              { label: "Threat type", width: "28%" },
              { label: "Cases", width: "9%", align: "right" },
              { label: "OWASP Top 10 for LLM Applications", width: "35%" },
              { label: "MITRE ATLAS technique", width: "28%" },
            ]}
          />
          {stats.topThreats.map((t, i) => (
            <TRow key={t.label} index={i} pad={6}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[s.tdStrong, { width: "28%", paddingRight: 5 }]}>
                  {titleCase(t.label)}
                </Text>
                <Text
                  style={[
                    s.tdStrong,
                    { width: "9%", textAlign: "right", paddingRight: 6 },
                  ]}
                >
                  {t.count}
                </Text>
                <Text
                  style={[s.td, { width: "35%", fontSize: 8, paddingRight: 5 }]}
                >
                  {OWASP[t.label] ?? "Not mapped"}
                </Text>
                <Text
                  style={[s.td, { width: "28%", fontSize: 8, color: C.muted }]}
                >
                  {ATLAS[t.label] ?? "Not mapped"}
                </Text>
              </View>
            </TRow>
          ))}

          <Text style={[s.muted, { marginTop: 14 }]}>
            References are to the OWASP Top 10 for Large Language Model
            Applications and to MITRE ATLAS. A threat type shown as not mapped
            has no accepted entry in that framework; it is recorded here rather
            than silently dropped so the absence is visible.
          </Text>

          <View
            style={{
              marginTop: 26,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: C.rule,
            }}
          >
            <Text style={{ fontSize: 8.4, color: C.muted, lineHeight: 1.55 }}>
              This document was generated by the DefenSight security console for{" "}
              {org} and is classified confidential. It contains details of
              attempted attacks against production AI systems and the controls
              that stopped them. Distribution should be limited to those
              responsible for the security of the estate described within.
            </Text>
            <Text style={{ fontSize: 8.4, color: C.muted, marginTop: 8 }}>
              End of report — {rows.length} cases, {formatDay(windowStart)} to{" "}
              {formatDay(generatedAt)}.
            </Text>
          </View>
        </Section>
      </Page>
    </Document>
  );
}
