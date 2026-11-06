-- Speech loop (PR C): training jobs, eval results, the nightly run log,
-- candidate models, the loop pause switch, clip checks, speaker profiles and
-- the third-party audio register. Additive only: no existing table is altered.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- (Supabase apply_migration) after review. down.sql reverses it.
-- Generated with `prisma migrate diff` (datamodel to datamodel); the one
-- hand-written statement is the seed of the SpeechLoopState singleton row.
SET search_path TO "wikitongues", "extensions", "public";

-- CreateEnum
CREATE TYPE "SpeechSystem" AS ENUM ('asr', 'tts');

-- CreateEnum
CREATE TYPE "SpeechJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "SpeechTrainJob" (
    "id" TEXT NOT NULL,
    "system" "SpeechSystem" NOT NULL,
    "provider" TEXT NOT NULL,
    "baseModel" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "hyperparameters" JSONB,
    "status" "SpeechJobStatus" NOT NULL DEFAULT 'queued',
    "costUsd" DOUBLE PRECISION,
    "gpuSeconds" INTEGER,
    "outputRef" TEXT,
    "error" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechTrainJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechEvalResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "modelRef" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "cer" DOUBLE PRECISION NOT NULL,
    "werStripped" DOUBLE PRECISION NOT NULL,
    "werRetained" DOUBLE PRECISION NOT NULL,
    "ter" DOUBLE PRECISION NOT NULL,
    "perSpeaker" JSONB NOT NULL,
    "perDialect" JSONB NOT NULL,
    "nClips" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechEvalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechNightlyRun" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "outcome" TEXT NOT NULL,
    "stepLog" JSONB NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SpeechNightlyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechCandidate" (
    "id" TEXT NOT NULL,
    "system" "SpeechSystem" NOT NULL,
    "modelRef" TEXT NOT NULL,
    "jobId" TEXT,
    "evalResultId" TEXT,
    "regressed" BOOLEAN NOT NULL DEFAULT false,
    "promotedAt" TIMESTAMP(3),
    "promotedById" TEXT,
    "promoteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechLoopState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedById" TEXT,
    "pausedAt" TIMESTAMP(3),
    "lastAsrRunAt" TIMESTAMP(3),
    "lastTtsRunAt" TIMESTAMP(3),
    "monthlyCapUsd" DOUBLE PRECISION NOT NULL DEFAULT 200,

    CONSTRAINT "SpeechLoopState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechCheck" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "wrongWordIndex" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerProfile" (
    "userId" TEXT NOT NULL,
    "dialect" TEXT,
    "ageBand" TEXT,
    "gender" TEXT,
    "mayShareDemographics" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ThirdPartyAudioSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "licenseText" TEXT NOT NULL,
    "rightsStatus" "RightsStatus" NOT NULL DEFAULT 'pending',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ThirdPartyAudioSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeechTrainJob_system_status_idx" ON "SpeechTrainJob"("system", "status");

-- CreateIndex
CREATE INDEX "SpeechTrainJob_manifestVersion_idx" ON "SpeechTrainJob"("manifestVersion");

-- CreateIndex
CREATE INDEX "SpeechTrainJob_createdById_idx" ON "SpeechTrainJob"("createdById");

-- CreateIndex
CREATE INDEX "SpeechEvalResult_jobId_idx" ON "SpeechEvalResult"("jobId");

-- CreateIndex
CREATE INDEX "SpeechEvalResult_modelRef_idx" ON "SpeechEvalResult"("modelRef");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechNightlyRun_runDate_key" ON "SpeechNightlyRun"("runDate");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechCandidate_modelRef_key" ON "SpeechCandidate"("modelRef");

-- CreateIndex
CREATE INDEX "SpeechCandidate_jobId_idx" ON "SpeechCandidate"("jobId");

-- CreateIndex
CREATE INDEX "SpeechCandidate_evalResultId_idx" ON "SpeechCandidate"("evalResultId");

-- CreateIndex
CREATE INDEX "SpeechCandidate_system_idx" ON "SpeechCandidate"("system");

-- CreateIndex
CREATE INDEX "SpeechCandidate_promotedById_idx" ON "SpeechCandidate"("promotedById");

-- CreateIndex
CREATE INDEX "SpeechCheck_reviewerId_idx" ON "SpeechCheck"("reviewerId");

-- CreateIndex
CREATE INDEX "SpeechCheck_isDemo_idx" ON "SpeechCheck"("isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechCheck_recordingId_reviewerId_key" ON "SpeechCheck"("recordingId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerProfile_userId_key" ON "SpeakerProfile"("userId");

-- CreateIndex
CREATE INDEX "ThirdPartyAudioSource_rightsStatus_idx" ON "ThirdPartyAudioSource"("rightsStatus");

-- CreateIndex
CREATE INDEX "ThirdPartyAudioSource_confirmedById_idx" ON "ThirdPartyAudioSource"("confirmedById");

-- AddForeignKey
ALTER TABLE "SpeechEvalResult" ADD CONSTRAINT "SpeechEvalResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SpeechTrainJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechCandidate" ADD CONSTRAINT "SpeechCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SpeechTrainJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechCandidate" ADD CONSTRAINT "SpeechCandidate_evalResultId_fkey" FOREIGN KEY ("evalResultId") REFERENCES "SpeechEvalResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed the singleton (id 1): the loop starts unpaused with a USD 200 monthly cap.
INSERT INTO "SpeechLoopState" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
