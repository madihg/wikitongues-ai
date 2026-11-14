/**
 * Lab feature flags. The Speech Lab is researcher-only and ships dark: the
 * flag is a server env var, read per call (not at import) so a test or an
 * env change takes effect without a module reload. Off means the nav link is
 * absent, /lab/* pages notFound, and /api/lab/* routes answer 404. Design:
 * tasks/speech/lab-design-2026-10-19.md.
 */

/** True only when SPEECH_LAB_ENABLED is exactly "1". Anything else is off. */
export function speechLabEnabled(): boolean {
  return process.env.SPEECH_LAB_ENABLED === "1";
}

/**
 * Who may use the lab when it is on: RESEARCHER accounts only. Annotators and
 * learners never, even with the flag on. The owner (Halim) holds a RESEARCHER
 * role in the database, so no email special case is needed here.
 */
export function canUseLab(role?: string | null): boolean {
  return role === "RESEARCHER";
}

/**
 * True only when SPEECH_LAYER_ANNOTATORS is exactly "1". Read per call. It
 * means nothing without the lab flag: it only widens who may use the speaker
 * side of the lab (recording, checking, listening) to annotators.
 */
export function speechLayerAnnotatorsEnabled(): boolean {
  return process.env.SPEECH_LAYER_ANNOTATORS === "1";
}

/**
 * Who may use the speaker side of the lab: a researcher when the lab is on,
 * an annotator only when the lab AND the annotator layer are both on. Learners
 * never. Researcher-only surfaces (recordings, export, freeze, jobs,
 * candidates, loop, ledger, dashboard) keep canUseLab.
 */
export function canUseSpeech(
  role: string | null | undefined,
  flags: { lab: boolean; layer: boolean },
): boolean {
  if (!flags.lab) return false;
  if (role === "RESEARCHER") return true;
  return role === "ANNOTATOR" && flags.layer;
}

/**
 * Roles that may ask the server whether the speech layer is on. Anyone else
 * (a learner, nobody) never makes the request.
 */
export function canProbeSpeech(role: string | null | undefined): boolean {
  return role === "RESEARCHER" || role === "ANNOTATOR";
}
