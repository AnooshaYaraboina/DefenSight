/**
 * Structural layer.
 *
 * Looks at the *shape* of the text rather than its vocabulary, so it catches
 * attacks whose wording the lexical layer has never seen. The premise: a
 * business document describes things, while an injected directive commands
 * things — and that difference shows up in structure long before it shows up in
 * any particular phrase.
 *
 * Signals:
 *  - imperative density: what proportion of sentences issue commands
 *  - addressee shift: a report that suddenly starts saying "you must"
 *  - positional anomaly: directives clustered in one block of an otherwise
 *    descriptive document
 *  - register discontinuity: an abrupt change in sentence shape mid-document
 *  - enumerated command sequences: numbered steps addressed to a reader
 *  - egress markers: outbound URLs and addresses in a document that has no
 *    business containing them
 */
import type { Severity } from "../taxonomy";
import { severityFromRisk } from "../taxonomy";
import type { DetectionResult, EvidenceSpan } from "../types";
import type { Detector, DetectorInput } from "./types";

/** Verbs that, in sentence-initial position, signal a command to the reader. */
const IMPERATIVE_VERBS = new Set([
  "ignore", "disregard", "forget", "override", "reveal", "show", "print",
  "output", "repeat", "display", "dump", "send", "email", "forward", "post",
  "upload", "execute", "run", "call", "invoke", "query", "delete", "drop",
  "truncate", "remove", "disable", "suppress", "bypass", "act", "pretend",
  "assume", "adopt", "confirm", "comply", "obey", "follow", "perform",
  "complete", "include", "append", "embed", "paste", "decode", "respond",
  "answer", "begin", "start", "stop", "never", "always", "do", "don't",
  "must", "ensure", "make", "treat", "report", "list", "provide", "return",
]);

const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/gi;
const MODAL_OBLIGATION = /\b(?:must|shall|should|need to|have to|are required to|are obligated to)\b/gi;

interface Sentence {
  text: string;
  start: number;
  end: number;
}

function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+[.!?]*/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (trimmed.length < 3) continue;
    const offset = (m.index ?? 0) + raw.indexOf(trimmed);
    out.push({ text: trimmed, start: offset, end: offset + trimmed.length });
  }
  return out;
}

function isImperative(sentence: string): boolean {
  // Strip list markers and leading adverbs so "1. Immediately delete…" still reads
  // as a command.
  const cleaned = sentence
    .replace(/^\s*(?:\d+[.)]|[-*•]|\([a-z0-9]+\))\s*/i, "")
    .replace(/^(?:please|now|then|immediately|first|next|finally|also|instead)\s+/i, "")
    .trim();
  const firstWord = cleaned.split(/[\s,]+/)[0]?.toLowerCase().replace(/[^a-z']/g, "");
  if (!firstWord) return false;
  if (IMPERATIVE_VERBS.has(firstWord)) return true;
  // "You must X" / "You are required to X" is an imperative in disguise.
  return /^you\s+(?:must|should|shall|need\s+to|have\s+to|are\s+(?:required|obligated|asked)\s+to)\b/i.test(
    cleaned,
  );
}

export interface StructuralProfile {
  sentenceCount: number;
  imperativeCount: number;
  imperativeDensity: number;
  secondPersonDensity: number;
  obligationDensity: number;
  /** Largest run of consecutive imperative sentences. */
  longestCommandRun: number;
  /** Position of that run as a fraction through the document. */
  commandRunPosition: number;
  /** Ratio of imperative density inside the run versus outside it. */
  registerContrast: number;
  externalUrls: string[];
  externalEmails: string[];
  allCapsDirectiveBlocks: number;
}

export function profileStructure(text: string): StructuralProfile {
  const sentences = splitSentences(text);
  const flags = sentences.map((s) => isImperative(s.text));
  const imperativeCount = flags.filter(Boolean).length;

  let longestRun = 0;
  let runStartIndex = 0;
  let current = 0;
  let currentStart = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      if (current === 0) currentStart = i;
      current++;
      if (current > longestRun) {
        longestRun = current;
        runStartIndex = currentStart;
      }
    } else {
      current = 0;
    }
  }

  // Contrast between the command block and the rest of the document. A memo
  // that is uniformly instructional scores low here; a report with one
  // instructional block scores high.
  const inRun = new Set<number>();
  for (let i = runStartIndex; i < runStartIndex + longestRun; i++) inRun.add(i);
  const outside = flags.filter((_, i) => !inRun.has(i));
  const outsideDensity = outside.length
    ? outside.filter(Boolean).length / outside.length
    : 0;
  const insideDensity = longestRun > 0 ? 1 : 0;
  const registerContrast =
    longestRun >= 2 ? insideDensity - outsideDensity : 0;

  const words = text.split(/\s+/).length || 1;
  const secondPerson = (text.match(SECOND_PERSON) ?? []).length;
  const obligations = (text.match(MODAL_OBLIGATION) ?? []).length;

  const urls = [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].map((m) => m[0]);
  const emails = [
    ...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
  ].map((m) => m[0]);

  // An all-caps line is only meaningful if it announces a machine-directed
  // block. Ordinary documents are full of all-caps section headers, so
  // counting those made this signal fire on every runbook and policy.
  const allCapsBlocks = [
    ...text.matchAll(/^[^a-z\n]{12,}$/gm),
  ].filter((m) =>
    /\b(?:SYSTEM|DIRECTIVE|INSTRUCTION|ASSISTANT|AI|AGENT|AUTOMATED|PROCESSING|MACHINE|MANDATORY|OVERRIDE|CONFIGURATION)\b/.test(
      m[0],
    ),
  ).length;

  return {
    sentenceCount: sentences.length,
    imperativeCount,
    imperativeDensity: sentences.length ? imperativeCount / sentences.length : 0,
    secondPersonDensity: secondPerson / words,
    obligationDensity: obligations / words,
    longestCommandRun: longestRun,
    commandRunPosition: flags.length ? runStartIndex / flags.length : 0,
    registerContrast,
    externalUrls: urls,
    externalEmails: emails,
    allCapsDirectiveBlocks: allCapsBlocks,
  };
}

/** Domains and addresses that belong to the organisation are not egress. */
const INTERNAL_HOST = /(?:^|\.)northwind\.example$/i;

function isExternalHost(value: string): boolean {
  try {
    const host = value.includes("@")
      ? value.split("@")[1]
      : new URL(value).hostname;
    return !INTERNAL_HOST.test(host);
  } catch {
    return true;
  }
}

export const structuralDetector: Detector = {
  id: "structural.command-shape",
  layer: "STRUCTURAL",
  channels: ["RAG_CONTEXT", "TOOL_RESULT", "USER_INPUT", "AGENT_MEMORY"],

  run(input: DetectorInput): DetectionResult[] {
    const text = input.normalization.canonical;
    // Short text has no meaningful structure to analyse.
    if (text.length < 240) return [];

    const p = profileStructure(text);
    if (p.sentenceCount < 6) return [];

    const signals: Array<{ label: string; value: number; weight: number; detail: string }> = [];

    // A cluster of consecutive commands inside a descriptive document is the
    // single strongest structural signal of an injected block.
    if (p.longestCommandRun >= 3 && p.registerContrast > 0.55) {
      signals.push({
        label: "isolated command block",
        value: Math.min(1, p.longestCommandRun / 6),
        weight: 1,
        detail: `${p.longestCommandRun} consecutive directive sentences appear ${Math.round(p.commandRunPosition * 100)}% of the way through an otherwise descriptive document`,
      });
    }

    // Documents that address the reader as "you" and impose obligations are
    // instructing, not reporting.
    if (p.secondPersonDensity > 0.012 && p.obligationDensity > 0.004) {
      signals.push({
        label: "addressee shift",
        value: Math.min(1, p.secondPersonDensity / 0.04),
        weight: 0.75,
        detail: `second-person address and obligation language appear at ${(p.secondPersonDensity * 100).toFixed(1)}% and ${(p.obligationDensity * 100).toFixed(1)}% of tokens`,
      });
    }

    // Only counted when the command block did not already fire — otherwise a
    // runbook reaches the two-signal bar on a single underlying observation.
    const commandBlockFired = signals.some((s) => s.label === "isolated command block");
    if (!commandBlockFired && p.imperativeDensity > 0.28 && p.sentenceCount > 10) {
      signals.push({
        label: "high imperative density",
        value: Math.min(1, p.imperativeDensity / 0.5),
        weight: 0.6,
        detail: `${Math.round(p.imperativeDensity * 100)}% of sentences issue commands`,
      });
    }

    const externalUrls = p.externalUrls.filter(isExternalHost);
    const externalEmails = p.externalEmails.filter(isExternalHost);
    if ((externalUrls.length > 0 || externalEmails.length > 0) && p.longestCommandRun >= 2) {
      signals.push({
        label: "egress destination in a directive block",
        value: 1,
        weight: 0.9,
        detail: `directives reference external destinations: ${[...externalUrls, ...externalEmails].slice(0, 3).join(", ")}`,
      });
    }

    if (p.allCapsDirectiveBlocks > 0 && p.longestCommandRun >= 2) {
      signals.push({
        label: "emphasised directive header",
        value: Math.min(1, p.allCapsDirectiveBlocks / 2),
        weight: 0.45,
        detail: `${p.allCapsDirectiveBlocks} all-caps header line(s) introduce a command block`,
      });
    }

    // One structural signal is not evidence of an attack. Procedural documents
    // — runbooks, checklists, onboarding guides — are legitimately imperative
    // and will always trip a single signal. Requiring two independent signals
    // is what separates "this document gives instructions" from "this document
    // gives instructions to the model, and points them somewhere".
    if (signals.length < 2) return [];

    // Structural evidence is suggestive rather than conclusive on its own, so
    // the ceiling sits below the block threshold. Its job is to corroborate.
    const raw = signals.reduce((s, sig) => s + sig.value * sig.weight, 0);
    const confidence = Math.min(0.72, 1 - Math.exp(-raw * 0.75));
    if (confidence < 0.3) return [];

    const isRetrieved = input.channel === "RAG_CONTEXT" || input.channel === "TOOL_RESULT";
    const severity: Severity = severityFromRisk(confidence * 100 + (isRetrieved ? 10 : 0));

    // Anchor the finding to the command block so the UI can highlight it.
    const spans: EvidenceSpan[] = [];
    const sentences = splitSentences(text);
    const flags = sentences.map((s) => isImperative(s.text));
    let run = 0;
    let best: { start: number; end: number; len: number } | null = null;
    let startIdx = 0;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) {
        if (run === 0) startIdx = i;
        run++;
        if (!best || run > best.len) {
          best = { start: sentences[startIdx].start, end: sentences[i].end, len: run };
        }
      } else run = 0;
    }
    if (best && best.len >= 2) {
      spans.push({
        start: best.start,
        end: Math.min(best.end, best.start + 600),
        text: text.slice(best.start, Math.min(best.end, best.start + 200)),
        label: "directive block",
      });
    }

    return [
      {
        detectorId: this.id,
        layer: "STRUCTURAL",
        threatType: isRetrieved ? "INDIRECT_PROMPT_INJECTION" : "PROMPT_INJECTION",
        channel: input.channel,
        confidence,
        score: Math.round(confidence * 100),
        severity,
        explanation: `The text is structured as instructions rather than information: ${signals.map((s) => s.detail).join("; ")}. Structural analysis is vocabulary-independent, so this fires on novel phrasings the pattern layer has never seen.`,
        evidence: {
          spans,
          signals: signals.map((s) => ({ label: s.label, value: Number(s.value.toFixed(3)), detail: s.detail })),
          statistics: {
            sentences: p.sentenceCount,
            imperativeDensity: Number(p.imperativeDensity.toFixed(3)),
            longestCommandRun: p.longestCommandRun,
            registerContrast: Number(p.registerContrast.toFixed(3)),
            secondPersonDensity: Number(p.secondPersonDensity.toFixed(4)),
          },
          externalDestinations: [...externalUrls, ...externalEmails].slice(0, 5),
        },
        sourceDocumentId: input.sourceDocumentId,
      },
    ];
  },
};
