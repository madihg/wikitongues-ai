-- Reverses 20261106120100_speech_retrain_required. Drops the flag only.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeechCandidate" DROP COLUMN IF EXISTS "retrainRequired";
