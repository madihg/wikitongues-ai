-- Rubric v2 (Lydia's revised rubric): axis-keyed scores so the axis set is
-- config, not schema. 0-5 scale (0 = completely wrong), NULL = N/A.
CREATE TABLE IF NOT EXISTS wikitongues."RubricAxisScore" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "modelOutputId" TEXT NOT NULL,
  "bucket" wikitongues."EvalBucket",
  "axis" TEXT NOT NULL,
  "score" INTEGER,
  "note" TEXT,
  "rubricVersion" TEXT NOT NULL DEFAULT 'v2',
  "annotatorId" TEXT NOT NULL,
  "epochId" TEXT,
  "evalRunId" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "demoSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RubricAxisScore_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RubricAxisScore_modelOutputId_idx" ON wikitongues."RubricAxisScore"("modelOutputId");
CREATE INDEX IF NOT EXISTS "RubricAxisScore_axis_idx" ON wikitongues."RubricAxisScore"("axis");
CREATE INDEX IF NOT EXISTS "RubricAxisScore_isDemo_idx" ON wikitongues."RubricAxisScore"("isDemo");
DO $$ BEGIN
  ALTER TABLE wikitongues."RubricAxisScore" ADD CONSTRAINT "RubricAxisScore_modelOutputId_fkey"
    FOREIGN KEY ("modelOutputId") REFERENCES wikitongues."ModelOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE wikitongues."RubricAxisScore" ADD CONSTRAINT "RubricAxisScore_annotatorId_fkey"
    FOREIGN KEY ("annotatorId") REFERENCES wikitongues."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
