/**
 * Encoding decoders.
 *
 * A payload that is Base64-encoded defeats any detector reading literal text.
 * Each decoder is deliberately conservative: it only reports a decode when the
 * result looks like natural language, because a false decode injects noise into
 * every layer downstream.
 */

export interface DecodeResult {
  encoding: string;
  decoded: string;
  /** Where in the source the encoded region was found. */
  start: number;
  end: number;
  /** 0-1 confidence that this really was encoded content. */
  confidence: number;
}

/** Printable-ASCII ratio and word-likeness — a cheap "is this text?" test. */
function looksLikeText(s: string): number {
  if (s.length < 12) return 0;
  const printable = s.replace(/[^\x20-\x7E\n\r\t]/g, "").length / s.length;
  if (printable < 0.85) return 0;
  const words = s.match(/[A-Za-z]{2,}/g) ?? [];
  const alphaCoverage = words.join("").length / s.length;
  const spaceRatio = (s.match(/ /g)?.length ?? 0) / s.length;
  // Natural English sits around 0.15-0.2 spaces and high alpha coverage.
  let score = printable * 0.4 + Math.min(1, alphaCoverage / 0.7) * 0.4;
  if (spaceRatio > 0.06 && spaceRatio < 0.3) score += 0.2;
  return Math.min(1, score);
}

const BASE64_RE = /[A-Za-z0-9+/]{24,}={0,2}/g;

export function decodeBase64(input: string): DecodeResult[] {
  const out: DecodeResult[] = [];
  for (const m of input.matchAll(BASE64_RE)) {
    const raw = m[0];
    // Base64 encodes 3 bytes per 4 chars; a valid block is a multiple of 4
    // once padding is accounted for.
    if (raw.replace(/=+$/, "").length % 4 === 1) continue;
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      const quality = looksLikeText(decoded);
      if (quality >= 0.55) {
        out.push({
          encoding: "base64",
          decoded,
          start: m.index!,
          end: m.index! + raw.length,
          confidence: quality,
        });
      }
    } catch {
      /* not valid base64 — skip */
    }
  }
  return out;
}

const HEX_RE = /(?:[0-9a-fA-F]{2}[\s:-]?){16,}/g;

export function decodeHex(input: string): DecodeResult[] {
  const out: DecodeResult[] = [];
  for (const m of input.matchAll(HEX_RE)) {
    const cleaned = m[0].replace(/[\s:-]/g, "");
    if (cleaned.length % 2 !== 0) continue;
    try {
      const decoded = Buffer.from(cleaned, "hex").toString("utf8");
      const quality = looksLikeText(decoded);
      if (quality >= 0.6) {
        out.push({
          encoding: "hex",
          decoded,
          start: m.index!,
          end: m.index! + m[0].length,
          confidence: quality,
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * ROT13 has no marker, so it is only worth reporting when rotating turns
 * gibberish into markedly more English-looking text than the original.
 */
export function decodeRot13(input: string): DecodeResult[] {
  if (input.length < 24) return [];
  const rotated = rot13(input);
  const before = looksLikeText(input);
  const after = looksLikeText(rotated);
  const englishBefore = englishness(input);
  const englishAfter = englishness(rotated);
  if (englishAfter > englishBefore * 2 && englishAfter > 0.4 && after >= before) {
    return [
      {
        encoding: "rot13",
        decoded: rotated,
        start: 0,
        end: input.length,
        confidence: Math.min(0.9, englishAfter),
      },
    ];
  }
  return [];
}

/** Frequency of the most common English words — a rough language detector. */
const COMMON = [
  "the", "and", "you", "your", "are", "for", "not", "all", "any", "must",
  "this", "that", "with", "from", "instructions", "ignore", "system", "prompt",
];
function englishness(s: string): number {
  const lower = s.toLowerCase();
  const words = lower.match(/[a-z]{2,}/g) ?? [];
  if (words.length < 4) return 0;
  const hits = words.filter((w) => COMMON.includes(w)).length;
  return Math.min(1, hits / Math.max(4, words.length * 0.12));
}

export function decodeUrl(input: string): DecodeResult[] {
  if (!/%[0-9a-fA-F]{2}/.test(input)) return [];
  try {
    const decoded = decodeURIComponent(input);
    if (decoded === input) return [];
    return [
      {
        encoding: "url",
        decoded,
        start: 0,
        end: input.length,
        confidence: 0.75,
      },
    ];
  } catch {
    return [];
  }
}

/** HTML entities used to smuggle characters past naive filters. */
export function decodeHtmlEntities(input: string): DecodeResult[] {
  if (!/&(#x?[0-9a-fA-F]+|[a-z]+);/i.test(input)) return [];
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  };
  const decoded = input.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return named[body.toLowerCase()] ?? whole;
  });
  if (decoded === input) return [];
  return [{ encoding: "html-entity", decoded, start: 0, end: input.length, confidence: 0.7 }];
}

/** Character-separated text: "i-g-n-o-r-e  a-l-l" defeats word matching. */
export function decodeSpaced(input: string): DecodeResult[] {
  const re = /(?:\b[A-Za-z]\s*[-._*|]\s*){5,}[A-Za-z]\b/g;
  const out: DecodeResult[] = [];
  for (const m of input.matchAll(re)) {
    const collapsed = m[0].replace(/[\s\-._*|]/g, "");
    if (englishness(collapsed) > 0.2 || collapsed.length > 8) {
      out.push({
        encoding: "character-separated",
        decoded: collapsed,
        start: m.index!,
        end: m.index! + m[0].length,
        confidence: 0.65,
      });
    }
  }
  return out;
}

export const DECODERS: Array<{
  name: string;
  run: (input: string) => DecodeResult[];
}> = [
  { name: "base64", run: decodeBase64 },
  { name: "hex", run: decodeHex },
  { name: "url", run: decodeUrl },
  { name: "html-entity", run: decodeHtmlEntities },
  { name: "character-separated", run: decodeSpaced },
  { name: "rot13", run: decodeRot13 },
];
