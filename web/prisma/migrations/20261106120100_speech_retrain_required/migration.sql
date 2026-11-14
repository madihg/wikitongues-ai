-- Retrain required (US-040): a candidate model is marked when clips of a
-- speaker who has since withdrawn were in its training manifest. One boolean
-- column, default false. Additive only.
-- NOT applied by any agent. A human applies it (Supabase apply_migration; not
-- prisma migrate deploy on this database). down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeechCandidate" ADD COLUMN     "retrainRequired" BOOLEAN NOT NULL DEFAULT false;
