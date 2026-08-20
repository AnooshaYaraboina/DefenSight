/**
 * Sensitive data scanner and redactor (§15).
 *
 * Scans any monitored channel, validates each candidate, and can produce a
 * redacted copy of the text. Redaction is applied right-to-left so earlier
 * offsets stay valid as the string is rewritten.
 */
import type { Channel } from "../taxonomy";
import type { EvidenceSpan, SensitiveFinding } from "../types";
import { SENSITIVE_PATTERNS, type SensitivePattern } from "./patterns";

/** Characters of surrounding text a validator may inspect. */
const VALIDATION_CONTEXT = 60;

interface RawMatch {
  pattern: SensitivePattern;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

function collectMatches(text: string, types?: string[]): RawMatch[] {
  const matches: RawMatch[] = [];
  const active = types
    ? SENSITIVE_PATTERNS.filter((p) => types.includes(p.type))
    : SENSITIVE_PATTERNS;

  for (const pattern of active) {
    pattern.re.lastIndex = 0;
    for (const m of text.matchAll(pattern.re)) {
      const matchText = m[0];
      const start = m.index ?? 0;
      const context = text.slice(
        Math.max(0, start - VALIDATION_CONTEXT),
        start + matchText.length + VALIDATION_CONTEXT,
      );

      let confidence = pattern.baseConfidence;
      if (pattern.validate) {
        const factor = pattern.validate(matchText, context);
        if (factor === null) continue; // validator rejected the candidate
        confidence = Math.min(1, confidence * factor);
      }
      if (confidence < 0.3) continue;

      matches.push({ pattern, text: matchText, start, end: start + matchText.length, confidence });
    }
  }

  // Overlapping matches: keep the highest-confidence one. A connection string
  // contains a password, and reporting both would double-count the same leak.
  matches.sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length);
  const kept: RawMatch[] = [];
  for (const m of matches) {
    if (kept.some((k) => m.start < k.end && m.end > k.start)) continue;
    kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export interface ScanOptions {
  /** Restrict the scan to specific types. Defaults to all. */
  types?: string[];
  /** Maximum spans recorded per finding. */
  maxSpans?: number;
}

export function scanSensitive(
  text: string,
  channel: Channel,
  options: ScanOptions = {},
): SensitiveFinding[] {
  if (!text) return [];
  const matches = collectMatches(text, options.types);
  if (matches.length === 0) return [];

  const maxSpans = options.maxSpans ?? 8;
  const byType = new Map<string, { pattern: SensitivePattern; matches: RawMatch[] }>();

  for (const m of matches) {
    const entry = byType.get(m.pattern.type);
    if (entry) entry.matches.push(m);
    else byType.set(m.pattern.type, { pattern: m.pattern, matches: [m] });
  }

  const findings: SensitiveFinding[] = [];
  for (const [type, { pattern, matches: group }] of byType) {
    const spans: EvidenceSpan[] = group.slice(0, maxSpans).map((m) => ({
      start: m.start,
      end: m.end,
      text: pattern.mask(m.text),
      label: pattern.label,
    }));

    findings.push({
      type,
      category: pattern.category,
      channel,
      count: group.length,
      maskedSample: pattern.mask(group[0].text),
      confidence: Math.max(...group.map((m) => m.confidence)),
      spans,
    });
  }

  return findings.sort((a, b) => b.confidence - a.confidence);
}

export interface RedactionResult {
  text: string;
  /** Number of values masked. */
  replaced: number;
  types: string[];
}

/**
 * Produce a masked copy of the text. Replacements run right-to-left so that
 * offsets computed against the original string remain valid throughout.
 */
export function redactSensitive(
  text: string,
  options: ScanOptions = {},
): RedactionResult {
  const matches = collectMatches(text, options.types);
  if (matches.length === 0) return { text, replaced: 0, types: [] };

  let out = text;
  for (const m of [...matches].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, m.start) + m.pattern.mask(m.text) + out.slice(m.end);
  }

  return {
    text: out,
    replaced: matches.length,
    types: [...new Set(matches.map((m) => m.pattern.type))],
  };
}

/**
 * Aggregate weight of what was found, 0-1. Feeds the "data sensitivity" factor
 * in the risk engine, where a leaked credential must outweigh a leaked email
 * address by a wide margin.
 */
export function sensitivityWeight(findings: SensitiveFinding[]): number {
  if (findings.length === 0) return 0;
  const weights = findings.map((f) => {
    const pattern = SENSITIVE_PATTERNS.find((p) => p.type === f.type);
    const base = (pattern?.weight ?? 0.5) * f.confidence;
    // Volume matters, but sub-linearly: ten leaked emails is worse than one,
    // not ten times worse.
    return base * (1 + Math.log10(Math.min(f.count, 100)) * 0.4);
  });
  const top = Math.max(...weights);
  const rest = weights.reduce((s, w) => s + w, 0) - top;
  return Math.min(1, top + rest * 0.2);
}

export * from "./patterns";
