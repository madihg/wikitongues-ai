-- Speech studio and tone minimal pairs (PR H). Additive only: two nullable
-- columns on SpeechRecording (studioSessionId, studioText), one index, and two
-- new tables. No column or table is dropped or changed. NOT applied by any
-- agent: a human applies it to the wikitongues schema after review, after
-- 20261105140000_speech_transcript.
-- Generated with `prisma migrate diff` (datamodel to datamodel).
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeechRecording" ADD COLUMN     "studioSessionId" TEXT,
ADD COLUMN     "studioText" TEXT;

-- CreateTable
CREATE TABLE "SpeechMinimalPair" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "targetSpelling" TEXT NOT NULL,
    "foilSpelling" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechMinimalPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechMinimalPairAnswer" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "annotatorId" TEXT NOT NULL,
    "heard" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechMinimalPairAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeechMinimalPair_promptId_key" ON "SpeechMinimalPair"("promptId");

-- CreateIndex
CREATE INDEX "SpeechMinimalPair_createdById_idx" ON "SpeechMinimalPair"("createdById");

-- CreateIndex
CREATE INDEX "SpeechMinimalPairAnswer_recordingId_idx" ON "SpeechMinimalPairAnswer"("recordingId");

-- CreateIndex
CREATE INDEX "SpeechMinimalPairAnswer_annotatorId_idx" ON "SpeechMinimalPairAnswer"("annotatorId");

-- CreateIndex
CREATE INDEX "SpeechMinimalPairAnswer_isDemo_idx" ON "SpeechMinimalPairAnswer"("isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechMinimalPairAnswer_pairId_recordingId_annotatorId_key" ON "SpeechMinimalPairAnswer"("pairId", "recordingId", "annotatorId");

-- CreateIndex
CREATE INDEX "SpeechRecording_studioSessionId_idx" ON "SpeechRecording"("studioSessionId");

