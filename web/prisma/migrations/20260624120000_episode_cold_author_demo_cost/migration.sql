-- Wikitongues AI: cold-authoring episode + demo sessions + cost ledger.
-- All additive: new enum, new tables, nullable/defaulted columns. Safe on live data.
-- Applied to Supabase schema `wikitongues` via the management API; recorded here for the ledger.

DO $$ BEGIN
  CREATE TYPE wikitongues."CostCategory" AS ENUM ('finetune','eval_generation','judge','inference','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ModelOutput: demo flagging
ALTER TABLE wikitongues."ModelOutput" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE wikitongues."ModelOutput" ADD COLUMN IF NOT EXISTS "demoSessionId" TEXT;

-- PairwiseComparison: confidence + demo flagging (winner now also allows both_inadequate)
ALTER TABLE wikitongues."PairwiseComparison" ADD COLUMN IF NOT EXISTS "confidence" INTEGER;
ALTER TABLE wikitongues."PairwiseComparison" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE wikitongues."PairwiseComparison" ADD COLUMN IF NOT EXISTS "demoSessionId" TEXT;
CREATE INDEX IF NOT EXISTS "PairwiseComparison_isDemo_idx" ON wikitongues."PairwiseComparison"("isDemo");

-- RubricScore: confidence + demo flagging
ALTER TABLE wikitongues."RubricScore" ADD COLUMN IF NOT EXISTS "confidence" INTEGER;
ALTER TABLE wikitongues."RubricScore" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE wikitongues."RubricScore" ADD COLUMN IF NOT EXISTS "demoSessionId" TEXT;

-- OutputEdit: provenance + consent + demo flagging
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS "provenance" TEXT;
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS "consentBenchmark" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS "consentTraining" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS "demoSessionId" TEXT;
CREATE INDEX IF NOT EXISTS "OutputEdit_isDemo_idx" ON wikitongues."OutputEdit"("isDemo");

-- ColdAuthorAnswer: source-free gold authored before models are revealed
CREATE TABLE IF NOT EXISTS wikitongues."ColdAuthorAnswer" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "bucket" wikitongues."EvalBucket",
  "answerText" TEXT NOT NULL,
  "provenance" TEXT NOT NULL DEFAULT 'speaker_authored_sourcefree',
  "consentBenchmark" BOOLEAN NOT NULL DEFAULT true,
  "consentTraining" BOOLEAN NOT NULL DEFAULT true,
  "annotatorId" TEXT NOT NULL,
  "verificationStatus" wikitongues."VerificationStatus" NOT NULL DEFAULT 'single_annotator',
  "epochId" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "demoSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColdAuthorAnswer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ColdAuthorAnswer_promptId_idx" ON wikitongues."ColdAuthorAnswer"("promptId");
CREATE INDEX IF NOT EXISTS "ColdAuthorAnswer_annotatorId_idx" ON wikitongues."ColdAuthorAnswer"("annotatorId");
CREATE INDEX IF NOT EXISTS "ColdAuthorAnswer_isDemo_idx" ON wikitongues."ColdAuthorAnswer"("isDemo");
DO $$ BEGIN
  ALTER TABLE wikitongues."ColdAuthorAnswer" ADD CONSTRAINT "ColdAuthorAnswer_promptId_fkey"
    FOREIGN KEY ("promptId") REFERENCES wikitongues."Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE wikitongues."ColdAuthorAnswer" ADD CONSTRAINT "ColdAuthorAnswer_annotatorId_fkey"
    FOREIGN KEY ("annotatorId") REFERENCES wikitongues."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- PromptFlag: annotator culls malformed prompts
CREATE TABLE IF NOT EXISTS wikitongues."PromptFlag" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "annotatorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PromptFlag_promptId_idx" ON wikitongues."PromptFlag"("promptId");
DO $$ BEGIN
  ALTER TABLE wikitongues."PromptFlag" ADD CONSTRAINT "PromptFlag_promptId_fkey"
    FOREIGN KEY ("promptId") REFERENCES wikitongues."Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE wikitongues."PromptFlag" ADD CONSTRAINT "PromptFlag_annotatorId_fkey"
    FOREIGN KEY ("annotatorId") REFERENCES wikitongues."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DemoSession: a researcher-launched walkthrough
CREATE TABLE IF NOT EXISTS wikitongues."DemoSession" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CostEntry: holistic cost ledger
CREATE TABLE IF NOT EXISTS wikitongues."CostEntry" (
  "id" TEXT NOT NULL,
  "category" wikitongues."CostCategory" NOT NULL,
  "provider" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "estimated" BOOLEAN NOT NULL DEFAULT true,
  "refType" TEXT,
  "refId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CostEntry_category_idx" ON wikitongues."CostEntry"("category");
CREATE INDEX IF NOT EXISTS "CostEntry_refType_refId_idx" ON wikitongues."CostEntry"("refType","refId");
