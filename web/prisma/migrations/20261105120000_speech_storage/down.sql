-- Reverses 20261105120000_speech_storage. Drops only the object key; the
-- bytes column and the bucket objects are NOT touched, so reads fall back to
-- the Postgres bytes once this runs.
SET search_path TO "wikitongues", "extensions", "public";

DROP INDEX IF EXISTS "SpeechRecording_storageKey_idx";
ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "storageKey";
