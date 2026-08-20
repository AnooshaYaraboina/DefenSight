/**
 * Semantic layer.
 *
 * Compares text against a curated corpus of attack techniques using character
 * n-gram cosine similarity. Character n-grams are used rather than word tokens
 * because they degrade gracefully under the exact perturbations attackers
 * apply: spacing tricks, minor misspellings, inserted punctuation and partial
 * obfuscation all leave most n-grams intact.
 *
 * The detector scores the *margin* between attack similarity and benign
 * similarity, not raw attack similarity. Business language shares plenty of
 * surface form with attack language ("you must", "the following"), so absolute
 * similarity is a poor discriminator while the margin is a good one.
 *
 * Everything is computed locally and deterministically. No embedding service,
 * no API key, no network — the layer works identically on a reviewer's laptop
 * with no credentials configured.
 */
import { severityFromRisk } from "../taxonomy";
import type { DetectionResult } from "../types";
import type { Detector, DetectorInput } from "./types";
import { ATTACK_CORPUS, BENIGN_CORPUS, type CorpusEntry } from "./corpus";

const NGRAM = 4;

type Vector = Map<string, number>;

function ngrams(text: string, n = NGRAM): string[] {
  const cleaned = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (cleaned.length <= n) return [cleaned];
  const out: string[] = [];
  for (let i = 0; i <= cleaned.length - n; i++) out.push(cleaned.slice(i, i + n));
  return out;
}

function vectorize(text: string): Vector {
  const v: Vector = new Map();
  for (const g of ngrams(text)) v.set(g, (v.get(g) ?? 0) + 1);
  // Sublinear scaling stops a repeated phrase from dominating the profile.
  for (const [k, count] of v) v.set(k, 1 + Math.log(count));
  return v;
}

function norm(v: Vector): number {
  let sum = 0;
  for (const value of v.values()) sum += value * value;
  return Math.sqrt(sum);
}

function cosine(a: Vector, aNorm: number, b: Vector, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  // Iterate the smaller map — the corpus entries are always far smaller than
  // a document, so this matters on long inputs.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, value] of small) {
    const other = large.get(k);
    if (other !== undefined) dot += value * other;
  }
  return dot / (aNorm * bNorm);
}

interface PreparedEntry extends CorpusEntry {
  vector: Vector;
  norm: number;
}

function prepare(entries: CorpusEntry[]): PreparedEntry[] {
  return entries.map((e) => {
    const vector = vectorize(e.text);
    return { ...e, vector, norm: norm(vector) };
  });
}

// Built once at module load; the corpus is static.
const ATTACK_VECTORS = prepare(ATTACK_CORPUS);
const BENIGN_VECTORS = prepare(BENIGN_CORPUS);

/**
 * Long documents are compared window by window. An injected paragraph inside a
 * twelve-page report would be diluted to nothing by whole-document similarity.
 */
function windows(text: string, size = 420, stride = 210): Array<{ text: string; start: number }> {
  if (text.length <= size) return [{ text, start: 0 }];
  const out: Array<{ text: string; start: number }> = [];
  for (let i = 0; i + 1 < text.length; i += stride) {
    out.push({ text: text.slice(i, i + size), start: i });
    if (i + size >= text.length) break;
  }
  return out;
}

export interface SemanticMatch {
  technique: string;
  similarity: number;
  benignSimilarity: number;
  margin: number;
  sample: string;
  windowStart: number;
}

export function analyseSemantics(text: string): SemanticMatch | null {
  let best: SemanticMatch | null = null;

  for (const w of windows(text)) {
    const v = vectorize(w.text);
    const n = norm(v);
    if (n === 0) continue;

    let topAttack = { similarity: 0, technique: "", sample: "" };
    for (const entry of ATTACK_VECTORS) {
      const sim = cosine(v, n, entry.vector, entry.norm);
      if (sim > topAttack.similarity) {
        topAttack = { similarity: sim, technique: entry.technique, sample: entry.text };
      }
    }

    let topBenign = 0;
    for (const entry of BENIGN_VECTORS) {
      const sim = cosine(v, n, entry.vector, entry.norm);
      if (sim > topBenign) topBenign = sim;
    }

    const margin = topAttack.similarity - topBenign;
    if (!best || margin > best.margin) {
      best = {
        technique: topAttack.technique,
        similarity: topAttack.similarity,
        benignSimilarity: topBenign,
        margin,
        sample: topAttack.sample,
        windowStart: w.start,
      };
    }
  }

  return best;
}

const TECHNIQUE_THREATS: Record<string, DetectionResult["threatType"]> = {
  "instruction-override": "INSTRUCTION_OVERRIDE",
  "role-manipulation": "ROLE_MANIPULATION",
  "system-prompt-extraction": "SYSTEM_PROMPT_EXTRACTION",
  jailbreak: "JAILBREAK",
  concealment: "PROMPT_INJECTION",
  exfiltration: "DATA_EXFILTRATION",
  "tool-abuse": "TOOL_ABUSE",
  "indirect-injection": "INDIRECT_PROMPT_INJECTION",
  "encoded-payload": "ENCODED_PAYLOAD",
};

export const semanticDetector: Detector = {
  id: "semantic.corpus-similarity",
  layer: "SEMANTIC",
  channels: ["USER_INPUT", "RAG_CONTEXT", "TOOL_RESULT", "AGENT_MEMORY", "MODEL_OUTPUT"],

  run(input: DetectorInput): DetectionResult[] {
    const results: DetectionResult[] = [];
    const seen = new Set<string>();

    // Analyse the canonical form and any decoded variant. A payload that only
    // resembles an attack after Base64 decoding is exactly what this catches.
    const targets = [
      { text: input.normalization.canonical, origin: "canonical", depth: 0 },
      ...input.normalization.variants
        .filter((v) => v.depth > 0)
        .map((v) => ({ text: v.text, origin: v.origin, depth: v.depth })),
    ];

    for (const target of targets) {
      if (target.text.length < 40) continue;
      const match = analyseSemantics(target.text);
      if (!match) continue;

      /*
       * Short text carries few n-grams, so cosine similarity against it is
       * noisy — a one-line business request can land within 0.07 of an attack
       * phrasing purely by chance. Replay showed this producing the majority of
       * this layer's false positives, so short inputs must clear a materially
       * wider margin before the layer will speak.
       */
      const shortText = target.text.length < 220;
      const minMargin = shortText ? 0.16 : 0.09;
      if (match.similarity < 0.2 || match.margin < minMargin) continue;

      const threatType = TECHNIQUE_THREATS[match.technique] ?? "PROMPT_INJECTION";
      if (seen.has(threatType + target.origin)) continue;
      seen.add(threatType + target.origin);

      // Margin drives confidence; absolute similarity only modulates it.
      // Calibrated against the corpus: a 0.22 margin is already a decisive
      // separation from ordinary language, so scaling against 0.32 was
      // discarding genuine paraphrase attacks that sit in the 0.06-0.10 band.
      const marginComponent = Math.min(1, match.margin / 0.22);
      const similarityComponent = Math.min(1, match.similarity / 0.45);
      const depthBoost = target.depth > 0 ? 1.25 : 1;
      const confidence = Math.min(
        0.78,
        marginComponent * 0.6 * depthBoost + similarityComponent * 0.28,
      );
      if (confidence < 0.25) continue;

      const isRetrieved = input.channel === "RAG_CONTEXT" || input.channel === "TOOL_RESULT";
      const finalThreat =
        isRetrieved && threatType === "PROMPT_INJECTION"
          ? "INDIRECT_PROMPT_INJECTION"
          : threatType;

      results.push({
        detectorId: this.id,
        layer: "SEMANTIC",
        threatType: finalThreat,
        channel: input.channel,
        confidence,
        score: Math.round(confidence * 100),
        severity: severityFromRisk(confidence * 100 + (isRetrieved ? 8 : 0)),
        explanation:
          `The text is semantically close to known ${match.technique.replace(/-/g, " ")} attacks ` +
          `(similarity ${match.similarity.toFixed(2)} against a ${match.benignSimilarity.toFixed(2)} baseline for ordinary business language, ` +
          `a margin of ${match.margin.toFixed(2)})` +
          (target.depth > 0 ? ` — and only after decoding (${target.origin}).` : ".") +
          " This layer compares meaning rather than wording, so it fires on paraphrases no pattern list contains.",
        evidence: {
          neighbours: [
            {
              technique: match.technique,
              similarity: Number(match.similarity.toFixed(4)),
              sample: match.sample,
            },
          ],
          statistics: {
            attackSimilarity: Number(match.similarity.toFixed(4)),
            benignSimilarity: Number(match.benignSimilarity.toFixed(4)),
            margin: Number(match.margin.toFixed(4)),
            windowStart: match.windowStart,
          },
          variant: target.origin,
        },
        sourceDocumentId: input.sourceDocumentId,
      });
    }

    return results;
  },
};
