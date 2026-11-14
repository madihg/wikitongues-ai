-- Reverses 20261113150000_tone_pass. Destroys every pass-2 tone copy, the
-- agreed texts, the assignments and the set itself. Pass 1 is not touched.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "TonePassAgreed";
DROP TABLE IF EXISTS "TonePass";
DROP TABLE IF EXISTS "TonePassAssignment";
DROP TABLE IF EXISTS "TonePassItem";
