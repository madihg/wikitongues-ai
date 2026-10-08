/**
 * R8.3: does the question itself ask about tone? The one predicate the v4
 * family's serving paths share: the repair round's tone allowance
 * (buildV4FamilyTurn), the v4.5 dictionary block (tone marks stripped unless
 * asked) and the v4.5 tone row (served only when asked). Word-bounded, on
 * the RAW question text, so "monotone" is not a request.
 */
export function asksForTone(text: string): boolean {
  return /\btone/i.test(text);
}

/**
 * Tone accents only: grave, acute, circumflex, double acute, caron. The
 * tilde of ñ (U+0303) and the dot below of ẹ and ọ (U+0323) are letters in
 * Igala orthography, not tone, and survive. (eval/normalize.ts stripTones is
 * not usable here: it also removes the tilde, turning ñ into n.)
 */
const TONE_ACCENTS = /[̀́̂̋̌]/g;

/** Remove tone accents from Igala text, keeping every letter. */
export function stripToneAccents(text: string): string {
  return text.normalize("NFD").replace(TONE_ACCENTS, "").normalize("NFC");
}
