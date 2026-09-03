/**
 * Tone-mark stripping for the audit's finding 5 / option (d2) work
 * (tasks/project-audit-2026-09-01.md): "is there any effect once tone density
 * is factored out?"
 *
 * This is deliberately NARROWER than stripTones() in normalize.ts, which also
 * removes tilde (U+0303), breve (U+0306) and hook-above (U+0309). Those three
 * are not tone marks in the Igala orthography this project uses: tilde is the
 * SEGMENTAL marker that makes ñ a distinct letter (not a base "n" carrying an
 * accent), and dot-below (U+0323) makes ẹ/ọ distinct letters from e/o. Folding
 * those away would turn "the model wrote fewer tone marks" into "the model
 * wrote different words", which is exactly the confusion finding 5 exists to
 * remove. stripToneMarks touches ONLY the five marks that are unambiguously
 * tone in this orthography: grave (U+0300), acute (U+0301), circumflex
 * (U+0302), macron (U+0304) and caron (U+030C, the c-hacek failure family from
 * the repair round). Every base letter, ñ, ẹ and ọ survive untouched.
 */

/** Grave, acute, circumflex, macron, caron. Tone ONLY - see module doc. */
const TONE_MARKS_ONLY = /[̀́̂̄̌]/g;

/**
 * Remove tone diacritics and nothing else. NFD to expose combining marks
 * (precomposed and decomposed input must fold identically), strip the five
 * tone marks, NFC back to the project's canonical stored form.
 *
 * Idempotent: a string with no tone marks (or one already stripped) round-trips
 * unchanged. Pure and dependency-free so it is safe to run over stored
 * ModelOutput text without touching the database.
 */
export function stripToneMarks(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(TONE_MARKS_ONLY, "")
    .normalize("NFC");
}
