/**
 * REVIEWED ALLOW-LIST LOGIC FOR THE PUBLIC-FILE LEAK CHECK
 * (scripts/leak-check-files.ts). Written 2026-10-15.
 *
 * A few words in shipped code collide with a frozen gold answer only after
 * diacritic folding, and must stay as written because code depends on them:
 * the Yoruba, Igbo and Pidgin seed lexicons in eval/langid.ts, and the one
 * chikhapo line lexicon-parse.ts must name in order to drop it. Everything
 * else that collides is changed, not allowed.
 *
 * An entry is keyed by file and EXACT token, and states how many times the
 * token appears in that file. Exactly that many occurrences are masked; any
 * other count fails the check, so a stale entry is noticed and a new use of
 * the same word in the same file cannot hide behind an old one. A different
 * spelling of the same word is a different token and is never masked.
 *
 * The data (with the tokens) lives in scripts/leak-check-allow.ts, outside the
 * src/ sweep. This module holds only the matching rules, so it carries no
 * Igala at all.
 */

export interface LeakAllowEntry {
  /** Path relative to web/, with forward slashes. */
  file: string;
  /** The token exactly as written in the file (compared after NFC). */
  token: string;
  /** How many times the token appears in the file; exactly this many pass. */
  count: number;
  /** What the word is, and why changing it would change behaviour. */
  reason: string;
}

/** A word, as the checker's line finder tokenises: letters, marks, digits. */
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Backslash escapes in source text glue the next word onto a letter: in a
 * string literal, a newline escape followed by a word tokenises as one word
 * starting with "n", so the word inside was invisible to the check. Each
 * escape becomes two spaces, which keeps every offset and line number.
 */
export function neutraliseEscapes(src: string): string {
  return src.replace(/\\[ntr]/g, "  ");
}

export interface LeakAllowResult {
  /** The text with the allowed occurrences masked. Same length as the input. */
  text: string;
  /** One line per entry whose count does not match the file. */
  problems: string[];
}

/**
 * Mask the allowed occurrences in one file's text. Each is replaced by a run
 * of "x" of the same length: x is outside the Igala alphabet, so the mask can
 * neither match a protected string nor join its neighbours into one (spaces
 * could), and offsets stay put for line reporting.
 */
export function applyLeakAllowList(
  file: string,
  text: string,
  entries: readonly LeakAllowEntry[],
): LeakAllowResult {
  const words = [...text.matchAll(WORD)];
  const problems: string[] = [];
  let out = text;
  entries.forEach((e, i) => {
    if (e.file !== file) return;
    const want = e.token.normalize("NFC");
    const spans = words.filter((m) => m[0].normalize("NFC") === want);
    if (spans.length !== e.count) {
      problems.push(
        `allow-list entry ${i + 1} (${file}): expects ${e.count} occurrence(s), found ${spans.length}`,
      );
      return;
    }
    for (const m of spans) {
      const at = m.index!;
      out = out.slice(0, at) + "x".repeat(m[0].length) + out.slice(at + m[0].length);
    }
  });
  return { text: out, problems };
}
