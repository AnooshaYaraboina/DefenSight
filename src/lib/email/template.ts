import "server-only";

/**
 * The delivery email.
 *
 * Written for mail clients, not browsers: tables for layout, inline styles
 * only, no web fonts, no background images. Outlook renders on Word's engine
 * and discards a stylesheet without comment, so anything that matters is on the
 * element itself.
 *
 * The logo is not attached or hotlinked. Most clients block remote images by
 * default and an attached one shows up as a second file next to the report,
 * which looks like a mistake — so the mark is drawn as a bordered monogram in
 * the brand blue. It survives image blocking, dark mode and plain-text
 * fallback, which a PNG does not.
 */

const BRAND = "#1c7ff0";
const INK = "#0f1115";
const MUTED = "#6b7280";
const RULE = "#e3e6ec";
const OBSIDIAN = "#08080c";

export interface ReportEmail {
  subject: string;
  html: string;
  text: string;
}

function shell(inner: string, preheader: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>DefenSight</title>
</head>
<body style="margin:0;padding:0;background:#eef0f4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,17,21,0.10);">

  <!-- masthead -->
  <tr><td style="background:${OBSIDIAN};padding:30px 34px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div style="width:34px;height:34px;border:2px solid ${BRAND};border-radius:9px;text-align:center;line-height:30px;font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;color:${BRAND};">D</div>
      </td>
      <td style="vertical-align:middle;padding-left:12px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;letter-spacing:-0.2px;">Defen<span style="color:${BRAND};">Sight</span></div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:2px;color:#5f6b7f;padding-top:2px;">SECURITY BEYOND THREATS</div>
      </td>
    </tr></table>
  </td></tr>

  ${inner}

  <!-- footer -->
  <tr><td style="padding:22px 34px 28px;border-top:1px solid ${RULE};">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${MUTED};">
      This report was generated from recorded security events and sent to you because you
      requested it from the DefenSight console. The attachment is confidential.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function stat(label: string, value: string, colour = INK): string {
  return `<td style="padding:0 6px;" width="33%">
    <div style="border:1px solid ${RULE};border-radius:8px;padding:12px 10px;text-align:center;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:bold;color:${colour};">${value}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:1px;color:${MUTED};padding-top:3px;">${label}</div>
    </div>
  </td>`;
}

const SEVERITY: Record<string, string> = {
  CRITICAL: "#c81e3a",
  HIGH: "#c2691a",
  MEDIUM: "#a8830a",
  LOW: "#2f7fd6",
};

export function incidentEmail(o: {
  recipientName: string;
  ref: string;
  title: string;
  severity: string;
  status: string;
  threat: string;
  riskScore: number;
  stoppedAt: string | null;
  org: string;
}): ReportEmail {
  const sev = SEVERITY[o.severity.toUpperCase()] ?? MUTED;

  const inner = `
  <tr><td style="padding:32px 34px 8px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:2px;color:${BRAND};font-weight:bold;">INCIDENT REPORT</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:bold;color:${INK};padding-top:10px;">${escape(o.title)}</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};padding-top:6px;">
      ${escape(o.ref)} &middot; ${escape(o.org)}
    </div>
  </td></tr>

  <tr><td style="padding:18px 28px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat("SEVERITY", escape(o.severity), sev)}
      ${stat("RISK SCORE", `${o.riskScore}`, INK)}
      ${stat("STATUS", escape(o.status.replace(/_/g, " ")), INK)}
    </tr></table>
  </td></tr>

  <tr><td style="padding:20px 34px 0;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:${INK};">
      Hello ${escape(o.recipientName)},
    </div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#3d4450;padding-top:12px;">
      The full report for <strong>${escape(o.ref)}</strong> is attached. It covers the attack as
      submitted, the stage-by-stage pipeline trace, the risk breakdown, every control that acted,
      and the response timeline${o.stoppedAt ? `, including the stage that stopped it &mdash; <strong style="color:${sev};">${escape(o.stoppedAt)}</strong>` : ""}.
    </div>
  </td></tr>

  <tr><td style="padding:20px 34px 4px;">
    <div style="border-left:3px solid ${BRAND};background:#f5f9ff;padding:14px 16px;border-radius:0 6px 6px 0;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:1.4px;color:${BRAND};font-weight:bold;">THREAT CLASSIFIED AS</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};padding-top:5px;font-weight:bold;">${escape(o.threat.replace(/_/g, " ").toLowerCase())}</div>
    </div>
  </td></tr>

  <tr><td style="padding:22px 34px 26px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
      Every figure in the attachment is read from the recorded event rather than restated &mdash;
      the detections, the risk contributions and the pipeline trace are the engine&rsquo;s own output.
    </div>
  </td></tr>`;

  const text = [
    `DEFENSIGHT — INCIDENT REPORT`,
    ``,
    `${o.ref}: ${o.title}`,
    `Severity: ${o.severity}   Risk: ${o.riskScore}/100   Status: ${o.status}`,
    `Threat: ${o.threat.replace(/_/g, " ").toLowerCase()}`,
    o.stoppedAt ? `Stopped at: ${o.stoppedAt}` : "",
    ``,
    `Hello ${o.recipientName},`,
    ``,
    `The full report is attached as a PDF. It covers the attack as submitted, the`,
    `pipeline trace, the risk breakdown, the controls that acted and the response`,
    `timeline.`,
    ``,
    `${o.org} · Confidential`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${o.ref} — ${o.title} (${o.severity})`,
    html: shell(inner, `${o.ref} · ${o.severity} · risk ${o.riskScore}/100`),
    text,
  };
}

export function estateEmail(o: {
  recipientName: string;
  org: string;
  total: number;
  resolved: number;
  critical: number;
  windowLabel: string;
}): ReportEmail {
  const inner = `
  <tr><td style="padding:32px 34px 8px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:2px;color:${BRAND};font-weight:bold;">SECURITY POSTURE REPORT</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:bold;color:${INK};padding-top:10px;">Incident review &mdash; ${escape(o.windowLabel)}</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};padding-top:6px;">${escape(o.org)}</div>
  </td></tr>

  <tr><td style="padding:18px 28px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat("INCIDENTS", String(o.total))}
      ${stat("RESOLVED", String(o.resolved), "#12806f")}
      ${stat("CRITICAL", String(o.critical), "#c81e3a")}
    </tr></table>
  </td></tr>

  <tr><td style="padding:20px 34px 26px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:${INK};">
      Hello ${escape(o.recipientName)},
    </div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#3d4450;padding-top:12px;">
      The consolidated report is attached. It covers every incident in this window with its
      final disposition, the threats that recurred, which controls carried the load, and the
      full closing record for each resolved case.
    </div>
  </td></tr>`;

  const text = [
    `DEFENSIGHT — SECURITY POSTURE REPORT`,
    ``,
    `Incident review — ${o.windowLabel}`,
    `${o.org}`,
    ``,
    `Incidents: ${o.total}   Resolved: ${o.resolved}   Critical: ${o.critical}`,
    ``,
    `Hello ${o.recipientName},`,
    ``,
    `The consolidated report is attached as a PDF.`,
  ].join("\n");

  return {
    subject: `DefenSight — incident review, ${o.windowLabel}`,
    html: shell(inner, `${o.total} incidents · ${o.resolved} resolved`),
    text,
  };
}

/** Values come from recorded events, which include attacker-supplied text. */
function escape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
