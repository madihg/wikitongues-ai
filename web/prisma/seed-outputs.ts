/**
 * Seed model outputs for the annotation queue.
 *
 * The annotator queue only serves a prompt once it has >= 2 model answers to
 * compare. This generates real answers from a few registered candidates for
 * every prompt, so the pairwise + rubric episode has something to work on.
 *
 * Idempotent: skips any (prompt, candidate) pair that already has an output.
 * Run with:  pnpm seed:outputs   (needs ANTHROPIC_API_KEY / OPENAI_API_KEY)
 */
import { prisma } from "../src/lib/prisma";
import {
  generateForCandidate,
  type CandidateLike,
  type RagChunk,
} from "../src/lib/arena/providers";
import { searchRag } from "../src/lib/rag";

// Candidates to generate answers from. Two different models give a meaningful
// A/B. Add the Claude / Gemini candidates back here once their API keys have
// credit (Anthropic was out of balance and Gemini had no key at seed time).
const CANDIDATE_SLUGS = [
  "gpt-4o-baseline",
  "gemini-2-0-flash-baseline",
  "gpt-4o-mini-baseline",
];

// Additional candidates to ensure exist (additive, real models).
const EXTRA_CANDIDATES = [
  {
    slug: "gpt-4o-mini-baseline",
    name: "GPT-4o mini",
    family: "gpt",
    provider: "openai",
    baseModelId: "gpt-4o-mini",
    color: "#4f7a5e",
  },
];

// Per-slug model override for GENERATION only (does not touch the registry).
const MODEL_OVERRIDE: Record<string, string> = {
  "claude-sonnet-4-5-baseline": "claude-opus-4-8",
  "claude-sonnet-4-5-rag": "claude-opus-4-8",
};

async function main() {
  // Ensure any extra candidates exist (idempotent).
  for (const c of EXTRA_CANDIDATES) {
    await prisma.candidateModel.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        name: c.name,
        slug: c.slug,
        family: c.family,
        kind: "baseline",
        provider: c.provider,
        baseModelId: c.baseModelId,
        color: c.color,
      },
    });
  }

  const prompts = await prisma.prompt.findMany({
    orderBy: { createdAt: "asc" },
  });
  const found = await prisma.candidateModel.findMany({
    where: { slug: { in: CANDIDATE_SLUGS } },
  });
  // Keep the intended order and skip any whose provider has no key set.
  const candidates = CANDIDATE_SLUGS.map((s) =>
    found.find((c) => c.slug === s),
  ).filter((c): c is (typeof found)[number] => {
    if (!c) return false;
    if (c.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY)
      return false;
    if (c.provider === "openai" && !process.env.OPENAI_API_KEY) return false;
    if (c.provider === "google" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      return false;
    return true;
  });

  console.log(
    `Prompts: ${prompts.length}. Candidates: ${candidates
      .map((c) => c.slug)
      .join(", ")}\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const prompt of prompts) {
    for (const cand of candidates) {
      const existing = await prisma.modelOutput.findFirst({
        where: { promptId: prompt.id, candidateModelId: cand.id },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      try {
        let ragContext: RagChunk[] = [];
        if (cand.ragEnabled) {
          const entries = await searchRag(prompt.text, prompt.language, 5);
          ragContext = entries.map((e) => ({
            id: e.id,
            content: e.content,
            topic: e.topic,
            chunkType: e.chunkType,
          }));
        }
        const candForGen: CandidateLike = {
          ...(cand as CandidateLike),
          baseModelId: MODEL_OVERRIDE[cand.slug] ?? cand.baseModelId,
        };
        const gen = await generateForCandidate(candForGen, {
          userMessage: prompt.text,
          ragContext,
        });
        await prisma.modelOutput.create({
          data: {
            promptId: prompt.id,
            model: cand.family,
            modelId: gen.modelId,
            candidateModelId: cand.id,
            bucket: prompt.bucket,
            outputText: gen.text,
            ragContextIds: gen.ragContextIds,
            tokenCountIn: gen.tokensIn ?? null,
            tokenCountOut: gen.tokensOut ?? null,
            latencyMs: gen.latencyMs,
          },
        });
        created++;
        console.log(
          `ok   ${prompt.promptId.padEnd(14)} ${cand.slug.padEnd(28)} ${gen.text
            .replace(/\s+/g, " ")
            .slice(0, 60)}`,
        );
      } catch (e) {
        failed++;
        console.error(
          `FAIL ${prompt.promptId} ${cand.slug}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
