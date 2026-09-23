/**
 * Register the rag-v4-3 candidate - the single v4.3 arm, cloned from the live
 * Gemini rag-v4-2 row.
 *
 * v4.3 is v4.2 with ONE addition: the grammar block
 * (src/lib/arena/grammar-block.ts), which finally serves the grammar_rule
 * RagEntry rows - Ejeba (2023) concord paradigms, the RE1-RE9 register rows,
 * and the 2026-09-23 additions - at the head of the user turn. The system
 * prompt is IGALA_SYSTEM_V4_2 byte for byte and retrieval is buildRetrievalV4
 * unchanged, so a v4.2 -> v4.3 delta measures exactly {grammar rules being
 * reachable at all}. Provider, model id, endpoint and decoding are COPIED
 * from the live v4.2 row.
 *
 * ONE arm only (Gemini), and inPairingPool FALSE at registration. Pooling is
 * a separate, deliberate step (scripts/enable-v43-pool.ts) that also adds the
 * ALLOWED_PAIRINGS entries and runs the servability check - never a side
 * effect of registering.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * DO NOT run before scripts/static-leak-check-v4-2.ts and the grammar seed's
 * Scope-A gate have passed: every grammar row this arm can serve is served
 * text.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-3.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const V4_SLUG = "gemini-3-1-pro-rag-v4-2";
const SLUG = "gemini-3-1-pro-rag-v4-3";
const NAME = "Gemini 3.1 Pro + Igala RAG v4.3";

async function main() {
  const v4 = await prisma.candidateModel.findUnique({
    where: { slug: V4_SLUG },
  });
  if (!v4) {
    throw new Error(
      `v4.2 sibling ${V4_SLUG} is not registered - run scripts/register-rag-v4-2.ts first`,
    );
  }

  // Copy the v4.2 decoding verbatim, after verifying the Gemini invariant.
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
    versionLabel: "rag-v4-3",
    kind: "rag" as const,
    language: v4.language,
    provider: v4.provider,
    baseModelId: v4.baseModelId,
    apiEndpoint: v4.apiEndpoint,
    ragEnabled: true,
    decodingParams,
    // Lineage: the v4.1 candidate is the parent, so the arena UI shows v4.3
    // as a versioned descendant (v1 -> v2 -> v3 -> v4 -> v4.1 -> v4.2 -> v4.3).
    parentCandidateId: v4.id,
    color: v4.color,
    isPublic: v4.isPublic,
    // Explicit, not defaulted: the v4.3 arm stays OUT of the pairing pool
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
