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
