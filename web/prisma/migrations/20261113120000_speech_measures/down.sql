-- Reverses 20261113120000_speech_measures. Drops the four new tables; nothing
-- else is touched.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechListenRound";
DROP TABLE IF EXISTS "SpeechDerivative";
DROP TABLE IF EXISTS "SpeechAutoMeasure";
DROP TABLE IF EXISTS "SpeechClipMeasure";
