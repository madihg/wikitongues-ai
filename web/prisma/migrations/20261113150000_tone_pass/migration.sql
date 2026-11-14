-- Tone-mark pass 2 (EDIT lane, Nov 13): four new tables beside the pass-1
-- rows. TonePassItem (an answer in a tone set, with its text as it was),
-- TonePassAssignment (an item served to a marker), TonePass (a marker's
-- tone-marked copy), TonePassAgreed (the agreed text). Additive only: no
-- foreign keys, no existing table or column is altered. Pass 1
-- (ColdAuthorAnswer, OutputEdit) is not touched by this migration or by the
-- feature.
-- NOT applied by any agent. A human applies it to the wikitongues schema
-- after review. down.sql reverses it.
-- Generated with `prisma migrate diff` (datamodel to datamodel).
SET search_path TO "wikitongues", "extensions", "public";

-- CreateTable
CREATE TABLE "TonePassItem" (
    "id" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "sourceTextSnapshot" TEXT NOT NULL,
    "cells" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredMarkers" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TonePassItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TonePassAssignment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "annotatorId" TEXT NOT NULL,
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TonePassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TonePass" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "passNumber" INTEGER NOT NULL DEFAULT 2,
    "annotatorId" TEXT NOT NULL,
    "toneMarkedText" TEXT NOT NULL,
    "sourceTextSnapshot" TEXT NOT NULL,
    "note" TEXT,
    "unsureWords" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "flaggedNonToneChange" BOOLEAN NOT NULL DEFAULT false,
    "flagText" TEXT,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TonePass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TonePassAgreed" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "agreedText" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "adjudicatorId" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TonePassAgreed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TonePassItem_sourceType_sourceId_idx" ON "TonePassItem"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TonePassItem_setName_sourceType_sourceId_key" ON "TonePassItem"("setName", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TonePassAssignment_annotatorId_idx" ON "TonePassAssignment"("annotatorId");

-- CreateIndex
CREATE UNIQUE INDEX "TonePassAssignment_itemId_annotatorId_key" ON "TonePassAssignment"("itemId", "annotatorId");

-- CreateIndex
CREATE INDEX "TonePass_sourceType_sourceId_idx" ON "TonePass"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TonePass_annotatorId_idx" ON "TonePass"("annotatorId");

-- CreateIndex
CREATE UNIQUE INDEX "TonePass_itemId_annotatorId_key" ON "TonePass"("itemId", "annotatorId");

-- CreateIndex
CREATE UNIQUE INDEX "TonePassAgreed_itemId_key" ON "TonePassAgreed"("itemId");

