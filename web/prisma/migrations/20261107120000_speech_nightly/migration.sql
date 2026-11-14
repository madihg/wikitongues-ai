-- Nightly loop (PR F): three columns on SpeechTrainJob (what the worker was
-- asked, its call id, the clip ids a training job used), the dashboard alert
-- table and the small audit table for promotions and pauses. Additive only.
-- NOT applied by any agent. A human applies it (Supabase apply_migration; not
-- prisma migrate deploy on this database). down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeechTrainJob" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "manifestLines" JSONB;

-- CreateTable
CREATE TABLE "SpeechAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "SpeechAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeechAlert_kind_createdAt_idx" ON "SpeechAlert"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "SpeechAlert_readAt_idx" ON "SpeechAlert"("readAt");

-- CreateIndex
CREATE INDEX "SpeechAudit_subjectType_subjectId_idx" ON "SpeechAudit"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "SpeechAudit_actorId_idx" ON "SpeechAudit"("actorId");

