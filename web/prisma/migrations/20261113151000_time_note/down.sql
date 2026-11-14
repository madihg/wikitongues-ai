-- Reverses 20261113151000_time_note. Destroys every note an annotator left
-- on a week: run only where that is intended.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "TimeNote";
