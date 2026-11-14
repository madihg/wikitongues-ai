-- Reverses 20261107120000_speech_nightly. Drops the two new tables and the
-- three new columns; nothing else is touched.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechAudit";
DROP TABLE IF EXISTS "SpeechAlert";
ALTER TABLE "SpeechTrainJob" DROP COLUMN IF EXISTS "manifestLines";
ALTER TABLE "SpeechTrainJob" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "SpeechTrainJob" DROP COLUMN IF EXISTS "externalId";
