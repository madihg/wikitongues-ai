/**
 * QUALITATIVE v2 vs v3 - the three free-form review prompts from
 * scripts/sniff-test-v2.ts, generated fresh under BOTH system prompts and
 * printed side by side for native-speaker review. Never scored, never stored:
 * these prompts are outside every bank, and folding them into the scored set
 * would invite number-chasing (same policy as sniff-test-v2's step 4).
 *
 * Both arms share one retrieval build per prompt (buildRetrievalV2 under the
 * synthetic __chat__ identity, holdout-strict) so the printed difference is
 * attributable to IGALA_SYSTEM_V2 vs IGALA_SYSTEM_V3 and nothing else - the
 * exact question the enshrined grammar has to answer: does the model now
 * assemble its attested material with Igala syntax, register and greeting
 * frames?
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/qual-v2-v3.ts
 */

import { prisma } from "@/lib/prisma";
import {
  generateForCandidate,
  type CandidateLike,
} from "@/lib/arena/providers";
import { buildRetrievalV2 } from "@/lib/arena/retrieval-v2";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";

/** The same three prompts as sniff-test-v2.ts - story, greeting, structure. */
const QUAL_PROMPTS: string[] = [
  "Give me a short story in Igala about a farmer and rain",
  "How do you greet an elder in the morning in Igala?",
  "Translate: The children are eating",
];

/** v2 arm -> v3 arm, per base model. */
const PAIRS: { v2Slug: string; v3Slug: string }[] = [
  { v2Slug: "gpt-4-1-rag-v2", v3Slug: "gpt-4-1-rag-v3" },
  { v2Slug: "claude-opus-5-rag-v2", v3Slug: "claude-opus-5-rag-v3" },
  { v2Slug: "gemini-3-1-pro-rag-v2", v3Slug: "gemini-3-1-pro-rag-v3" },
];

async function main() {
  let spendUsd = 0;
  const slugs = PAIRS.flatMap((p) => [p.v2Slug, p.v3Slug]);
  const bySlug = new Map(
    (
      await prisma.candidateModel.findMany({ where: { slug: { in: slugs } } })
    ).map((c) => [c.slug, c]),
  );

  for (const text of QUAL_PROMPTS) {
    console.log(`\n══════ ${text} ══════`);
    // Free-form means no Prompt row: synthetic id, holdout-strict guarding,
    // exactly how the chat route serves rag-v2/rag-v3 candidates.
    const v2ctx = await buildRetrievalV2(prisma, {
      promptId: "__chat__",
      text,
      bucket: null,
      isHoldout: true,
    });

    for (const { v2Slug, v3Slug } of PAIRS) {
      for (const [slug, system, label] of [
        [v2Slug, IGALA_SYSTEM_V2, "v2"],
        [v3Slug, IGALA_SYSTEM_V3, "v3"],
      ] as const) {
        const candidate = bySlug.get(slug);
        if (!candidate) {
          console.log(`\n[${label} ${slug}] NOT REGISTERED - skipping`);
          continue;
        }
        try {
          const gen = await generateForCandidate(candidate as CandidateLike, {
            userMessage: buildUserTurnV2(text, v2ctx, null),
            goldExamples: v2ctx.exampleTurns,
            systemPromptOverride: system,
          });
          spendUsd += estimateGenerationCostUsd({
            modelId: gen.modelId,
            tokensIn: gen.tokensIn,
            tokensOut: gen.tokensOut,
          });
          console.log(`\n[${label} ${slug}]\n${gen.text.trim()}`);
        } catch (e) {
          console.log(
            `\n[${label} ${slug}] ERROR: ${(e as Error).message.slice(0, 160)}`,
          );
        }
      }
    }
  }
  console.log(`\nestimated spend ~$${roundUsd(spendUsd).toFixed(2)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
