/**
 * Pure text transforms for cleaning the Igala RAG corpus.
 *
 * These live in src/ rather than beside the script that applies them for two
 * reasons: the test runner only collects src/**, and a module that mutates a
 * production corpus on import is a hazard. Keeping the logic pure and the
 * database work in prisma/clean-rag-igala.ts means importing the transforms
 * can never touch the database.
 *
 * What they exist to remove, in material shown to native speakers as reference:
 *   - failed MediaWiki template expansion in Wiktionary-scraped glosses, one of
 *     which shipped a vulgar sentence into model prompts;
 *   - project meta-commentary and a living scholar's email address, which do
 *     not describe Igala and should never have been in reference text.
 *
 * A half-removal is worse than no removal: it leaves a confident-looking claim
 * about Igala with its object missing. The tests pin that specifically.
 */

/** Strip failed MediaWiki template expansion out of a scraped gloss line. */
export function stripTemplateResidue(text: string): string {
  return (
    text
      // `... |t=gather ... !}}` - an unexpanded template argument.
      .replace(/\s*\|[a-z]+=[^}\n]*\}\}/g, "")
      // Bare closing braces left after the opening tag was stripped upstream.
      .replace(/\s*\)?\}\}/g, "")
      // Empty parenthesised argument lists: `(, )`, `( , )`, `(,)`.
      .replace(/\s*\(\s*,\s*\)/g, "")
      // The clause the removed payload dangled from, including any leading
      // register parenthetical - otherwise the gloss ends on "a clipping of
      // the phrase" with no phrase after it.
      .replace(/;?\s*(\([^)]*\)\s*)?a clipping of the phrase\s*(?=$|\n)/gm, "")
      // Tidy the punctuation the removals leave behind.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+;/g, ";")
      .replace(/;\s*(?=$|\n)/gm, "")
      .replace(/,\s*(?=$|\n)/gm, "")
      .replace(/[ \t]+$/gm, "")
  );
}

/**
 * Remove asides addressed to us rather than describing Igala, plus contact
 * details. Reference material handed to a model should be about the language.
 */
export function stripProjectMeta(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let skippingBlock = false;
  for (const line of lines) {
    if (
      /^(THE ASK|Why this matters for evaluating|PRACTICAL CONSEQUENCE\b.*chrF)/i.test(
        line.trim(),
      )
    ) {
      skippingBlock = true;
      continue;
    }
    if (skippingBlock) {
      if (line.trim() === "") skippingBlock = false;
      continue;
    }
    if (
      /\bchrF\b|\bbenchmark\b|@gmail\.com|\bour (retrieval|corpus|annotators|model)\b|\bthis project\b/i.test(
        line,
      )
    ) {
      continue;
    }
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prepended to entries carrying ASJP-style phonemic transcription, which is not
 * Igala orthography. Without the key a model emits digits and tildes inside
 * words it presents as Igala.
 */
export const ASJP_KEY =
  "NOTATION KEY for this entry: some forms below use a phonemic transcription, not standard Igala orthography. " +
  "In it, the digit 5 stands for ny / ɲ (so `e5a` is enya), a tilde marks a digraph pronounced as one segment " +
  "(so `gb~o` is gbo), and ɛ ɔ ǯ correspond to Igala's ẹ ọ j. Do NOT reproduce digits or tildes inside an Igala " +
  "word - convert them, or prefer a form from another entry.\n\n";

/**
 * Prepended to attested-only lists. A model handed three numerals can otherwise
 * conclude the language lacks the rest.
 */
export const PARTIAL_LIST_NOTE =
  "INCOMPLETE LIST: this holds only the entries that happen to be attested in the source. Missing entries mean " +
  "the source lacks them, NOT that Igala lacks the word. Do not infer a gap in the language from a gap here.\n\n";
