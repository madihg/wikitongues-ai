-- Annotation pivot (2026-08-20, tasks/annotation-pivot-decision.md):
-- pairwise episodes are drawn ONLY from a pool of strong arms, and pool
-- membership is a DB flag on CandidateModel - never a hardcoded slug list in
-- routes or UI (house rule). Additive with a safe default: every existing
-- candidate starts outside the pool, so nothing changes until the flag is
-- explicitly set (scripts/train-queue-fill.ts `pool` step).
--
-- Applied to Supabase schema `wikitongues` directly and recorded here for the
-- migration ledger, following the pattern of
-- 20260807120000_failure_tags_and_dialect.

ALTER TABLE wikitongues."CandidateModel"
  ADD COLUMN IF NOT EXISTS "inPairingPool" BOOLEAN NOT NULL DEFAULT false;
