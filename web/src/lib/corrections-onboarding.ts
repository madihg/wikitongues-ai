/**
 * First-run content for the Corrections lane (the editing ground's worked
 * example, tasks/editing-ground-spec.md section 7). CONTENT-AS-CONFIG, not
 * hardcoded strings scattered in JSX: when Agnes rewords the reason line on
 * the walkthrough call, it is a one-line edit here.
 *
 * Both examples are REAL rows from the live DB, credited:
 *   - Worked example: the OutputEdit on prompt ig_bank_auth_012
 *     (row cmt84awt1002jjm04am3xtsru, Charity Ogali, 2026-08-25).
 *   - Practice round: the pair from prompt ig_bank_auth_001
 *     (row cmt838ayt0009jm04im3dg4pn, Charity Ogali, 2026-08-25 - the real
 *     fix was chẹnyọ -> d'ẹnyọ). The practice is local-only render: nothing
 *     submits, so no demo-session isolation is needed.
 */

/** localStorage guard: absent -> show the intro cards + practice round. */
export const CORRECTIONS_ONBOARDED_KEY = "wt-corrections-onboarded";

export const ONBOARDING_EXAMPLE = {
  promptText:
    "Write how an Igala speaker would naturally say 'thank God' on hearing good news.",
  aiAnswer: "Àgbá Ọ́jọ́",
  correction: "Agba ọjọ",
  reasonTag: "tone_marks",
  // Do NOT invent the linguistic rationale - this placeholder ships as-is and
  // is replaced with Agnes's own words after the walkthrough call.
  reasonText:
    "[REVIEW WITH AGNES on the walkthrough call - one sentence in her words on why the marks come off, e.g. how the team writes it in practice]",
  credit: "A real correction by Charity Ogali, 2026-08-25.",
} as const;

export const PRACTICE_EXAMPLE = {
  promptText:
    "Write a short, natural Igala blessing as a community member would actually say it, not translated from English.",
  aiAnswer: "Ọjọ ki chẹnyọ ñwu wẹ",
} as const;
