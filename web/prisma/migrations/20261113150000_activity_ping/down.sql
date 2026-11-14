-- Reverses 20261113150000_activity_ping. Destroys every measured active
-- second: run only where that is intended. The hours views then fall back to
-- the estimate for every week.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "ActivityPing";
