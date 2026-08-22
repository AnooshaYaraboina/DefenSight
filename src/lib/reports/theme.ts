import { StyleSheet } from "@react-pdf/renderer";

/**
 * The report's design system.
 *
 * A deliberate departure from the console's obsidian: these documents get
 * printed, filed and attached to compliance evidence, and a full-bleed black
 * interior is a page nobody can annotate and every printer renders as a smear.
 *
 * So the cover carries the brand at full strength — obsidian, the mark, the
 * bluebird rule — and the interior is set on paper, with the same accent used
 * sparingly for structure. That contrast is what makes the cover land: it only
 * reads as dramatic because the pages after it are quiet.
 */

export const C = {
  /* Cover */
  obsidian: "#08080c",
  obsidianSoft: "#12131a",
  /* Interior */
  paper: "#ffffff",
  paperAlt: "#f7f8fa",
  ink: "#0f1115",
  inkSoft: "#3d4450",
  muted: "#6b7280",
  faint: "#9aa1ad",
  rule: "#e3e6ec",
  ruleSoft: "#eef0f4",
  /* Brand */
  brand: "#1c7ff0",
  brandDeep: "#1259b8",
  brandWash: "#eef5fe",
  /* Severity — darkened from the screen tokens so they hold on white */
  critical: "#c81e3a",
  criticalWash: "#fdeef1",
  high: "#c2691a",
  highWash: "#fdf3e9",
  medium: "#a8830a",
  mediumWash: "#fdf8e7",
  low: "#2f7fd6",
  lowWash: "#eef5fd",
  allow: "#12806f",
  allowWash: "#e9f7f4",
} as const;

export const severityColour = (s: string): { fg: string; bg: string } => {
  switch (s.toUpperCase()) {
    case "CRITICAL": return { fg: C.critical, bg: C.criticalWash };
    case "HIGH": return { fg: C.high, bg: C.highWash };
    case "MEDIUM": return { fg: C.medium, bg: C.mediumWash };
    case "LOW": return { fg: C.low, bg: C.lowWash };
    default: return { fg: C.muted, bg: C.paperAlt };
  }
};

export const decisionColour = (d: string): { fg: string; bg: string } => {
  switch (d.toUpperCase()) {
    case "BLOCK": return { fg: C.critical, bg: C.criticalWash };
    case "REDACT": return { fg: "#8b3fa8", bg: "#f7edfb" };
    case "REQUIRE_APPROVAL": return { fg: C.low, bg: C.lowWash };
    case "WARN": return { fg: C.medium, bg: C.mediumWash };
    default: return { fg: C.allow, bg: C.allowWash };
  }
};

/* Helvetica is the built-in family. Registering a webfont would mean fetching
   it at render time, and a report that fails because a font server is slow is
   not a report. Hierarchy here comes from size, weight and space instead. */
export const s = StyleSheet.create({
  /* ------------------------------------------------------------- pages */
  cover: {
    backgroundColor: C.obsidian,
    color: "#ffffff",
    paddingTop: 64,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
  },
  page: {
    backgroundColor: C.paper,
    color: C.ink,
    paddingTop: 52,
    paddingBottom: 62,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    lineHeight: 1.55,
  },

  /* ------------------------------------------------------------ cover */
  coverMark: { width: 46, height: 54, marginBottom: 26 },
  coverEyebrow: {
    fontSize: 8,
    letterSpacing: 2.4,
    color: "#5f6b7f",
    fontFamily: "Helvetica-Bold",
    marginBottom: 18,
  },
  coverTitle: {
    fontSize: 30,
    lineHeight: 1.16,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginBottom: 14,
  },
  coverLead: {
    fontSize: 10.5,
    lineHeight: 1.65,
    color: "#98a2b3",
    maxWidth: 380,
  },
  coverRule: {
    height: 3,
    width: 64,
    backgroundColor: C.brand,
    marginTop: 30,
    marginBottom: 30,
  },
  coverMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 0 },
  coverMetaCell: { width: "50%", marginBottom: 18 },
  coverMetaLabel: {
    fontSize: 7,
    letterSpacing: 1.6,
    color: "#5f6b7f",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  coverMetaValue: { fontSize: 11, color: "#e7ebf2", fontFamily: "Helvetica-Bold" },
  coverFooter: {
    position: "absolute",
    bottom: 42,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#23252e",
    paddingTop: 12,
  },
  coverFooterText: { fontSize: 7.5, color: "#5f6b7f", letterSpacing: 0.6 },

  /* --------------------------------------------------------- structure */
  sectionNum: {
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  h2: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 4,
  },
  h2Rule: { height: 2, width: 34, backgroundColor: C.brand, marginBottom: 12 },
  h3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 6,
    marginTop: 4,
  },
  section: { marginBottom: 26 },
  lead: { fontSize: 10.5, lineHeight: 1.7, color: C.inkSoft, marginBottom: 10 },
  body: { fontSize: 9.5, lineHeight: 1.6, color: C.inkSoft },
  muted: { fontSize: 8.5, color: C.muted, lineHeight: 1.5 },
  mono: { fontFamily: "Courier", fontSize: 8.5, color: C.inkSoft },

  /* -------------------------------------------------------------- bits */
  chip: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.7,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 3,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 5,
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
  th: {
    fontSize: 7,
    letterSpacing: 1.1,
    color: C.muted,
    fontFamily: "Helvetica-Bold",
    paddingBottom: 6,
  },
  td: { fontSize: 9, color: C.inkSoft, paddingVertical: 6 },
  trBorder: { borderBottomWidth: 1, borderBottomColor: C.ruleSoft },

  /* ------------------------------------------------------------ footer */
  footer: {
    position: "absolute",
    bottom: 26,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: C.faint, letterSpacing: 0.5 },
});

/** Long text, trimmed for a page without cutting mid-word. */
export function excerpt(text: string, max = 520): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function formatWhen(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
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
