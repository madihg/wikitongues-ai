-- Speech measures, cleaning derivatives and assigned Listen rounds (Nov 13).
-- Four new tables, nothing altered: SpeechClipMeasure (what a tool measured on
-- one clip), SpeechAutoMeasure (one aggregate per system and ruler),
-- SpeechDerivative (the cleaned copies beside a raw clip, with their log) and
-- SpeechListenRound (a blind round assigned to one named rater). Additive only.
-- NOT applied by any agent. A human applies it (Supabase apply_migration; not
-- prisma migrate deploy on this database), then grants the four tables to the
-- app role as for the earlier speech tables. down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- CreateTable
CREATE TABLE "SpeechClipMeasure" (
    "id" TEXT NOT NULL,
    "clipKey" TEXT NOT NULL,
    "recordingId" TEXT,
    "promptId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "systemRef" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "rulerRef" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechClipMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechAutoMeasure" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "modelRef" TEXT NOT NULL,
    "rulerRef" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "nClips" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechAutoMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechDerivative" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rawKey" TEXT NOT NULL,
    "key24k" TEXT,
    "key16k" TEXT,
    "usedDenoised" BOOLEAN NOT NULL,
    "keptRawReason" TEXT,
    "log" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechDerivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechListenRound" (
    "id" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "humanRecordingId" TEXT NOT NULL,
    "candidateRecordingId" TEXT NOT NULL,
    "systemRef" TEXT NOT NULL,
    "candidateIsA" BOOLEAN NOT NULL,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "comparisonId" TEXT,
    "judgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechListenRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeechClipMeasure_recordingId_idx" ON "SpeechClipMeasure"("recordingId");

-- CreateIndex
CREATE INDEX "SpeechClipMeasure_promptId_idx" ON "SpeechClipMeasure"("promptId");

-- CreateIndex
CREATE INDEX "SpeechClipMeasure_systemRef_rulerRef_idx" ON "SpeechClipMeasure"("systemRef", "rulerRef");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechClipMeasure_clipKey_stage_rulerRef_key" ON "SpeechClipMeasure"("clipKey", "stage", "rulerRef");

-- CreateIndex
CREATE INDEX "SpeechAutoMeasure_kind_modelRef_idx" ON "SpeechAutoMeasure"("kind", "modelRef");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechAutoMeasure_kind_modelRef_rulerRef_manifestVersion_key" ON "SpeechAutoMeasure"("kind", "modelRef", "rulerRef", "manifestVersion");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechDerivative_recordingId_kind_version_key" ON "SpeechDerivative"("recordingId", "kind", "version");

-- CreateIndex
CREATE INDEX "SpeechListenRound_raterId_comparisonId_idx" ON "SpeechListenRound"("raterId", "comparisonId");

-- CreateIndex
CREATE INDEX "SpeechListenRound_candidateRecordingId_idx" ON "SpeechListenRound"("candidateRecordingId");

-- CreateIndex
CREATE INDEX "SpeechListenRound_batch_idx" ON "SpeechListenRound"("batch");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechListenRound_raterId_candidateRecordingId_isRepeat_key" ON "SpeechListenRound"("raterId", "candidateRecordingId", "isRepeat");

