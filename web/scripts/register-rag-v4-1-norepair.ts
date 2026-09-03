/**
 * Register the no-repair control candidates for option (d2) of the 2026-09-01 audit.
 *
 * Two arms, one per family:
 *   gemini-3-1-pro-rag-v4-1-norepair    "Gemini 3.1 Pro + Igala RAG v4.1 (no repair)"
 *   claude-opus-5-rag-v4-1-norepair     "Claude Opus 5 + Igala RAG v4.1 (no repair)"
 *
 * Both use versionLabel "rag-v4-1-norepair" which serves IGALA_SYSTEM_V4_1 (the v4.1
 * prompt) but SKIPS the repair round - a control to test whether v4.1's improvement
 * over v4 is grammar rules or tone-mark stripping.
 *
 * Gemini: cloned from gemini-3-1-pro-rag-v4-1 (v4.1 sibling), identical decoding
 * and provider; inPairingPool=false.
 *
 * Claude: cloned from claude-opus-5-rag-v4-1 (v4.1 sibling), identical decoding,
 * provider=openrouter, model=anthropic/claude-opus-5; inPairingPool=false.
 *
 * Both are frozen controls: outputs generated here are independent of the v4.1 pool
 * and serve as a tone-insensitive (or post-processor-controlled) baseline.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v4-1-norepair.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const GEMINI_V4_1_SLUG = "gemini-3-1-pro-rag-v4-1";
const GEMINI_SLUG = "gemini-3-1-pro-rag-v4-1-norepair";
const GEMINI_NAME = "Gemini 3.1 Pro + Igala RAG v4.1 (no repair)";

const CLAUDE_V4_1_SLUG = "claude-opus-5-rag-v4-1";
const CLAUDE_SLUG = "claude-opus-5-rag-v4-1-norepair";
const CLAUDE_NAME = "Claude Opus 5 + Igala RAG v4.1 (no repair)";

async function main() {
  // ─── GEMINI NO-REPAIR CONTROL ────────────────────────────────────────────

  const geminiV4_1 = await prisma.candidateModel.findUnique({
    where: { slug: GEMINI_V4_1_SLUG },
  });
  if (!geminiV4_1) {
    throw new Error(
      `${GEMINI_V4_1_SLUG} is not registered - run scripts/register-rag-v4-1.ts first`,
    );
  }

  const geminiDecoding =
    geminiV4_1.decodingParams && typeof geminiV4_1.decodingParams === "object"
      ? (geminiV4_1.decodingParams as Record<string, unknown>)
      : {};

  const geminiData = {
    name: GEMINI_NAME,
    family: geminiV4_1.family,
    versionLabel: "rag-v4-1-norepair",
    kind: "rag" as const,
    language: geminiV4_1.language,
    provider: geminiV4_1.provider,
    baseModelId: geminiV4_1.baseModelId,
    apiEndpoint: geminiV4_1.apiEndpoint,
    ragEnabled: true,
    decodingParams: { ...geminiDecoding } as Prisma.InputJsonValue,
    parentCandidateId: geminiV4_1.id,
    color: geminiV4_1.color,
    isPublic: geminiV4_1.isPublic,
    inPairingPool: false,
  };

  const geminiExisting = await prisma.candidateModel.findUnique({
    where: { slug: GEMINI_SLUG },
  });
  await prisma.candidateModel.upsert({
    where: { slug: GEMINI_SLUG },
    update: geminiData,
    create: { ...geminiData, slug: GEMINI_SLUG },
  });
  console.log(
    `  ${geminiExisting ? "updated" : "CREATED"}  ${GEMINI_SLUG.padEnd(42)} ${GEMINI_NAME}`,
  );

  // ─── CLAUDE NO-REPAIR CONTROL ────────────────────────────────────────────

  const claudeV4_1 = await prisma.candidateModel.findUnique({
    where: { slug: CLAUDE_V4_1_SLUG },
  });
  if (!claudeV4_1) {
    throw new Error(
      `${CLAUDE_V4_1_SLUG} is not registered - run scripts/register-claude-openrouter.ts first`,
    );
  }

  const claudeDecoding =
    claudeV4_1.decodingParams && typeof claudeV4_1.decodingParams === "object"
      ? (claudeV4_1.decodingParams as Record<string, unknown>)
      : {};

  const claudeData = {
    name: CLAUDE_NAME,
    family: claudeV4_1.family,
    versionLabel: "rag-v4-1-norepair",
    kind: "rag" as const,
    language: claudeV4_1.language,
    provider: claudeV4_1.provider,
    baseModelId: claudeV4_1.baseModelId,
    apiEndpoint: claudeV4_1.apiEndpoint,
    ragEnabled: true,
    decodingParams: { ...claudeDecoding } as Prisma.InputJsonValue,
    parentCandidateId: claudeV4_1.id,
    color: claudeV4_1.color,
    isPublic: claudeV4_1.isPublic,
    inPairingPool: false,
  };

  const claudeExisting = await prisma.candidateModel.findUnique({
    where: { slug: CLAUDE_SLUG },
  });
  await prisma.candidateModel.upsert({
    where: { slug: CLAUDE_SLUG },
    update: claudeData,
    create: { ...claudeData, slug: CLAUDE_SLUG },
  });
  console.log(
    `  ${claudeExisting ? "updated" : "CREATED"}  ${CLAUDE_SLUG.padEnd(42)} ${CLAUDE_NAME}`,
  );

  console.log(
    "\nRegistered two no-repair controls (versionLabel=rag-v4-1-norepair, inPairingPool=false).",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
