"use client";

import * as React from "react";
import { Binary, Braces, ChevronDown, Fingerprint, Radar, ShieldCheck, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge, ThreatBadge } from "./indicators";
import { CodePanel, HighlightedText } from "./evidence";
import type { DetectionEvidence, EvidenceSpan } from "@/lib/engine/types";
import type { Severity } from "@/lib/engine/taxonomy";

/** Each analysis layer gets its own mark so the mix is readable at a glance. */
const LAYER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; note: string }> = {
  LEXICAL: { label: "Pattern", icon: Fingerprint, note: "Weighted pattern families with context mitigations." },
  STRUCTURAL: { label: "Structural", icon: Braces, note: "Analyses the shape of the text, not its vocabulary." },
  SEMANTIC: { label: "Semantic", icon: Radar, note: "Similarity to known attacks, scored against a benign baseline." },
  BEHAVIORAL: { label: "Behavioural", icon: Sigma, note: "Deviation from this subject's own established baseline." },
  AUTHORIZATION: { label: "Authorization", icon: ShieldCheck, note: "A permission fact, not an inference." },
  NORMALIZATION: { label: "Obfuscation", icon: Binary, note: "Recovered concealed or encoded content." },
  LLM_ADJUDICATION: { label: "AI adjudication", icon: Radar, note: "Model-assisted classification of an ambiguous case." },
};

export interface DetectionRow {
  id: string;
  detectorId: string;
  layer: string;
  threatType: string;
  channel: string;
  confidence: number;
  score: number;
  severity: string;
  explanation: string;
  evidence: unknown;
}

/**
 * Detection evidence list.
 *
 * Grouped by analysis layer so an analyst sees immediately whether a finding
 * rests on one technique or several agreeing — which is the difference between
 * a lead and a verdict in this engine.
 */
export function DetectionList({
  detections,
  requestText,
}: {
  detections: DetectionRow[];
  requestText?: string;
}) {
  if (detections.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-ink-4">
        No detector fired on this request.
      </p>
    );
  }

  const layers = [...new Set(detections.map((d) => d.layer))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2/40 px-3 py-2">
        <span className="text-[11px] text-ink-3">
          {detections.length} detection{detections.length === 1 ? "" : "s"} across
        </span>
        {layers.map((l) => {
          const meta = LAYER_META[l];
          const Icon = meta?.icon ?? Radar;
          return (
            <Badge key={l} tone="brand" size="xs">
              <Icon />
              {meta?.label ?? l}
            </Badge>
          );
        })}
        <span className="ml-auto text-[11px] text-ink-4">
          {layers.length > 1
            ? `${layers.length} independent methods agree`
            : "single method — treated as a lead"}
        </span>
      </div>

      <ul className="space-y-2">
        {detections.map((d) => (
          <DetectionItem key={d.id} detection={d} requestText={requestText} />
        ))}
      </ul>
    </div>
  );
}

function DetectionItem({
  detection,
  requestText,
}: {
  detection: DetectionRow;
  requestText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = LAYER_META[detection.layer];
  const Icon = meta?.icon ?? Radar;
  const evidence = (detection.evidence ?? {}) as DetectionEvidence;

  const spans = (evidence.spans ?? []) as EvidenceSpan[];
  const hasEvidence =
    spans.length > 0 ||
    Boolean(evidence.decoded) ||
    Boolean(evidence.neighbours) ||
    Boolean(evidence.statistics) ||
    Boolean(evidence.families) ||
    Boolean(evidence.signals);

  return (
    <li className="overflow-hidden rounded-md border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => hasEvidence && setOpen((o) => !o)}
        disabled={!hasEvidence}
        className={cn(
          "w-full px-3 py-2.5 text-left transition-colors",
          hasEvidence && "cursor-pointer hover:bg-surface-2",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-brand" />
          <ThreatBadge
            threat={detection.threatType as never}
            severity={detection.severity as Severity}
            size="xs"
          />
          <Badge tone="outline" size="xs">{meta?.label ?? detection.layer}</Badge>
          <span className="font-mono text-[10px] text-ink-4">
            {(detection.confidence * 100).toFixed(0)}% confidence
          </span>
          <span className="ml-auto flex items-center gap-2">
            <SeverityBadge severity={detection.severity as Severity} size="xs" showIcon={false} withTooltip={false} />
            {hasEvidence && (
              <ChevronDown className={cn("size-3.5 text-ink-4 transition-transform", open && "rotate-180")} />
            )}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{detection.explanation}</p>
      </button>

      {open && hasEvidence && (
        <div className="space-y-3 border-t border-line bg-inset/50 p-3">
          {spans.length > 0 && requestText && (
            <CodePanel label="Matched content">
              <HighlightedText
                text={requestText}
                spans={spans.map((s) => ({
                  ...s,
                  severity: detection.severity.toLowerCase() as never,
                }))}
                maxLength={1400}
              />
            </CodePanel>
          )}

          {spans.length > 0 && !requestText && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Matched spans
              </p>
              <ul className="space-y-1">
                {spans.slice(0, 6).map((s, i) => (
                  <li key={i} className="rounded border border-line bg-surface px-2 py-1.5">
                    <code className="break-words font-mono text-[10px] text-critical">{s.text}</code>
                    <p className="mt-0.5 text-[10px] text-ink-4">{s.label}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evidence.decoded && (
            <CodePanel label={`Decoded (${evidence.decoded.encoding}, depth ${evidence.decoded.depth})`} tone="danger">
              <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-ink-2">
                {evidence.decoded.preview}
              </p>
            </CodePanel>
          )}

          {Array.isArray(evidence.families) && (
            <EvidenceTable
              title="Pattern families matched"
              rows={(evidence.families as Array<Record<string, unknown>>).map((f) => ({
                label: String(f.label),
                value: `strength ${f.strength}`,
                note: Array.isArray(f.matched) ? (f.matched as string[]).join(", ") : undefined,
                muted: Boolean(f.corroborating),
              }))}
            />
          )}

          {Array.isArray(evidence.signals) && (
            <EvidenceTable
              title="Signals"
              rows={(evidence.signals as Array<Record<string, unknown>>).map((s) => ({
                label: String(s.label ?? s.key),
                value: s.z !== undefined ? `${s.z}σ` : `${s.value ?? s.strength}`,
                note: s.detail ? String(s.detail) : undefined,
              }))}
            />
          )}

          {Array.isArray(evidence.neighbours) && (
            <EvidenceTable
              title="Nearest known attacks"
              rows={(evidence.neighbours as Array<Record<string, unknown>>).map((n) => ({
                label: String(n.technique).replace(/-/g, " "),
                value: `${((n.similarity as number) * 100).toFixed(0)}% similar`,
                note: String(n.sample),
              }))}
            />
          )}

          {evidence.statistics && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                Measurements
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {Object.entries(evidence.statistics as Record<string, number>).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1">
                    <dt className="truncate text-[10px] text-ink-4">
                      {k.replace(/([A-Z])/g, " $1")}
                    </dt>
                    <dd className="shrink-0 font-mono text-[10px] text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {Array.isArray(evidence.mitigationsApplied) && (evidence.mitigationsApplied as string[]).length > 0 && (
            <div className="rounded border border-low/25 bg-low-dim/40 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-low">
                Confidence reduced by context
              </p>
              <ul className="mt-1 space-y-0.5">
                {(evidence.mitigationsApplied as string[]).map((m) => (
                  <li key={m} className="text-[11px] text-ink-3">— {m}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="font-mono text-[9px] text-ink-4">
            detector: {detection.detectorId} · channel: {detection.channel}
          </p>
        </div>
      )}
    </li>
  );
}

function EvidenceTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; note?: string; muted?: boolean }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">{title}</p>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={i}
            className={cn(
              "rounded border border-line bg-surface px-2 py-1.5",
              r.muted && "opacity-70",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] capitalize text-ink-2">{r.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3">{r.value}</span>
            </div>
            {r.note && <p className="mt-0.5 text-[10px] leading-relaxed text-ink-4">{r.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
