-- Reverses 20261107130000_speech_check_level. Destroys every stored check
-- level and check note: run only where that is intended.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeechCheck" DROP COLUMN IF EXISTS "note", DROP COLUMN IF EXISTS "level";
