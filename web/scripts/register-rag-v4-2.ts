/**
 * Register the rag-v4-2 candidate - the single v4.2 arm, cloned from the live
 * Gemini rag-v4-1 row.
 *
 * Same registration philosophy as register-rag-v4-1.ts: a NEW CandidateModel
 * row, never a mutation of its v4.1 sibling, so v4.1 keeps its outputs and
 * stays comparable. versionLabel 'rag-v4-2' is what frozen-exam.ts branches
 * on to swap in IGALA_SYSTEM_V4_2 and to switch on the repair round's name
 * check; retrieval stays buildRetrievalV4 UNCHANGED, so a v4.1/v4.2 delta
 * measures exactly {the three v4.2 prompt lines + check (d)} - provider,
 * model id, endpoint and decoding are COPIED from the live v4.1 row.
 *
 * ONE arm only (Gemini), and inPairingPool FALSE. Read the 2026-09-07 empty
 * queue before considering the flip: the pairing pool is a DB flag AND an
 * ALLOWED_PAIRINGS entry, and a whitelist naming no pooled pair empties every
 * annotator's queue silently. If v4.2 is ever pooled, add its pairing to
 * src/lib/pairing.ts in the same change and run
 * scripts/check-queue-servable.ts before telling anyone the queue is open.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * DO NOT run before scripts/static-leak-check-v4-2.ts has passed against the
 * real frozen protected set - the prompt this label serves ships on every
 * rag-v4-2 request.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-2.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const V4_SLUG = "gemini-3-1-pro-rag-v4-1";
const SLUG = "gemini-3-1-pro-rag-v4-2";
const NAME = "Gemini 3.1 Pro + Igala RAG v4.2";

async function main() {
  const v4 = await prisma.candidateModel.findUnique({
    where: { slug: V4_SLUG },
  });
  if (!v4) {
    throw new Error(
      `v4.1 sibling ${V4_SLUG} is not registered - run scripts/register-rag-v4-1.ts first`,
    );
  }

  // Copy the v4.1 decoding verbatim, after verifying the Gemini invariant.
  const v4Decoding =
    v4.decodingParams && typeof v4.decodingParams === "object"
      ? (v4.decodingParams as Record<string, unknown>)
      : {};
  if (v4Decoding.temperature !== 0) {
    throw new Error(
      `${V4_SLUG} carries temperature ${String(v4Decoding.temperature)}, expected 0 - fix the v4 row first`,
    );
  }
  const decodingParams = { ...v4Decoding } as Prisma.InputJsonValue;

  const data = {
    name: NAME,
    family: v4.family,
    versionLabel: "rag-v4-2",
    kind: "rag" as const,
    language: v4.language,
    provider: v4.provider,
    baseModelId: v4.baseModelId,
    apiEndpoint: v4.apiEndpoint,
    ragEnabled: true,
    decodingParams,
    // Lineage: the v4.1 candidate is the parent, so the arena UI shows v4.2
    // as a versioned descendant (v1 -> v2 -> v3 -> v4 -> v4.1 -> v4.2).
    parentCandidateId: v4.id,
    color: v4.color,
    isPublic: v4.isPublic,
    // Explicit, not defaulted: the v4.2 arm stays OUT of the pairing pool
    // until its numbers earn the flip (a data edit, never a deploy) AND
    // ALLOWED_PAIRINGS names a pair it can actually be drawn in.
    inPairingPool: false,
  };

  const existing = await prisma.candidateModel.findUnique({
    where: { slug: SLUG },
  });
  await prisma.candidateModel.upsert({
    where: { slug: SLUG },
    update: data,
    create: { ...data, slug: SLUG },
  });
  console.log(
    `  ${existing ? "updated" : "CREATED"}  ${SLUG.padEnd(28)} ${NAME}  (from ${V4_SLUG})`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
