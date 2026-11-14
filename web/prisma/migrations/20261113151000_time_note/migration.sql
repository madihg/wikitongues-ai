-- Honest time, story D2: the annotator's own note on a week ("Does this look
-- wrong? Tell us"). One new table, TimeNote. Additive only: no existing table
-- is altered, nothing is dropped or rewritten.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- (Supabase apply_migration) after review. down.sql reverses it.
-- Until it is applied the note form answers "not ready yet" and saves nothing.
SET search_path TO "wikitongues", "extensions", "public";

-- CreateTable
CREATE TABLE "TimeNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "day" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeNote_userId_weekStart_idx" ON "TimeNote"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "TimeNote_weekStart_idx" ON "TimeNote"("weekStart");
