-- Rubric refinements from the 2026-07-02 annotator call:
--   0 = completely wrong (scale becomes 0-5)
--   N/A = axis not relevant (NULL)
--   rubricVersion stamps every score so a rubric change never mixes data.
ALTER TABLE wikitongues."RubricScore" ALTER COLUMN "culturalAccuracy" DROP NOT NULL;
ALTER TABLE wikitongues."RubricScore" ALTER COLUMN "linguisticAuthenticity" DROP NOT NULL;
ALTER TABLE wikitongues."RubricScore" ALTER COLUMN "culturalNormAdherence" DROP NOT NULL;
ALTER TABLE wikitongues."RubricScore" ALTER COLUMN "factualCorrectness" DROP NOT NULL;
ALTER TABLE wikitongues."RubricScore" ADD COLUMN IF NOT EXISTS "rubricVersion" TEXT NOT NULL DEFAULT 'v1';
