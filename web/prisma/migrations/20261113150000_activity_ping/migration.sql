-- Honest time, story D1: the activity beat. One new table, ActivityPing: the
-- seconds a person was active in one minute on one kind of work. Additive
-- only: no existing table is altered, nothing is dropped or rewritten.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- (Supabase apply_migration) after review. down.sql reverses it.
-- Until it is applied the app keeps working: the beat route answers 200 with
-- stored 0, and every hours figure falls back to the estimate.
SET search_path TO "wikitongues", "extensions", "public";

-- CreateTable
CREATE TABLE "ActivityPing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "surface" TEXT NOT NULL,
    "activeSeconds" INTEGER NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityPing_userId_minute_surface_isDemo_key" ON "ActivityPing"("userId", "minute", "surface", "isDemo");

-- CreateIndex
CREATE INDEX "ActivityPing_userId_minute_idx" ON "ActivityPing"("userId", "minute");

-- CreateIndex
CREATE INDEX "ActivityPing_minute_idx" ON "ActivityPing"("minute");
