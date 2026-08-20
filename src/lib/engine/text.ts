/**
 * Pluralise a count for analyst-facing prose.
 *
 * The engine's explanations are read by people, and "1 document(s) withheld"
 * is the unmistakable tell of machine-written text. Every count that reaches a
 * sentence goes through here.
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** "was" / "were" agreement for the same counts. */
export function verb(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
