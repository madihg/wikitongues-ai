-- Reverses 20261113141000_answer_revision. Destroys the edit log (every
-- stored before and after). The answers themselves are not touched: they
-- keep their latest text.
SET search_path TO "wikitongues", "extensions", "public";

DROP TABLE IF EXISTS "AnswerRevision";
