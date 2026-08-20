/**
 * Recursive normalisation pipeline.
 *
 * Produces every readable form of the input so detectors run against all of
 * them, not just the literal text. Recursion matters: a Base64 blob that
 * decodes to ROT13 that decodes to an instruction is a real technique, and a
 * single-pass decoder misses it.
 *
 * Depth is capped and results are deduplicated by content hash, so a
 * self-referential or amplifying input cannot make normalisation expensive.
 */
import { normalizeUnicode, findMixedScriptWords, type UnicodeNormalization } from "./unicode";
import { DECODERS, type DecodeResult } from "./encodings";

export interface NormalizedVariant {
  /** The text detectors should analyse. */
  text: string;
  /** How this variant was produced: "original", "unicode", "base64:1"… */
  origin: string;
  /** Recursion depth: 0 is the input as supplied. */
  depth: number;
  /** Confidence that this variant represents intentional concealment. */
  confidence: number;
  /** Offsets in the *original* text this variant came from, when known. */
  sourceRange?: { start: number; end: number };
}

export interface NormalizationResult {
  /** The canonical form: unicode-normalised original. */
  canonical: string;
  /** Every form worth analysing, including the original. */
  variants: NormalizedVariant[];
  unicode: UnicodeNormalization;
  /** Words mixing alphabets — near-conclusive obfuscation evidence. */
  mixedScriptWords: string[];
  /** Decodes found at any depth. */
  decodes: Array<DecodeResult & { depth: number }>;
  /** True when the input showed any sign of deliberate concealment. */
  obfuscated: boolean;
  /** 0-1 strength of the concealment signal. */
  obfuscationScore: number;
}

const MAX_DEPTH = 3;
const MAX_VARIANTS = 24;

export function normalize(input: string): NormalizationResult {
  const unicode = normalizeUnicode(input);
  const mixedScriptWords = findMixedScriptWords(input);

  const variants: NormalizedVariant[] = [
    { text: input, origin: "original", depth: 0, confidence: 1 },
  ];
  const seen = new Set<string>([input]);

  if (unicode.changed) {
    variants.push({
      text: unicode.text,
      origin: "unicode",
      depth: 0,
      confidence: 1,
    });
    seen.add(unicode.text);
  }

  const decodes: Array<DecodeResult & { depth: number }> = [];

  // Breadth-first so shallow decodes are always found before deep ones.
  let frontier: Array<{ text: string; depth: number; origin: string }> = [
    { text: unicode.changed ? unicode.text : input, depth: 0, origin: "" },
  ];

  while (frontier.length > 0 && variants.length < MAX_VARIANTS) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      if (node.depth >= MAX_DEPTH) continue;
      for (const decoder of DECODERS) {
        let results: DecodeResult[];
        try {
          results = decoder.run(node.text);
        } catch {
          continue; // a malformed input must never break the pipeline
        }
        for (const r of results) {
          if (seen.has(r.decoded) || variants.length >= MAX_VARIANTS) continue;
          seen.add(r.decoded);
          const depth = node.depth + 1;
          const origin = node.origin
            ? `${node.origin}→${r.encoding}`
            : `${r.encoding}`;
          decodes.push({ ...r, depth });
          variants.push({
            text: r.decoded,
            origin: `${origin}:${depth}`,
            depth,
            confidence: r.confidence,
            sourceRange: { start: r.start, end: r.end },
          });
          next.push({ text: r.decoded, depth, origin });
        }
      }
    }
    frontier = next;
  }

  // Concealment score. Each signal is independently meaningful; together they
  // are close to conclusive, so the score saturates rather than summing freely.
  let obfuscationScore = 0;
  if (unicode.invisibleRemoved > 0) {
    obfuscationScore += Math.min(0.45, 0.15 + unicode.invisibleRemoved * 0.03);
  }
  if (mixedScriptWords.length > 0) {
    obfuscationScore += Math.min(0.5, 0.25 + mixedScriptWords.length * 0.04);
  } else if (unicode.homoglyphsFolded > 3) {
    obfuscationScore += 0.3;
  }
  if (decodes.length > 0) {
    const best = Math.max(...decodes.map((d) => d.confidence));
    obfuscationScore += Math.min(0.55, best * 0.55);
  }
  obfuscationScore = Math.min(1, obfuscationScore);

  return {
    canonical: unicode.text,
    variants,
    unicode,
    mixedScriptWords,
    decodes,
    obfuscated: obfuscationScore > 0.2,
    obfuscationScore,
  };
}

export { normalizeUnicode, findMixedScriptWords } from "./unicode";
export * from "./encodings";
