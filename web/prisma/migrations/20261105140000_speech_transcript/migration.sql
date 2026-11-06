-- Speech transcripts (PR D): what a model heard in one clip, written by the
-- worker's transcribe callback. Additive only: one new table, no existing
-- table or column is altered (the back-relation on SpeechRecording is a Prisma
-- field, not a column). NOT applied by any agent. A human applies it to the
-- wikitongues schema after review, after 20261105130000_speech_loop.
-- Generated with `prisma migrate diff` (datamodel to datamodel).
SET search_path TO "wikitongues", "extensions", "public";


-- CreateTable
CREATE TABLE "SpeechTranscript" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "modelRef" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeechTranscript_modelRef_idx" ON "SpeechTranscript"("modelRef");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechTranscript_recordingId_modelRef_key" ON "SpeechTranscript"("recordingId", "modelRef");

-- AddForeignKey
ALTER TABLE "SpeechTranscript" ADD CONSTRAINT "SpeechTranscript_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "SpeechRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

