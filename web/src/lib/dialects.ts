/**
 * IGALA DIALECT - captured on the gold answer so a training row knows which
 * variety it teaches.
 *
 * Why: no dialect is recorded anywhere today, yet annotators clearly need the
 * distinction - one typed it into a free-text box by hand
 * ("General: Ọl'odudu / Ibaji: W'ọlodudu"). Without it, divergent spellings of
 * the same word look like errors rather than varieties.
 *
 * PROVISIONAL LIST - NOT AN AUTHORITATIVE TAXONOMY.
 * These options are a working starting point drawn from commonly named Igala
 * areas. They are awaiting confirmation from the linguistics lead (Lydia) and
 * the community lead (Agnes) before we present them as a real dialect
 * classification anywhere public. Expect names, groupings, and the
 * general/standard label to change. Nothing downstream should treat these keys
 * as a settled linguistic claim; they are stored as free text (no enum, no
 * migration) precisely so the list can be revised in one edit.
 */

export interface DialectOption {
  key: string;
  label: string;
}

export const IGALA_DIALECTS: DialectOption[] = [
  { key: "not_sure", label: "Not sure" },
  { key: "general_idah", label: "General / Idah" },
  { key: "ibaji", label: "Ibaji" },
  { key: "ankpa", label: "Ankpa" },
  { key: "dekina", label: "Dekina" },
  { key: "bassa", label: "Bassa" },
  { key: "ogugu", label: "Ogugu" },
  { key: "other", label: "Other" },
];

export const DIALECT_KEYS: string[] = IGALA_DIALECTS.map((d) => d.key);

const DIALECT_BY_KEY: Record<string, DialectOption> = Object.fromEntries(
  IGALA_DIALECTS.map((d) => [d.key, d]),
);

/** localStorage key: the annotator's dialect is remembered across episodes so
 *  nobody re-picks the same answer on every single prompt. */
export const DIALECT_STORAGE_KEY = "wt-annotator-dialect";

export function isDialect(value: unknown): boolean {
  return typeof value === "string" && DIALECT_KEYS.includes(value);
}

export function dialectLabel(key: string | null | undefined): string {
  if (!key) return "Not recorded";
  return DIALECT_BY_KEY[key]?.label ?? key;
}

/** Unknown / absent values become null rather than an error - a stale or
 *  hand-edited dialect must never fail an annotator's submission. */
export function sanitizeDialect(raw: unknown): string | null {
  return isDialect(raw) ? (raw as string) : null;
}
