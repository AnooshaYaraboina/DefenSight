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
 */

/* Read from the repo rather than fetched. A report that depends on a network
   round trip to draw its own logo is a report that fails offline.
 *
 * Passed as bytes, not as a path. Handing @react-pdf a filesystem path fails
 * silently — the document still renders, just without the mark, and a 15KB PDF
 * that should be 290KB is the only clue. Reading it here turns a silent
 * omission into a loud one. */
const MARK_PATH = path.join(process.cwd(), "public", "brand", "defensight-mark-v2.png");

let markCache: Buffer | null = null;

function markData(): Buffer {
  markCache ??= fs.readFileSync(MARK_PATH);
  return markCache;
}

export function Chip({
  label,
  fg,
  bg,
}: {
  label: string;
  fg: string;
  bg: string;
}) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 7 }}>
      <Text style={[s.chip, { color: fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function SeverityChip({ severity }: { severity: string }) {
  const { fg, bg } = severityColour(severity);
  return <Chip label={severity} fg={fg} bg={bg} />;
}

export function Section({
  index,
  title,
  children,
  wrap = true,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <View style={s.section} wrap={wrap}>
      <Text style={s.sectionNum}>{index}</Text>
      <Text style={s.h2}>{title}</Text>
      <View style={s.h2Rule} />
      {children}
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
    <View style={{ width, marginBottom: 12, paddingRight: 10 }}>
      <Text style={[s.th, { paddingBottom: 2 }]}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 9.5, color: colour ?? C.ink, fontFamily: "Helvetica-Bold" }}>
        {value}
      </Text>
    </View>
  );
}

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
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  colour?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ marginBottom: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ fontSize: 8.5, color: C.inkSoft }}>{label}</Text>
        <Text style={{ fontSize: 8.5, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          {value}
          {suffix}
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: C.ruleSoft, borderRadius: 3 }}>
        <View
          style={{
            height: 5,
            width: `${pct * 100}%`,
            backgroundColor: colour,
            borderRadius: 3,
          }}
        />
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
  stages: Array<{ label?: string; stage?: string; summary?: string; interventionPoint?: boolean }>;
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
              borderRadius: stop ? 4 : 0,
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
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
                <Text style={{ fontSize: 8.5, color: C.muted, lineHeight: 1.5, marginTop: 1 }}>
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

export function PageFooter({ ref_, generatedAt }: { ref_: string; generatedAt: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        DEFENSIGHT · {ref_} · CONFIDENTIAL
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `${generatedAt}   ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export function CoverMark() {
  /* @react-pdf's Image is not an <img> — it draws into a PDF and has no alt
     attribute to give. The rule cannot tell the two apart. */
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image src={{ data: markData(), format: "png" }} style={s.coverMark} />;
}
