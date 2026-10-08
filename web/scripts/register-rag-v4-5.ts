/**
 * Register the rag-v4-5 candidate - the single v4.5 arm, cloned from the
 * rag-v4-4 row.
 *
 * v4.5 is v4.4 with ONE change: the system prompt is IGALA_SYSTEM_V4_5, the
 * v4.4 prompt with ten lines amended, six from the Salem Ejeba and Lydia
 * Wiernik write-up of 2026-09-25 and four from the speakers'-gold read of
 * v4.4's train answers (src/lib/generation-prompt-v4-5.ts names each).
 * Retrieval, the grammar block, the repair round and the name check are
 * v4.4's, unchanged, so a v4.4 -> v4.5 delta measures exactly {those ten
 * lines}. Decoding is copied from the v4.4 row (temperature 0, verified).
 *
 * DO NOT run before scripts/static-leak-check-v4-5.ts passes: the amended
 * lines carry Igala forms, and every one must clear Scope A.
 *
 * v4.5 is built and examined, not pooled (tasks/prd-salem-writeup-ingest-
 * 2026-10-08.md, US-009): inPairingPool stays false and ALLOWED_PAIRINGS
 * names no v4.5 pair.
 *
 * Idempotent (upsert by slug). Run:
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-5.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const V4_SLUG = "gemini-3-1-pro-rag-v4-4";
const SLUG = "gemini-3-1-pro-rag-v4-5";
const NAME = "Gemini 3.1 Pro + Igala RAG v4.5";

async function main() {
  const v4 = await prisma.candidateModel.findUnique({
    where: { slug: V4_SLUG },
  });
  if (!v4) {
    throw new Error(
      `v4.4 sibling ${V4_SLUG} is not registered - run scripts/register-rag-v4-4.ts first`,
    );
  }

  // Copy the v4.4 decoding verbatim, after verifying the Gemini invariant.
  const v4Decoding =
    v4.decodingParams && typeof v4.decodingParams === "object"
      ? (v4.decodingParams as Record<string, unknown>)
      : {};
  if (v4Decoding.temperature !== 0) {
    throw new Error(
      `${V4_SLUG} carries temperature ${String(v4Decoding.temperature)}, expected 0 - fix the v4.4 row first`,
    );
  }
  const decodingParams = { ...v4Decoding } as Prisma.InputJsonValue;

  const data = {
    name: NAME,
    family: v4.family,
    versionLabel: "rag-v4-5",
    kind: "rag" as const,
    language: v4.language,
    provider: v4.provider,
    baseModelId: v4.baseModelId,
    apiEndpoint: v4.apiEndpoint,
    ragEnabled: true,
    decodingParams,
    // Lineage: the v4.4 candidate is the parent, so the arena UI shows v4.5
    // as a versioned descendant (... -> v4.3 -> v4.4 -> v4.5).
    parentCandidateId: v4.id,
    color: v4.color,
    isPublic: v4.isPublic,
    // Explicit, not defaulted: the v4.5 arm stays OUT of the pairing pool.
    // It is examined against v4.4 first; pooling is a later data edit AND
    // an ALLOWED_PAIRINGS entry, never a side effect of this script.
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
