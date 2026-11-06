-- Consent withdrawal (US-040): a ConsentGrant row can record a withdrawal.
-- One boolean column, default false, so every existing grant stays a grant.
-- Additive only.
-- NOT applied by any agent. A human applies it (Supabase apply_migration; not
-- prisma migrate deploy on this database). down.sql reverses it.
SET search_path TO "wikitongues", "extensions", "public";

-- AlterTable
ALTER TABLE "ConsentGrant" ADD COLUMN     "withdrawn" BOOLEAN NOT NULL DEFAULT false;
