-- Repair round provenance (2026-09-03, tasks/project-audit-2026-09-01.md,
-- finding 5/10): the repair round's discarded first-pass text and violations
-- are kept on ModelOutput instead of being thrown away, so the repair round
-- can be evaluated as a post-processor rather than credited silently to the
-- served answer. Additive and nullable/defaulted so prod may lag the client
-- safely.
--
-- Applied to Supabase schema `wikitongues` directly and recorded here for the
-- migration ledger, following the pattern of
-- 20260826120000_output_edit_segments.

ALTER TABLE wikitongues."ModelOutput"
  ADD COLUMN IF NOT EXISTS "repairFirstPassText" TEXT,
  ADD COLUMN IF NOT EXISTS "repaired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "repairViolations" JSONB;
