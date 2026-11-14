-- The clip choice, asked once and remembered (story C1, 2026-11-13).
-- Additive only: three nullable columns on SpeakerProfile. No column or table
-- is dropped or changed, and no existing row is touched: every speaker starts
-- with no remembered choice. NOT applied by any agent: a human applies it to
-- the wikitongues schema after review, BEFORE the code that reads it deploys.
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeakerProfile" ADD COLUMN     "defaultTier" "DataTier",
ADD COLUMN     "defaultVoiceCloning" BOOLEAN,
ADD COLUMN     "tierChosenAt" TIMESTAMP(3);
