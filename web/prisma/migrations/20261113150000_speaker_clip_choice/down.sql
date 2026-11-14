-- Reverses 20261113150000_speaker_clip_choice. Destroys every speaker's
-- remembered clip choice (they are asked again). Recordings keep their own
-- tier and are not touched.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "SpeakerProfile" DROP COLUMN IF EXISTS "tierChosenAt";
ALTER TABLE "SpeakerProfile" DROP COLUMN IF EXISTS "defaultVoiceCloning";
ALTER TABLE "SpeakerProfile" DROP COLUMN IF EXISTS "defaultTier";
