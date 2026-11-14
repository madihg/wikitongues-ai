-- Speech Lab storage (US-038): clips may live in the private Supabase Storage
-- bucket "igala-speech". One nullable column holds the object key; the bytes
-- column is untouched and stays the fallback. Additive only.
-- NOT applied by any agent. A human applies it (Supabase apply_migration; not
-- prisma migrate deploy on this database), and creates the private bucket
-- "igala-speech" separately. down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "SpeechRecording" ADD COLUMN     "storageKey" TEXT;

-- CreateIndex
CREATE INDEX "SpeechRecording_storageKey_idx" ON "SpeechRecording"("storageKey");
