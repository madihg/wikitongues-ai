import type { LeakAllowEntry } from "../src/lib/eval/leak-allow";

/**
 * THE REVIEWED ALLOW-LIST for scripts/leak-check-files.ts (2026-10-15).
 * Matching rules: src/lib/eval/leak-allow.ts. Halim's decision: allow-list
 * ONLY the langid seed lexicons and the one chikhapo filter entry; every
 * other collision in the repository is rewritten instead.
 *
 * Each word below is a real word of the language named, written as that
 * language writes it, and collides with a frozen Igala gold answer only once
 * diacritics are folded away. Changing any of them changes what the code
 * does: the seeds shape the language-ID profiles (and so every langid
 * verdict and gate), and the chikhapo entry is the line the parser must
 * recognise in order to drop it.
 *
 * This file repeats the words, so it does not pass the checker itself; it is
 * outside the src/ sweep and reviewed by hand. Every word here already
 * appears, exactly once, in the file its entry names. Add an entry only with
 * the same review: a word that must stay as written, its language, and its
 * meaning.
 */
const LANGID = "src/lib/eval/langid.ts";
const yoruba = (token: string, meaning: string): LeakAllowEntry => ({
  file: LANGID,
  token,
  count: 1,
  reason: `YORUBA_SEED: Yoruba "${meaning}", a seed word for the Yoruba profile`,
});
const igbo = (token: string, meaning: string): LeakAllowEntry => ({
  file: LANGID,
  token,
  count: 1,
  reason: `IGBO_SEED: Igbo "${meaning}", a seed word for the Igbo profile`,
});

export const LEAK_ALLOW: readonly LeakAllowEntry[] = [
  yoruba("ọjọ́", "day"),
  yoruba("omi", "water"),
  yoruba("ajá", "dog"),
  yoruba("ọ̀nà", "road"),
  yoruba("bàbá", "father"),
  yoruba("ọkọ", "husband"),
  yoruba("owó", "money"),
  yoruba("ọwọ́", "hand"),
  yoruba("ata", "pepper"),
  igbo("ọma", "good (as in good morning)"),
  igbo("ọnụ", "mouth"),
  igbo("ọdụ", "station (as in motor park)"),
  {
    file: LANGID,
    token: "una",
    count: 1,
    reason: 'PIDGIN_SEED: Nigerian Pidgin "you (plural)", a seed word for the Pidgin profile',
  },
  {
    file: "src/lib/lexicon-parse.ts",
    token: "ómi",
    count: 1,
    reason:
      "CHIKHAPO_BAD_LINES: the chikhapo headword whose line is glossed rain, which cross-source checking flagged as wrong; the parser must name it to drop it",
  },
];
