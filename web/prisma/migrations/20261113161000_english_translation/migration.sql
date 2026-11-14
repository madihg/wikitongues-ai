-- The short English translation (story C2, 2026-11-13). Additive only: one
-- nullable column on ColdAuthorAnswer (the translation, typed once and read
-- aloud for the English clip) and one nullable column on SpeechRecording (the
-- exact words an English clip read). No column or table is dropped or
-- changed, and no existing row is touched. NOT applied by any agent: a human
-- applies it to the wikitongues schema after review, BEFORE the code that
-- reads it deploys (Prisma selects every column of a model by default, so
-- code that knows these columns fails on a database that lacks them).
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "ColdAuthorAnswer" ADD COLUMN     "englishTranslation" TEXT;

-- AlterTable
ALTER TABLE "SpeechRecording" ADD COLUMN     "spokenText" TEXT;
