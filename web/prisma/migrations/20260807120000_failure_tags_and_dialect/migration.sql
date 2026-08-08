-- Annotation-quality pass (Lydia's review), three features in ONE migration.
-- All columns are additive with safe defaults, so this is a no-op for every row
-- already collected and cannot break a live annotator mid-episode.
--
--   PairwiseComparison.failureTagsA / failureTagsB
--     Per-output failure diagnostics as Postgres text arrays. 690 of the first
--     694 comparisons ended "both inadequate", and the rubric only scores a
--     WINNING output - so we had 9 rubric rows and essentially no structured
--     data on WHY models fail. These capture the failure shape in a few taps,
--     without the ~3x episode-time cost of a full 8-axis rubric per output.
--     Tag keys are CONFIG (src/lib/failure-tags.ts), never a Postgres enum, so
--     the tag set changes with a code edit and no further migration.
--
--   ColdAuthorAnswer.dialect
--     Which Igala variety the gold answer is written in. No dialect was captured
--     anywhere, though annotators were already typing it by hand. Free text, not
--     an enum: the option list is PROVISIONAL pending the linguistics and
--     community leads.
--
-- Applied to Supabase schema `wikitongues` via the management API and recorded
-- here for the migration ledger, following the pattern of
-- 20260715120000_cold_author_english_gloss_instruction_ig.

ALTER TABLE wikitongues."PairwiseComparison"
  ADD COLUMN IF NOT EXISTS "failureTagsA" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE wikitongues."PairwiseComparison"
  ADD COLUMN IF NOT EXISTS "failureTagsB" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE wikitongues."ColdAuthorAnswer"
  ADD COLUMN IF NOT EXISTS "dialect" TEXT;
