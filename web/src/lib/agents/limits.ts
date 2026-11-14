/**
 * The hard ceiling on what one tutor reply can cost.
 *
 * One learner message runs the translator at most twice and the reviewer at
 * most twice (orchestrator.ts: one revision pass). Each of those calls may
 * write at most this many tokens. The number is passed to the provider as
 * the output limit of every call, so a prompt cannot talk the model into a
 * longer answer. Both agents import it from here; a test fails if either
 * stops doing so.
 */
export const TUTOR_MAX_OUTPUT_TOKENS = 1024;
