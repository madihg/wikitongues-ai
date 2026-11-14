-- Check level (PR K): a Check verdict of does_not_match says on what level it
-- does not match (word, sound, tone, missing_extra, other), and any verdict
-- may carry a short note. Two nullable columns on SpeechCheck; existing rows
-- keep NULL. Additive only: nothing is dropped or rewritten.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- (Supabase apply_migration) after 20261105130000_speech_loop. down.sql
-- reverses it.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeechCheck" ADD COLUMN "level" TEXT, ADD COLUMN "note" TEXT;
