import * as React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { C, s, severityColour } from "./theme";

/**
 * Shared furniture for both reports.
 *
 * Kept apart from the documents themselves so the two never drift — a periodic
 * summary that styles a severity chip differently from the single-incident
 * report undermines both.
 *
 * Everything here is built from filled rectangles and text. @react-pdf has no
 * gradients, no shadows and no SVG filters, so "polished" has to come from
 * alignment, weight and restraint rather than from effects.
 */

/* Read from the repo rather than fetched. A report that depends on a network
   round trip to draw its own logo is a report that fails offline.
 *
 * Passed as bytes, not as a path. Handing @react-pdf a filesystem path fails
 * silently — the document still renders, just without the mark, and a 15KB PDF
 * that should be 290KB is the only clue. Reading it here turns a silent
 * omission into a loud one. */
const MARK_PATH = path.join(
  process.cwd(),
  "public",
  "brand",
  "defensight-mark-v2.png",
);

let markCache: Buffer | null = null;

function markData(): Buffer {
  markCache ??= fs.readFileSync(MARK_PATH);
  return markCache;
}

/* ------------------------------------------------------------------ chips */

export function Chip({
  label,
  fg,
  bg,
  border,
}: {
  label: string;
  fg: string;
  bg: string;
  border?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 2,
        paddingVertical: 2.5,
        paddingHorizontal: 6,
        borderWidth: border ? 0.75 : 0,
        borderColor: fg,
      }}
    >
      <Text style={[s.chip, { color: fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function SeverityChip({ severity }: { severity: string }) {
  const { fg, bg } = severityColour(severity);
  return <Chip label={severity} fg={fg} bg={bg} />;
}

/* -------------------------------------------------------------- structure */

/**
 * A numbered section.
 *
 * The number sits in a filled badge rather than floating above the title as
 * pale blue type. It is the anchor a reader scanning for "section 7" actually
 * finds, and it survives greyscale.
 */
export function Section({
  index,
  title,
  subtitle,
  children,
  wrap = true,
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <View style={s.section} wrap={wrap}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          marginBottom: 6,
        }}
        wrap={false}
      >
        <View
          style={{
            backgroundColor: C.ink900,
            borderRadius: 2,
            paddingVertical: 3,
            paddingHorizontal: 5.5,
          }}
        >
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: "#ffffff",
              letterSpacing: 0.8,
            }}
          >
            {index}
          </Text>
        </View>
        <Text style={s.h2}>{title}</Text>
      </View>
      <View
        style={{ height: 1.6, backgroundColor: C.ink900, marginBottom: 9 }}
      />
      {subtitle ? (
        <Text style={[s.body, { marginBottom: 9 }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** A rule with a label, for dividing a section without opening a new one. */
export function SubHead({ children }: { children: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 11,
        marginBottom: 7,
      }}
      wrap={false}
    >
      <Text
        style={{
          fontSize: 8.5,
          fontFamily: "Helvetica-Bold",
          color: C.ink,
          letterSpacing: 0.9,
        }}
      >
        {children.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 0.75, backgroundColor: C.rule }} />
    </View>
  );
}

/** A labelled value, used across the metadata grids. */
export function Field({
  label,
  value,
  width = "33%",
  colour,
}: {
  label: string;
  value: string;
  width?: string;
  colour?: string;
}) {
  return (
    <View style={{ width, marginBottom: 11, paddingRight: 12 }}>
      <Text style={[s.thDark, { marginBottom: 3 }]}>{label.toUpperCase()}</Text>
      <Text
        style={{
          fontSize: 9.5,
          color: colour ?? C.ink,
          fontFamily: "Helvetica-Bold",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * A headline number.
 *
 * The accent bar above it is what separates one tile from the next — a border
 * on all four sides turns a row of figures into a spreadsheet, and the point
 * of these is that they are read at a glance rather than compared column-wise.
 */
export function StatTile({
  label,
  value,
  note,
  accent = C.brand,
  width = "25%",
}: {
  label: string;
  value: string | number;
  note?: string;
  accent?: string;
  width?: string;
}) {
  return (
    <View style={{ width, paddingRight: 10, marginBottom: 4 }}>
      <View
        style={{
          borderTopWidth: 2.5,
          borderTopColor: accent,
          borderLeftWidth: 0.75,
          borderLeftColor: C.ruleSoft,
          borderRightWidth: 0.75,
          borderRightColor: C.ruleSoft,
          borderBottomWidth: 0.75,
          borderBottomColor: C.ruleSoft,
          backgroundColor: C.paper,
          paddingTop: 8,
          paddingBottom: 8,
          paddingHorizontal: 9,
          /* Fixed, not minimum. A label that wraps to two lines used to make
             its tile taller than the three beside it, and a row of stat tiles
             with uneven baselines reads as a layout fault rather than as data. */
          height: 74,
        }}
      >
        {/* Two lines of room whether or not the label needs it, so the numbers
            below sit on one baseline across the row. */}
        <View style={{ height: 17 }}>
          <Text
            style={{
              fontSize: 6.6,
              letterSpacing: 1.1,
              lineHeight: 1.3,
              color: C.muted,
              fontFamily: "Helvetica-Bold",
            }}
          >
            {label.toUpperCase()}
          </Text>
        </View>
        {/* An explicit line height — the default leaves the descender space of
            a 19pt figure overlapping whatever follows it. */}
        <Text
          style={{
            fontSize: 19,
            lineHeight: 1.16,
            fontFamily: "Helvetica-Bold",
            color: C.ink,
            marginTop: 4,
          }}
        >
          {value}
        </Text>
        {note ? (
          <Text
            style={{
              fontSize: 6.8,
              color: C.muted,
              marginTop: 3,
              lineHeight: 1.25,
            }}
          >
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A tinted panel carrying a judgement rather than data.
 *
 * Used sparingly — a document where every paragraph is in a box has no
 * emphasis left to give.
 */
export function Callout({
  title,
  children,
  accent = C.brand,
  bg = C.brandWash,
}: {
  title: string;
  children: React.ReactNode;
  accent?: string;
  bg?: string;
}) {
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: accent,
        backgroundColor: bg,
        paddingVertical: 11,
        paddingHorizontal: 13,
        marginTop: 4,
      }}
      wrap={false}
    >
      <Text
        style={{
          fontSize: 7.4,
          letterSpacing: 1.3,
          fontFamily: "Helvetica-Bold",
          color: accent,
          marginBottom: 5,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {typeof children === "string" ? (
        <Text style={{ fontSize: 9.4, lineHeight: 1.6, color: C.ink }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

/* ----------------------------------------------------------------- tables */

export interface Col {
  label: string;
  width: string;
  align?: "left" | "right";
}

/**
 * A table header that reverses out of ink and repeats on every page the table
 * spills onto.
 *
 * The repeat matters more than it looks: the incident register runs to several
 * pages, and a column of bare references with no heading above them is the
 * commonest way a long PDF table becomes unreadable.
 */
export function THead({
  cols,
  repeat = true,
}: {
  cols: Col[];
  repeat?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.ink900,
        paddingVertical: 6,
        paddingHorizontal: 7,
        borderRadius: 2,
      }}
      fixed={repeat}
    >
      {cols.map((c) => (
        <Text
          key={c.label}
          style={[
            s.th,
            { width: c.width, textAlign: c.align ?? "left", paddingRight: 5 },
          ]}
        >
          {c.label.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

/** One table row. Zebra striping is the cheapest way to hold a wide row together. */
export function TRow({
  children,
  index,
  pad = 6,
}: {
  children: React.ReactNode;
  index: number;
  pad?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: index % 2 === 1 ? C.zebra : C.paper,
        borderBottomWidth: 0.75,
        borderBottomColor: C.ruleSoft,
        paddingVertical: pad,
        paddingHorizontal: 7,
      }}
      wrap={false}
    >
      {children}
    </View>
  );
}

/* ----------------------------------------------------------------- charts */

/**
 * A horizontal bar. Used for risk factors and for the aggregate charts in the
 * estate report — the same mark in both, so a reader learns to read it once.
 */
export function Bar({
  label,
  value,
  max,
  suffix = "",
  colour = C.brand,
  note,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  colour?: string;
  note?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ marginBottom: 7 }} wrap={false}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3.5,
        }}
      >
        <Text
          style={{ fontSize: 8.8, color: C.ink, fontFamily: "Helvetica-Bold" }}
        >
          {label}
        </Text>
        <Text
          style={{ fontSize: 8.8, color: C.ink, fontFamily: "Helvetica-Bold" }}
        >
          {value.toLocaleString()}
          {suffix}
          {note ? (
            <Text
              style={{ color: C.muted, fontFamily: "Helvetica" }}
            >{`  ${note}`}</Text>
          ) : null}
        </Text>
      </View>
      <View style={{ height: 7, backgroundColor: C.ruleSoft, borderRadius: 1 }}>
        <View
          style={{
            height: 7,
            width: `${Math.max(pct * 100, value > 0 ? 1.2 : 0)}%`,
            backgroundColor: colour,
            borderRadius: 1,
          }}
        />
      </View>
    </View>
  );
}

/**
 * One bar divided into proportional segments — a whole broken down, where the
 * relative sizes matter more than the absolute figures.
 */
export function Composition({
  segments,
  total,
}: {
  segments: Array<{ label: string; value: number; colour: string }>;
  total: number;
}) {
  const shown = segments.filter((seg) => seg.value > 0);
  return (
    <View wrap={false}>
      <View
        style={{
          flexDirection: "row",
          height: 14,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {shown.length === 0 ? (
          <View style={{ flex: 1, backgroundColor: C.ruleSoft }} />
        ) : (
          shown.map((seg) => (
            <View
              key={seg.label}
              style={{
                width: `${total > 0 ? (seg.value / total) * 100 : 0}%`,
                backgroundColor: seg.colour,
              }}
            />
          ))
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 9 }}>
        {segments.map((seg) => (
          <View
            key={seg.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              width: "25%",
              marginBottom: 5,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                backgroundColor: seg.colour,
                borderRadius: 1,
              }}
            />
            <Text style={{ fontSize: 7.8, color: C.muted }}>{seg.label}</Text>
            <Text
              style={{
                fontSize: 7.8,
                color: C.ink,
                fontFamily: "Helvetica-Bold",
              }}
            >
              {seg.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Daily volume as columns.
 *
 * Drawn rather than charted — a real chart library would mean a canvas, and a
 * canvas in a PDF is a raster that prints badly. Rectangles stay vector.
 */
export function Columns({
  data,
  height = 74,
  colour = C.brand,
}: {
  data: Array<{ day: string; value: number }>;
  height?: number;
  colour?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View wrap={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          height,
          gap: 2,
          borderBottomWidth: 1,
          borderBottomColor: C.rule,
          paddingBottom: 0,
        }}
      >
        {data.map((d, i) => (
          <View
            key={`${d.day}-${i}`}
            style={{
              flex: 1,
              height: Math.max(
                d.value > 0 ? 2 : 0.75,
                (d.value / max) * height,
              ),
              backgroundColor: d.value > 0 ? colour : C.ruleSoft,
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 5,
        }}
      >
        <Text style={{ fontSize: 7, color: C.muted }}>
          {data[0]?.day ?? ""}
        </Text>
        <Text style={{ fontSize: 7, color: C.muted }}>
          {`peak ${max} on a single day`}
        </Text>
        <Text style={{ fontSize: 7, color: C.muted }}>
          {data.at(-1)?.day ?? ""}
        </Text>
      </View>
    </View>
  );
}

/**
 * The pipeline as a vertical trace.
 *
 * The stage that stopped the attack is the single most important fact in the
 * document, so it is the only one that carries colour — everything else is
 * deliberately quiet so the eye lands there without being directed.
 */
export function StageTrace({
  stages,
}: {
  stages: Array<{
    label?: string;
    stage?: string;
    summary?: string;
    interventionPoint?: boolean;
  }>;
}) {
  return (
    <View>
      {stages.map((st, i) => {
        const stop = Boolean(st.interventionPoint);
        return (
          <View
            key={`${st.stage}-${i}`}
            style={{
              flexDirection: "row",
              gap: 10,
              paddingVertical: 6,
              paddingHorizontal: stop ? 9 : 0,
              backgroundColor: stop ? C.criticalWash : undefined,
              borderRadius: stop ? 3 : 0,
              borderLeftWidth: stop ? 3 : 0,
              borderLeftColor: C.critical,
              marginBottom: 2,
            }}
            wrap={false}
          >
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Courier",
                color: stop ? C.critical : C.faint,
                width: 16,
                paddingTop: 1,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
              >
                <Text
                  style={{
                    fontSize: 9.5,
                    fontFamily: "Helvetica-Bold",
                    color: stop ? C.critical : C.ink,
                  }}
                >
                  {st.label ?? st.stage ?? "Stage"}
                </Text>
                {stop && (
                  <Text
                    style={{
                      fontSize: 7,
                      letterSpacing: 1,
                      fontFamily: "Helvetica-Bold",
                      color: C.critical,
                    }}
                  >
                    STOPPED HERE
                  </Text>
                )}
              </View>
              {st.summary ? (
                <Text
                  style={{
                    fontSize: 8.6,
                    color: C.muted,
                    lineHeight: 1.5,
                    marginTop: 1,
                  }}
                >
                  {st.summary}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------- page furniture */

/**
 * The running head.
 *
 * Fixed, so it repeats. A reader who has photocopied page 14 of a 22-page
 * review should still be able to tell what document it came from and which
 * part of it they are holding.
 */
export function RunningHeader({
  doc,
  section,
}: {
  doc: string;
  section: string;
}) {
  return (
    <View style={s.runHead} fixed>
      <Text style={[s.runHeadText, { color: C.ink }]}>DEFENSIGHT</Text>
      <Text style={s.runHeadText}>{section.toUpperCase()}</Text>
      <Text style={s.runHeadText}>{doc.toUpperCase()}</Text>
    </View>
  );
}

export function PageFooter({
  ref_,
  generatedAt,
}: {
  ref_: string;
  generatedAt: string;
}) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>DEFENSIGHT · {ref_} · CONFIDENTIAL</Text>
      <Text style={s.footerText}>{generatedAt}</Text>
      <Text
        style={s.footerPage}
        render={({ pageNumber, totalPages }) =>
          `PAGE ${pageNumber} OF ${totalPages}`
        }
      />
    </View>
  );
}

export function CoverMark() {
  /* @react-pdf's Image is not an <img> — it draws into a PDF and has no alt
     attribute to give. The rule cannot tell the two apart. */
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image src={{ data: markData(), format: "png" }} style={s.coverMark} />
  );
}

/**
 * A contents line.
 *
 * No page-number column. @react-pdf paginates in a single pass, so a table of
 * contents cannot know where a section landed without rendering the document
 * twice and threading the result back in — and a printed number that is wrong
 * is worse than no number at all, because a reader trusts it. Navigation is
 * provided by real PDF bookmarks instead, which every viewer shows in its
 * sidebar and which are correct by construction.
 */
export function ContentsRow({
  index,
  title,
  detail,
}: {
  index: string;
  title: string;
  detail: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 5.5,
        borderBottomWidth: 0.75,
        borderBottomColor: C.ruleSoft,
      }}
      wrap={false}
    >
      <Text
        style={{
          width: 24,
          fontSize: 8,
          fontFamily: "Helvetica-Bold",
          color: C.brand,
          paddingTop: 1.5,
        }}
      >
        {index}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 9.6, fontFamily: "Helvetica-Bold", color: C.ink }}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 8, color: C.muted, marginTop: 1, lineHeight: 1.4 }}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}
