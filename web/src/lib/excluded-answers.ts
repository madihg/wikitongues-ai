/**
 * Answers left out of training and benchmark reads (Halim, Nov 20 2026).
 *
 * Each of these was saved under one prompt while it held the speaker's
 * answer to the PREVIOUS prompt: the same speaker, the same text, saved a
 * minute or so after their answer to a different prompt. Paired with the
 * prompt they are filed under, they would teach and score the wrong thing.
 *
 * The rows stay in the database as the speakers wrote them, with their
 * consent untouched. Only the reads that build training data, retrieval
 * pools and benchmark gold skip them. Ids only: no answer text here.
 */
export const EXCLUDED_COLD_ANSWER_IDS: readonly string[] = [
  "cms54iu4o0007ju04cbkt3epq",
  "cmsfff9zf0005lg04nyzys8vi",
  "cmsffjyfq000flg04ieychrsk",
  "cmsffqpdw000hjs04hpt07ryq",
  "cmshedpln000li50447c1kfah",
  "cmt8ju5a40005kw04s9wi1b6n",
];

/** A Prisma where fragment for ColdAuthorAnswer reads that feed training or the benchmark. */
export const usableColdAnswer: { id: { notIn: string[] } } = {
  id: { notIn: [...EXCLUDED_COLD_ANSWER_IDS] },
};

export function isExcludedColdAnswer(id: string | null | undefined): boolean {
  return !!id && EXCLUDED_COLD_ANSWER_IDS.includes(id);
}
