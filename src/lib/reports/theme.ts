import { Font, StyleSheet } from "@react-pdf/renderer";

/* No mid-word breaks, anywhere.
 *
 * @react-pdf hyphenates by default, which is right for prose set in a narrow
 * measure and wrong for everything in this document. A column header reading
 * "RESPONSES REDACT-ED" and a stat tile whose label breaks across two lines
 * while its neighbours do not are both worse than a label that simply wraps at
 * a space. Returning the word whole disables the hyphenator globally. */
Font.registerHyphenationCallback((word) => [word]);

/**
 * The report's design system.
 *
 * A deliberate departure from the console's obsidian: these documents get
 * printed, filed and attached to compliance evidence, and a full-bleed black
 * interior is a page nobody can annotate and every printer renders as a smear.
 *
 * So the cover carries the brand at full strength — obsidian, the mark, the
 * bluebird rule — and the interior is set on paper.
 *
 * "Set on paper" is not the same as *pale*, which is what the first cut was:
 * 9.5pt slate-grey body on white, hairline rules barely darker than the page,
 * and headings that differed from body copy by a couple of points. Printed, it
 * disappeared. The interior now takes real ink — body copy at near-black,
 * table headers reversed out of ink, rules dark enough to survive a
 * photocopier — and the quiet comes from *space* rather than from washed-out
 * grey. Colour still appears only where it carries meaning: severity,
 * decision, and the one stage that stopped an attack.
 */

export const C = {
  /* Cover and reversed panels */
  obsidian: "#08080c",
  obsidianSoft: "#12131a",
  ink900: "#101420",

  /* Interior */
  paper: "#ffffff",
  paperAlt: "#f4f6f9",
  zebra: "#f7f9fb",
  ink: "#0b0d12",
  inkSoft: "#252a34",
  muted: "#4d5563",
  faint: "#7c8595",
  rule: "#c9cfda",
  ruleSoft: "#e2e6ed",

  /* Brand */
  brand: "#1257c8",
  brandBright: "#1c7ff0",
  brandDeep: "#0d3f96",
  brandWash: "#e8f1fe",

  /* Severity — darkened from the screen tokens so they hold on white and
     survive a greyscale print as distinct values. */
  critical: "#b0142f",
  criticalWash: "#fbe9ed",
  high: "#a4530c",
  highWash: "#fbf0e3",
  medium: "#856400",
  mediumWash: "#fbf5e0",
  low: "#1f6bbf",
  lowWash: "#e9f2fc",
  allow: "#0a6a5b",
  allowWash: "#e3f4f0",
  neutralWash: "#eef1f5",
} as const;

export const severityColour = (s: string): { fg: string; bg: string } => {
  switch (s.toUpperCase()) {
    case "CRITICAL": return { fg: C.critical, bg: C.criticalWash };
    case "HIGH": return { fg: C.high, bg: C.highWash };
    case "MEDIUM": return { fg: C.medium, bg: C.mediumWash };
    case "LOW": return { fg: C.low, bg: C.lowWash };
    default: return { fg: C.muted, bg: C.neutralWash };
  }
};

export const decisionColour = (d: string): { fg: string; bg: string } => {
  switch (d.toUpperCase()) {
    case "BLOCK": return { fg: C.critical, bg: C.criticalWash };
    case "REDACT": return { fg: "#78338f", bg: "#f5e9f9" };
    case "REQUIRE_APPROVAL": return { fg: C.low, bg: C.lowWash };
    case "WARN": return { fg: C.medium, bg: C.mediumWash };
    default: return { fg: C.allow, bg: C.allowWash };
  }
};

export const statusColour = (st: string): { fg: string; bg: string } => {
  switch (st.toUpperCase()) {
    case "RESOLVED": return { fg: C.allow, bg: C.allowWash };
    case "CONTAINED": return { fg: C.low, bg: C.lowWash };
    case "INVESTIGATING": return { fg: C.medium, bg: C.mediumWash };
    case "OPEN": return { fg: C.critical, bg: C.criticalWash };
    default: return { fg: C.muted, bg: C.neutralWash };
  }
};

/* Page geometry, named so the header, footer and body all derive their margins
   from one number instead of three that drift apart. */
export const M = { x: 48, top: 78, bottom: 60 } as const;

/* Helvetica is the built-in family. Registering a webfont would mean fetching
   it at render time, and a report that fails because a font server is slow is
   not a report. Hierarchy here comes from size, weight and space instead. */
export const s = StyleSheet.create({
  /* ------------------------------------------------------------- pages */
  cover: {
    backgroundColor: C.obsidian,
    color: "#ffffff",
    paddingTop: 58,
    paddingBottom: 46,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
  },
  page: {
    backgroundColor: C.paper,
    color: C.ink,
    paddingTop: M.top,
    paddingBottom: M.bottom,
    paddingHorizontal: M.x,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    lineHeight: 1.55,
  },

  /* ------------------------------------------------------------ cover */
  coverMark: { width: 42, height: 49, marginBottom: 20 },
  coverEyebrow: {
    fontSize: 8,
    letterSpacing: 2.6,
    color: "#7f8ca3",
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 29,
    lineHeight: 1.14,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginBottom: 12,
  },
  coverLead: {
    fontSize: 10.5,
    lineHeight: 1.62,
    color: "#b3bccb",
    maxWidth: 400,
  },
  coverRule: {
    height: 3,
    width: 60,
    backgroundColor: C.brandBright,
    marginTop: 24,
    marginBottom: 24,
  },
  coverMetaRow: { flexDirection: "row", flexWrap: "wrap" },
  coverMetaCell: { width: "50%", marginBottom: 15 },
  coverMetaLabel: {
    fontSize: 6.8,
    letterSpacing: 1.7,
    color: "#7f8ca3",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  coverMetaValue: { fontSize: 11.5, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  coverFooter: {
    position: "absolute",
    bottom: 40,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#2b2e3a",
    paddingTop: 11,
  },
  coverFooterText: { fontSize: 7.2, color: "#8b95a8", letterSpacing: 0.7 },

  /* --------------------------------------------------------- structure */
  sectionNum: {
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  h1: {
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 10,
  },
  h2: {
    fontSize: 14.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    letterSpacing: -0.2,
  },
  h2Rule: { height: 2, width: 34, backgroundColor: C.brand, marginBottom: 12 },
  h3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 6,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontSize: 7,
    letterSpacing: 1.6,
    color: C.muted,
    fontFamily: "Helvetica-Bold",
  },
  section: { marginBottom: 16 },

  /* Body copy carries real ink. Grey is reserved for genuinely secondary
     material, and even that is darker than the usual web token. */
  lead: { fontSize: 11, lineHeight: 1.62, color: C.inkSoft, marginBottom: 10 },
  body: { fontSize: 9.8, lineHeight: 1.62, color: C.inkSoft },
  muted: { fontSize: 8.6, color: C.muted, lineHeight: 1.5 },
  mono: { fontFamily: "Courier", fontSize: 8.5, color: C.ink },

  /* -------------------------------------------------------------- bits */
  chip: {
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.7,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 12,
    backgroundColor: C.paperAlt,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: C.critical,
    backgroundColor: C.criticalWash,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 3,
  },

  /* ------------------------------------------------------------ tables */
  /* Header cells reverse out of ink. On a photocopy this is the difference
     between a table and a list of loose words. */
  th: {
    fontSize: 6.9,
    letterSpacing: 1.1,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
  },
  thDark: {
    fontSize: 6.9,
    letterSpacing: 1.1,
    color: C.muted,
    fontFamily: "Helvetica-Bold",
  },
  td: { fontSize: 8.6, color: C.inkSoft },
  tdStrong: { fontSize: 8.6, color: C.ink, fontFamily: "Helvetica-Bold" },
  tdMono: { fontSize: 7.8, fontFamily: "Courier", color: C.muted },
  trBorder: { borderBottomWidth: 1, borderBottomColor: C.ruleSoft },

  /* ------------------------------------------------------------ header */
  runHead: {
    position: "absolute",
    top: 34,
    left: M.x,
    right: M.x,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingBottom: 8,
  },
  runHeadText: { fontSize: 7, color: C.muted, letterSpacing: 1.4, fontFamily: "Helvetica-Bold" },

  /* ------------------------------------------------------------ footer */
  footer: {
    position: "absolute",
    bottom: 28,
    left: M.x,
    right: M.x,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 8,
  },
  footerText: { fontSize: 6.8, color: C.faint, letterSpacing: 0.5 },
  footerPage: { fontSize: 7.4, color: C.inkSoft, fontFamily: "Helvetica-Bold" },
});

/** Long text, trimmed for a page without cutting mid-word. */
export function excerpt(text: string, max = 520): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > 0 ? cut.slice(0, space) : cut}…`;
}

export function formatWhen(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function formatDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function duration(from: Date | string, to: Date | string): string {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs} h ${mins % 60} min`;
  return `${Math.floor(hrs / 24)} d ${hrs % 24} h`;
}

/** Percentage of a whole, rendered for a table cell rather than a chart. */
export function share(value: number, total: number): string {
  if (total <= 0) return "—";
  const pct = (value / total) * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

/** THREAT_TYPE to "threat type", for prose and labels. */
export const label = (t: string) => t.toLowerCase().replace(/_/g, " ");

/** THREAT_TYPE to "Threat type", for table cells and headings. */
export function titleCase(t: string): string {
  const l = label(t);
  return l.charAt(0).toUpperCase() + l.slice(1);
}
