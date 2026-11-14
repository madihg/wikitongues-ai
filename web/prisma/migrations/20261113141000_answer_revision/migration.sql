-- Answer revisions (EDIT lane, Nov 13): one row per changed field each time
-- an author edits a submitted answer, meaning, reason or "why", or a
-- researcher edits answer text. Append-only log beside the parent rows; the
-- parent rows keep being updated as before. Additive only: one new table, no
-- foreign keys, no existing table or column is altered.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- after review. down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- CreateTable
CREATE TABLE "AnswerRevision" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "editorId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "afterReveal" BOOLEAN NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnswerRevision_targetType_targetId_createdAt_idx" ON "AnswerRevision"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AnswerRevision_editorId_createdAt_idx" ON "AnswerRevision"("editorId", "createdAt");

-- CreateIndex
CREATE INDEX "AnswerRevision_saveId_idx" ON "AnswerRevision"("saveId");
