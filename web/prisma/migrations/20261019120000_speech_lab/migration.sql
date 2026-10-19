-- Speech Lab, first slice (tasks/speech/lab-design-2026-10-19.md): consent
-- text and grants, speech recordings, blind clip comparisons. Additive only.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- (Supabase apply_migration, or `prisma migrate deploy`) after review, and
-- creates the private Storage bucket `igala-speech` separately. down.sql
-- reverses it. Generated with `prisma migrate diff` from the previous
-- schema.prisma to this one (the datamodel-to-datamodel form: the
-- datasource form also proposed unrelated drift fixes, including dropping
-- ParallelPair.englishTsv, which must never ship).
SET search_path TO "wikitongues", "extensions", "public";

-- CreateEnum
CREATE TYPE "DataTier" AS ENUM ('open', 'licensed', 'community_only');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('contributor', 'third_party', 'derived');

-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('cleared', 'pending', 'restricted');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('written', 'oral');

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "method" "ConsentMethod" NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commercialLicensing" BOOLEAN NOT NULL DEFAULT false,
    "crossBorder" BOOLEAN NOT NULL DEFAULT false,
    "voiceCloning" BOOLEAN NOT NULL DEFAULT false,
    "speakerId" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechRecording" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "coldAuthorAnswerId" TEXT,
    "modelOutputId" TEXT,
    "annotatorId" TEXT,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "sampleRate" INTEGER NOT NULL,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "dialect" TEXT,
    "tier" "DataTier" NOT NULL DEFAULT 'community_only',
    "consentId" TEXT,
    "consentVersion" TEXT,
    "consentMethod" "ConsentMethod",
    "voiceCloningOptIn" BOOLEAN NOT NULL DEFAULT false,
    "speakerIdOptIn" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "SourceType" NOT NULL DEFAULT 'contributor',
    "sourceRef" TEXT,
    "sourceLicense" TEXT,
    "rightsStatus" "RightsStatus" NOT NULL DEFAULT 'pending',
    "fundingSource" TEXT NOT NULL DEFAULT 'unknown',
    "isTestSet" BOOLEAN NOT NULL DEFAULT false,
    "publishedOpenAt" TIMESTAMP(3),
    "reviewStatus" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechComparison" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "recordingAId" TEXT NOT NULL,
    "recordingBId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "reasonTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "annotatorId" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consent_version_language_method_textHash_key" ON "Consent"("version", "language", "method", "textHash");

-- CreateIndex
CREATE INDEX "ConsentGrant_userId_grantedAt_idx" ON "ConsentGrant"("userId", "grantedAt");

-- CreateIndex
CREATE INDEX "SpeechRecording_promptId_idx" ON "SpeechRecording"("promptId");

-- CreateIndex
CREATE INDEX "SpeechRecording_annotatorId_idx" ON "SpeechRecording"("annotatorId");

-- CreateIndex
CREATE INDEX "SpeechRecording_isDemo_idx" ON "SpeechRecording"("isDemo");

-- CreateIndex
CREATE INDEX "SpeechRecording_tier_idx" ON "SpeechRecording"("tier");

-- CreateIndex
CREATE INDEX "SpeechComparison_promptId_idx" ON "SpeechComparison"("promptId");

-- CreateIndex
CREATE INDEX "SpeechComparison_annotatorId_idx" ON "SpeechComparison"("annotatorId");

-- CreateIndex
CREATE INDEX "SpeechComparison_isDemo_idx" ON "SpeechComparison"("isDemo");

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechRecording" ADD CONSTRAINT "SpeechRecording_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechRecording" ADD CONSTRAINT "SpeechRecording_coldAuthorAnswerId_fkey" FOREIGN KEY ("coldAuthorAnswerId") REFERENCES "ColdAuthorAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechRecording" ADD CONSTRAINT "SpeechRecording_modelOutputId_fkey" FOREIGN KEY ("modelOutputId") REFERENCES "ModelOutput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechRecording" ADD CONSTRAINT "SpeechRecording_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechRecording" ADD CONSTRAINT "SpeechRecording_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechComparison" ADD CONSTRAINT "SpeechComparison_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechComparison" ADD CONSTRAINT "SpeechComparison_recordingAId_fkey" FOREIGN KEY ("recordingAId") REFERENCES "SpeechRecording"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechComparison" ADD CONSTRAINT "SpeechComparison_recordingBId_fkey" FOREIGN KEY ("recordingBId") REFERENCES "SpeechRecording"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechComparison" ADD CONSTRAINT "SpeechComparison_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

