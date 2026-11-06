-- Reverses 20261105140000_speech_transcript. Destroys every stored transcript;
-- the clips themselves are not touched.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechTranscript";
