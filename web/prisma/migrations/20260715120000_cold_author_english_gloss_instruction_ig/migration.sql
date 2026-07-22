-- Wikitongues AI: two-box gold answer (Lydia's design) + in-language instruction.
-- Additive nullable columns on ColdAuthorAnswer, safe on live data:
--   englishGloss  — plain-English "what it means / why" for the Igala answer
--                   (training metadata only, never merged into the answer text).
--   instructionIg — the prompt/instruction itself rewritten in Igala, so one
--                   episode can mint two training rows (English-instruction and
--                   Igala-instruction, both -> the Igala answer).
-- Applied to Supabase schema `wikitongues` via the direct connection; recorded
-- here for the migration ledger.

ALTER TABLE wikitongues."ColdAuthorAnswer" ADD COLUMN IF NOT EXISTS "englishGloss" TEXT;
ALTER TABLE wikitongues."ColdAuthorAnswer" ADD COLUMN IF NOT EXISTS "instructionIg" TEXT;
