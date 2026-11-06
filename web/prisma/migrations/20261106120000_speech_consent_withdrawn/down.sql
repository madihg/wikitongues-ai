-- Reverses 20261106120000_speech_consent_withdrawn. Drops the flag only: the
-- withdrawal rows stay, but they then read as ordinary grants, so run this
-- only where no speaker has withdrawn.
SET search_path TO "wikitongues", "extensions", "public";

ALTER TABLE "ConsentGrant" DROP COLUMN IF EXISTS "withdrawn";
