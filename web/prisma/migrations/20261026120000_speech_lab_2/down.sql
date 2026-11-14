-- Reverses 20261026120000_speech_lab_2. Destroys the stored audio bytes, the
-- quality metrics, the language of every clip and the speech axes on every
-- judgment: run only on a database where that is intended.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeechComparison" DROP COLUMN IF EXISTS "axes";

ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "quality";
ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "language";
ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "bytes";
