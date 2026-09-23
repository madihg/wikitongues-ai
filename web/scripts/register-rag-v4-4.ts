/**
 * Register the rag-v4-4 candidate - the single v4.4 arm, cloned from the
 * rag-v4-3 row.
 *
 * v4.4 is v4.3 with ONE change: the system prompt is IGALA_SYSTEM_V4_4, the
 * v4.2 prompt with eleven lines amended from the Sep 13-23 annotation round
 * (src/lib/generation-prompt-v4-4.ts names each). Retrieval, the grammar
 * block, the repair round and the name check are v4.3's, unchanged, so a
 * v4.3 -> v4.4 delta measures exactly {those eleven lines}. Decoding is
 * copied from the v4.3 row (temperature 0, verified).
 *
 * DO NOT run before scripts/static-leak-check-v4-4.ts passes: the amended
 * lines carry forms the annotators wrote, and every one must clear Scope A.
 *
 * Idempotent (upsert by slug). Run:
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-4.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const V4_SLUG = "gemini-3-1-pro-rag-v4-3";
const SLUG = "gemini-3-1-pro-rag-v4-4";
const NAME = "Gemini 3.1 Pro + Igala RAG v4.4";

async function main() {
  const v4 = await prisma.candidateModel.findUnique({
    where: { slug: V4_SLUG },
  });
  if (!v4) {
    throw new Error(
      `v4.3 sibling ${V4_SLUG} is not registered - run scripts/register-rag-v4-3.ts first`,
    );
  }

  // Copy the v4.3 decoding verbatim, after verifying the Gemini invariant.
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
    versionLabel: "rag-v4-4",
    kind: "rag" as const,
    language: v4.language,
    provider: v4.provider,
    baseModelId: v4.baseModelId,
    apiEndpoint: v4.apiEndpoint,
    ragEnabled: true,
    decodingParams,
    // Lineage: the v4.3 candidate is the parent, so the arena UI shows v4.4
    // as a versioned descendant (v1 -> v2 -> v3 -> v4 -> v4.1 -> v4.2 -> v4.3 -> v4.4).
    parentCandidateId: v4.id,
    color: v4.color,
    isPublic: v4.isPublic,
    // Explicit, not defaulted: the v4.4 arm stays OUT of the pairing pool
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
