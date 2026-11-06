-- Reverses 20261106130000_speech_studio. Destroys the studio session ids and
-- script lines stored on clips (the clips and their audio stay), and every
-- minimal pair and its answers.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechMinimalPairAnswer";
DROP TABLE IF EXISTS "SpeechMinimalPair";
DROP INDEX IF EXISTS "SpeechRecording_studioSessionId_idx";
ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "studioText";
ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "studioSessionId";
