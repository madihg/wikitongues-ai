-- Speech Lab, second slice: two languages per answer, clips stored in
-- Postgres (no bucket), client-side quality metrics, provisional speech axes
-- on a judgment. Additive only: four new columns, nothing dropped or altered.
-- NOT applied by any agent. A human applies it after 20261019120000_speech_lab.
-- Generated with `prisma migrate diff --from-schema-datamodel <previous schema>
-- --to-schema-datamodel schema.prisma --script` (the datamodel form; the
-- datasource form proposes dropping ParallelPair.englishTsv). down.sql in
-- this folder reverses it (and destroys the stored audio bytes).
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeechRecording" ADD COLUMN     "bytes" BYTEA,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'igala',
ADD COLUMN     "quality" JSONB;

-- AlterTable
ALTER TABLE "SpeechComparison" ADD COLUMN     "axes" JSONB;
