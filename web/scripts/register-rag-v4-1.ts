/**
 * Register the rag-v4-1 candidate - the single v4.1 arm, cloned from the
 * live Gemini rag-v4 row.
 *
 * Same registration philosophy as scripts/register-rag-v4.ts: the v4.1
 * candidate is a NEW CandidateModel row, never a mutation of its v4 sibling,
 * so the v4 row keeps its outputs and stays comparable. versionLabel
 * 'rag-v4-1' is what the chat route and the eval-run generate route branch
 * on to swap in IGALA_SYSTEM_V4_1 and the repair round; retrieval stays
 * buildRetrievalV4 UNCHANGED, so a v4/v4.1 delta measures exactly {the v4.1
 * static prompt + the repair round} - provider, model id, endpoint and
 * decoding are COPIED from the live v4 row. The nine seeded v4.1
 * grammar_rule RagEntry rows are NOT part of the delta: buildRetrievalV4
 * reads no RagEntry rows, so they are unreachable on this serving path until
 * a future retrieval iteration adds a grammar_rule block.
 *
 * ONE arm only (Gemini), and inPairingPool FALSE: the v4.1 iteration enters
 * the arena as a measured candidate first; pairwise episodes keep drawing
 * from the existing pool until the flag is flipped as a data edit (house
 * rule: pool membership is a DB flag, never a hardcoded slug list).
 *
 * Decoding: the Gemini arm carries temperature 0; the assertion below keeps
 * that invariant from silently regressing if the v4 row ever changes (same
 * trust-but-verify convention as register-rag-v4.ts).
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * DO NOT run before scripts' static leak check for v4.1 has passed against
 * the real frozen protected set - the prompt this label serves ships on
 * every rag-v4-1 request.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-1.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const V4_SLUG = "gemini-3-1-pro-rag-v4";
const SLUG = "gemini-3-1-pro-rag-v4-1";
const NAME = "Gemini 3.1 Pro + Igala RAG v4.1";

async function main() {
  const v4 = await prisma.candidateModel.findUnique({
    where: { slug: V4_SLUG },
  });
  if (!v4) {
    throw new Error(
      `v4 sibling ${V4_SLUG} is not registered - run scripts/register-rag-v4.ts first`,
    );
  }

  // Copy the v4 decoding verbatim, after verifying the Gemini invariant.
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
    versionLabel: "rag-v4-1",
    kind: "rag" as const,
    language: v4.language,
    provider: v4.provider,
    baseModelId: v4.baseModelId,
    apiEndpoint: v4.apiEndpoint,
    ragEnabled: true,
    decodingParams,
    // Lineage: the v4 candidate is the parent, so the arena UI shows v4.1 as
    // a versioned descendant (v1 -> v2 -> v3 -> v4 -> v4.1).
    parentCandidateId: v4.id,
    color: v4.color,
    isPublic: v4.isPublic,
    // Explicit, not defaulted: the v4.1 arm stays OUT of the pairing pool
    // until its numbers earn the flip (a data edit, never a deploy).
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
