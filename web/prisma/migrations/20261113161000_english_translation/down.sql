-- Reverses 20261113161000_english_translation. Destroys every short English
-- translation typed since, and the record of which words each English clip
-- read. The answers, their meanings and the clips themselves stay.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "spokenText";
ALTER TABLE "ColdAuthorAnswer" DROP COLUMN IF EXISTS "englishTranslation";
