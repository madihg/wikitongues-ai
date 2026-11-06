-- Reverses 20261105130000_speech_loop. Referencing tables first, then enums.
-- Destroys all training jobs, eval results, nightly runs, candidates, clip
-- checks, speaker profiles and the third-party register: run only where that
-- is intended. Storage objects and model volumes are NOT touched.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "SpeechCandidate";
DROP TABLE IF EXISTS "SpeechEvalResult";
DROP TABLE IF EXISTS "SpeechTrainJob";
DROP TABLE IF EXISTS "SpeechNightlyRun";
DROP TABLE IF EXISTS "SpeechLoopState";
DROP TABLE IF EXISTS "SpeechCheck";
DROP TABLE IF EXISTS "SpeakerProfile";
DROP TABLE IF EXISTS "ThirdPartyAudioSource";

DROP TYPE IF EXISTS "SpeechJobStatus";
DROP TYPE IF EXISTS "SpeechSystem";
