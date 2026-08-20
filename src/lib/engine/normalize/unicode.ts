/**
 * Unicode normalisation.
 *
 * Attackers hide instructions from human reviewers using characters that either
 * render as nothing (zero-width) or render identically to Latin letters
 * (homoglyphs). The model reads them perfectly well. Every downstream detector
 * therefore runs against normalised text as well as the original, and the
 * normalisation step itself is a detection signal: legitimate business
 * documents do not contain zero-width joiners in the middle of a sentence.
 */

/** Characters with no visual representation that survive into the token stream. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁪-⁯﻿­]/g;

/**
 * Confusable characters mapped to their Latin lookalike. Covers the Cyrillic
 * and Greek blocks that supply nearly all practical homoglyph attacks, plus
 * fullwidth forms and mathematical alphanumerics.
 */
const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic → Latin
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P",
  "С": "C", "Т": "T", "У": "Y", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S", "Ԁ": "D",
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p",
  "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d",
  "г": "r", "ѵ": "v", "ԛ": "q", "ա": "w", "ո": "n", "Ⅼ": "L",
  // Greek → Latin
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M",
  "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "ο": "o", "ι": "i",
  "ν": "v", "α": "a", "ρ": "p", "τ": "t", "υ": "u", "κ": "k", "ε": "e",
  // Misc lookalikes
  "ℓ": "l", "Ⅰ": "I", "ǀ": "l", "ı": "i", "ɑ": "a", "ɡ": "g", "ⅰ": "i",
};

const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");

export interface UnicodeNormalization {
  text: string;
  /** Number of invisible characters stripped. */
  invisibleRemoved: number;
  /** Number of confusable characters folded to Latin. */
  homoglyphsFolded: number;
  /** True when normalisation materially changed the text. */
  changed: boolean;
  /** Scripts observed, used to flag unexpected script mixing. */
  scripts: string[];
}

function detectScripts(text: string): string[] {
  const scripts = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0041 && c <= 0x024f) scripts.add("Latin");
    else if (c >= 0x0370 && c <= 0x03ff) scripts.add("Greek");
    else if (c >= 0x0400 && c <= 0x04ff) scripts.add("Cyrillic");
    else if (c >= 0x0590 && c <= 0x05ff) scripts.add("Hebrew");
    else if (c >= 0x0600 && c <= 0x06ff) scripts.add("Arabic");
    else if (c >= 0x4e00 && c <= 0x9fff) scripts.add("Han");
    else if (c >= 0x3040 && c <= 0x30ff) scripts.add("Kana");
  }
  return [...scripts];
}

export function normalizeUnicode(input: string): UnicodeNormalization {
  const scripts = detectScripts(input);

  const invisibleMatches = input.match(INVISIBLE);
  const invisibleRemoved = invisibleMatches?.length ?? 0;
  let text = input.replace(INVISIBLE, "");

  const homoglyphMatches = text.match(HOMOGLYPH_RE);
  const homoglyphsFolded = homoglyphMatches?.length ?? 0;
  text = text.replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] ?? c);

  // NFKC folds fullwidth, mathematical and other compatibility forms back to
  // their canonical equivalents.
  const compatibility = text.normalize("NFKC");
  const nfkcChanged = compatibility !== text;
  text = compatibility;

  return {
    text,
    invisibleRemoved,
    homoglyphsFolded,
    changed: invisibleRemoved > 0 || homoglyphsFolded > 0 || nfkcChanged,
    scripts,
  };
}

/**
 * Script mixing within a single word is a strong obfuscation signal. "раssword"
 * with a Cyrillic 'р' is not a typo anyone makes by accident.
 */
export function findMixedScriptWords(input: string): string[] {
  const suspicious: string[] = [];
  for (const word of input.split(/\s+/)) {
    if (word.length < 3) continue;
    const scripts = detectScripts(word);
    const alphabetic = scripts.filter((s) =>
      ["Latin", "Cyrillic", "Greek"].includes(s),
    );
    if (alphabetic.length > 1) suspicious.push(word);
  }
  return suspicious;
}
