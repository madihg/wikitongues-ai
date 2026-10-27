-- Reverses 20261019120000_speech_lab. Child tables first, then enums.
-- Destroys all speech rows and consent grants: run only on a database where
-- that is intended. Storage objects in the `igala-speech` bucket are NOT
-- touched by this file.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechComparison";
DROP TABLE IF EXISTS "SpeechRecording";
DROP TABLE IF EXISTS "ConsentGrant";
DROP TABLE IF EXISTS "Consent";

DROP TYPE IF EXISTS "DataTier";
DROP TYPE IF EXISTS "SourceType";
DROP TYPE IF EXISTS "RightsStatus";
DROP TYPE IF EXISTS "ConsentMethod";
