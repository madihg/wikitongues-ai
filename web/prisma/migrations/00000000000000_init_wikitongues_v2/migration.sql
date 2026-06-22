-- Wikitongues AI v2 schema, applied into the wikitongues schema
CREATE SCHEMA IF NOT EXISTS "wikitongues";
SET search_path TO "wikitongues", "extensions", "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LEARNER', 'ANNOTATOR', 'RESEARCHER');

-- CreateEnum
CREATE TYPE "ExpertiseLevel" AS ENUM ('native', 'heritage', 'fluent', 'conversational');

-- CreateEnum
CREATE TYPE "EvalBucket" AS ENUM ('orthography', 'grammar_tone', 'lexicon_disambig', 'dialectal_fidelity', 'register_honorifics', 'idioms_metaphor', 'cultural_values', 'authenticity');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('basic', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "PromptSplit" AS ENUM ('train', 'dev', 'test');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('pending', 'in_review', 'approved', 'corrected', 'rejected');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('seed', 'single_annotator', 'multi_annotator_verified', 'expert_reviewed');

-- CreateEnum
CREATE TYPE "CandidateKind" AS ENUM ('baseline', 'rag', 'sft', 'dpo', 'continued_pretrain', 'composite');

-- CreateEnum
CREATE TYPE "FineTuneMethod" AS ENUM ('sft', 'dpo', 'continued_pretrain');

-- CreateEnum
CREATE TYPE "FineTuneStatus" AS ENUM ('draft', 'building_dataset', 'uploading', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'registered');

-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('draft', 'generating', 'awaiting_human', 'judging', 'aggregating', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "EvalTrigger" AS ENUM ('manual', 'post_finetune', 'scheduled', 'epoch_rollover');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANNOTATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotatorLanguage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "expertiseLevel" "ExpertiseLevel" NOT NULL,

    CONSTRAINT "AnnotatorLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "bucket" "EvalBucket" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "text" TEXT NOT NULL,
    "sourceLanguage" TEXT,
    "targetCulture" TEXT,
    "expectedCulturalContext" TEXT,
    "difficultyLevel" "DifficultyLevel" NOT NULL DEFAULT 'intermediate',
    "split" "PromptSplit" NOT NULL DEFAULT 'train',
    "isHoldout" BOOLEAN NOT NULL DEFAULT false,
    "provenance" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptEdit" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelOutput" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "candidateModelId" TEXT,
    "evalRunId" TEXT,
    "bucket" "EvalBucket",
    "outputText" TEXT NOT NULL,
    "ragContextIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenCountIn" INTEGER,
    "tokenCountOut" INTEGER,
    "latencyMs" INTEGER,
    "epochId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairwiseComparison" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "bucket" "EvalBucket",
    "modelOutputAId" TEXT NOT NULL,
    "modelOutputBId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "annotatorId" TEXT NOT NULL,
    "epochId" TEXT,
    "evalRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairwiseComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricScore" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "modelOutputId" TEXT NOT NULL,
    "bucket" "EvalBucket",
    "culturalAccuracy" INTEGER NOT NULL,
    "linguisticAuthenticity" INTEGER NOT NULL,
    "culturalNormAdherence" INTEGER NOT NULL,
    "factualCorrectness" INTEGER NOT NULL,
    "notesCulturalAccuracy" TEXT,
    "notesLinguisticAuthenticity" TEXT,
    "notesCulturalNormAdherence" TEXT,
    "notesFactualCorrectness" TEXT,
    "annotatorId" TEXT NOT NULL,
    "epochId" TEXT,
    "evalRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubricScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutputEdit" (
    "id" TEXT NOT NULL,
    "modelOutputId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "bucket" "EvalBucket",
    "originalText" TEXT NOT NULL,
    "correctedText" TEXT NOT NULL,
    "rationale" TEXT,
    "annotatorId" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'single_annotator',
    "epochId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutputEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffItem" (
    "id" TEXT NOT NULL,
    "learnerRequest" TEXT NOT NULL,
    "modelAnswer" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "reviewerReasoning" TEXT,
    "gapBucket" "EvalBucket",
    "status" "HandoffStatus" NOT NULL DEFAULT 'pending',
    "correctedAnswer" TEXT,
    "reviewerId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "pipelineRunId" TEXT,

    CONSTRAINT "HandoffItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epoch" (
    "id" TEXT NOT NULL,
    "epochNumber" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "trigger" TEXT NOT NULL,
    "ragSnapshotId" TEXT,
    "promptCatalogueVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Epoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "versionLabel" TEXT,
    "kind" "CandidateKind" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "baseModelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "apiEndpoint" TEXT,
    "hfRepo" TEXT,
    "adapterUri" TEXT,
    "systemPrompt" TEXT,
    "useSystemPrompt" BOOLEAN NOT NULL DEFAULT false,
    "ragEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ragSnapshotId" TEXT,
    "decodingParams" JSONB,
    "fineTuneSource" TEXT,
    "fineTuneJobId" TEXT,
    "parentCandidateId" TEXT,
    "color" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isChampion" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FineTuneJob" (
    "id" TEXT NOT NULL,
    "method" "FineTuneMethod" NOT NULL,
    "provider" TEXT NOT NULL,
    "baseModelId" TEXT NOT NULL,
    "baseCandidateId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "trainingFormat" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "sourcePairwiseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceEditIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceRubricIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "holdoutPromptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bucketFilter" "EvalBucket"[] DEFAULT ARRAY[]::"EvalBucket"[],
    "nTrainingRows" INTEGER,
    "datasetUri" TEXT,
    "hyperparameters" JSONB,
    "providerJobId" TEXT,
    "providerFileId" TEXT,
    "status" "FineTuneStatus" NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "costUsd" DOUBLE PRECISION,
    "epochId" TEXT,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FineTuneJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "candidateModelId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "promptSetLabel" TEXT NOT NULL,
    "holdoutPromptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "judgeModel" TEXT,
    "positionSwap" BOOLEAN NOT NULL DEFAULT true,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'draft',
    "trigger" "EvalTrigger" NOT NULL DEFAULT 'manual',
    "epochId" TEXT,
    "nPrompts" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "meanRubric" DOUBLE PRECISION,
    "meanRank" DOUBLE PRECISION,
    "costUsd" DOUBLE PRECISION,
    "configSnapshot" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalScore" (
    "id" TEXT NOT NULL,
    "evalRunId" TEXT NOT NULL,
    "bucket" "EvalBucket" NOT NULL,
    "promptId" TEXT,
    "modelOutputId" TEXT,
    "candidateWon" BOOLEAN,
    "candidateRank" INTEGER,
    "humanScore" DOUBLE PRECISION,
    "judgeScore" DOUBLE PRECISION,
    "judgeRationale" TEXT,
    "positionSwapAgreement" BOOLEAN,
    "confidence" DOUBLE PRECISION,
    "rawJudgePayload" JSONB,
    "btStrength" DOUBLE PRECISION,
    "btCiLow" DOUBLE PRECISION,
    "btCiHigh" DOUBLE PRECISION,
    "bucketWinRate" DOUBLE PRECISION,
    "bucketMeanScore" DOUBLE PRECISION,
    "bucketN" INTEGER,
    "distinguishable" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "pipelineRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "candidateModelId" TEXT,
    "translatorModel" TEXT NOT NULL,
    "translatorOutput" TEXT NOT NULL,
    "translatorLatencyMs" INTEGER,
    "reviewerOutput" TEXT,
    "reviewerConfidence" DOUBLE PRECISION,
    "reviewerReasoning" TEXT,
    "ragContextIds" TEXT[],
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "finalDisposition" TEXT NOT NULL,
    "gapBucket" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagEntry" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'igala',
    "chunkType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'seed',
    "annotatorId" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagEntryHistory" (
    "id" TEXT NOT NULL,
    "ragEntryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagEntryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AnnotatorLanguage_userId_language_key" ON "AnnotatorLanguage"("userId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_promptId_key" ON "Prompt"("promptId");

-- CreateIndex
CREATE INDEX "Prompt_language_bucket_idx" ON "Prompt"("language", "bucket");

-- CreateIndex
CREATE INDEX "Prompt_split_idx" ON "Prompt"("split");

-- CreateIndex
CREATE INDEX "ModelOutput_candidateModelId_idx" ON "ModelOutput"("candidateModelId");

-- CreateIndex
CREATE INDEX "ModelOutput_evalRunId_idx" ON "ModelOutput"("evalRunId");

-- CreateIndex
CREATE INDEX "PairwiseComparison_bucket_idx" ON "PairwiseComparison"("bucket");

-- CreateIndex
CREATE INDEX "PairwiseComparison_evalRunId_idx" ON "PairwiseComparison"("evalRunId");

-- CreateIndex
CREATE INDEX "RubricScore_evalRunId_idx" ON "RubricScore"("evalRunId");

-- CreateIndex
CREATE INDEX "OutputEdit_modelOutputId_idx" ON "OutputEdit"("modelOutputId");

-- CreateIndex
CREATE INDEX "OutputEdit_verificationStatus_idx" ON "OutputEdit"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffItem_pipelineRunId_key" ON "HandoffItem"("pipelineRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Epoch_epochNumber_language_key" ON "Epoch"("epochNumber", "language");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateModel_slug_key" ON "CandidateModel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateModel_fineTuneJobId_key" ON "CandidateModel"("fineTuneJobId");

-- CreateIndex
CREATE INDEX "CandidateModel_language_archived_idx" ON "CandidateModel"("language", "archived");

-- CreateIndex
CREATE INDEX "FineTuneJob_status_language_idx" ON "FineTuneJob"("status", "language");

-- CreateIndex
CREATE INDEX "EvalRun_candidateModelId_status_idx" ON "EvalRun"("candidateModelId", "status");

-- CreateIndex
CREATE INDEX "EvalScore_evalRunId_bucket_idx" ON "EvalScore"("evalRunId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "Message_pipelineRunId_key" ON "Message"("pipelineRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_messageId_key" ON "PipelineRun"("messageId");

-- AddForeignKey
ALTER TABLE "AnnotatorLanguage" ADD CONSTRAINT "AnnotatorLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptEdit" ADD CONSTRAINT "PromptEdit_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptEdit" ADD CONSTRAINT "PromptEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOutput" ADD CONSTRAINT "ModelOutput_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOutput" ADD CONSTRAINT "ModelOutput_candidateModelId_fkey" FOREIGN KEY ("candidateModelId") REFERENCES "CandidateModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOutput" ADD CONSTRAINT "ModelOutput_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOutput" ADD CONSTRAINT "ModelOutput_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_modelOutputAId_fkey" FOREIGN KEY ("modelOutputAId") REFERENCES "ModelOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_modelOutputBId_fkey" FOREIGN KEY ("modelOutputBId") REFERENCES "ModelOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_modelOutputId_fkey" FOREIGN KEY ("modelOutputId") REFERENCES "ModelOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputEdit" ADD CONSTRAINT "OutputEdit_modelOutputId_fkey" FOREIGN KEY ("modelOutputId") REFERENCES "ModelOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputEdit" ADD CONSTRAINT "OutputEdit_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputEdit" ADD CONSTRAINT "OutputEdit_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffItem" ADD CONSTRAINT "HandoffItem_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffItem" ADD CONSTRAINT "HandoffItem_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateModel" ADD CONSTRAINT "CandidateModel_fineTuneJobId_fkey" FOREIGN KEY ("fineTuneJobId") REFERENCES "FineTuneJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateModel" ADD CONSTRAINT "CandidateModel_parentCandidateId_fkey" FOREIGN KEY ("parentCandidateId") REFERENCES "CandidateModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineTuneJob" ADD CONSTRAINT "FineTuneJob_baseCandidateId_fkey" FOREIGN KEY ("baseCandidateId") REFERENCES "CandidateModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineTuneJob" ADD CONSTRAINT "FineTuneJob_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_candidateModelId_fkey" FOREIGN KEY ("candidateModelId") REFERENCES "CandidateModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "Epoch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScore" ADD CONSTRAINT "EvalScore_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagEntryHistory" ADD CONSTRAINT "RagEntryHistory_ragEntryId_fkey" FOREIGN KEY ("ragEntryId") REFERENCES "RagEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

