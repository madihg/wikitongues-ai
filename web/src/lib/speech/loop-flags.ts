/**
 * The kill switch for the nightly speech loop. Off by default and read per
 * call, never at import (same pattern as src/lib/lab-flags.ts), so changing
 * the env var takes effect without a module reload. Off means
 * POST /api/speech/nightly answers 404 and nothing launches. The persisted
 * pause row (SpeechLoopState.paused) is the second, finer switch.
 */

/** True only when SPEECH_LOOP_ENABLED is exactly "1". Anything else is off. */
export function speechLoopEnabled(): boolean {
  return process.env.SPEECH_LOOP_ENABLED === "1";
}
