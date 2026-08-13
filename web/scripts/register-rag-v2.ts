/**
 * Register the rag-v2 candidates - the serving-path-v2 variants of the three
 * RAG models Agnes live-tested on 2026-08-11.
 *
 * Each v2 candidate is a NEW CandidateModel row rather than a mutation of its
 * v1 sibling, because the arena's whole value is that old candidates stay
 * comparable: the v1 rows keep their outputs, their annotations and their
 * versionLabel, and versionLabel='rag-v2' is what the chat and eval-run
 * routes branch on to serve the v2 composition.
 *
 * Provider, model id and endpoint are COPIED from the live v1 rows (not
 * restated here) so the v1/v2 comparison isolates the serving path - if the
 * two rows could drift on baseModelId, a v2 win would be uninterpretable.
 * Temperature is 0 because the v2 method is "use the attested form, copy the
 * attested spelling": sampling variance on top of a copy-exactly instruction
 * only adds spelling noise, which is the precise failure (Ojọ vs Ojọn) v2
 * targets.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v2.ts
 */

import { prisma } from "@/lib/prisma";

const PAIRS: { v1Slug: string; slug: string }[] = [
  { v1Slug: "gpt-4-1-rag", slug: "gpt-4-1-rag-v2" },
  { v1Slug: "llama-3-3-70b-rag", slug: "llama-3-3-70b-rag-v2" },
  { v1Slug: "gemma-4-31b-rag", slug: "gemma-4-31b-rag-v2" },
];

async function main() {
  for (const { v1Slug, slug } of PAIRS) {
    const v1 = await prisma.candidateModel.findUnique({
      where: { slug: v1Slug },
    });
    if (!v1) {
      // Fail the whole run rather than registering a partial trio: a v2
      // candidate with no v1 sibling has no baseline to be compared against.
      throw new Error(
        `v1 sibling ${v1Slug} is not registered - run scripts/igala-rag-run.ts register first`,
      );
    }

    // "<base> + Igala RAG v2", with <base> taken from the v1 name so display
    // names stay consistent ("GPT-4.1 + Igala RAG" -> "GPT-4.1 + Igala RAG v2").
    const baseName = v1.name.replace(/\s*\+\s*Igala RAG$/i, "");
    const name = `${baseName} + Igala RAG v2`;

    // Carry the v1 decoding budget (gemma needs the 4096-token budget for its
    // hidden reasoning trace - see igala-rag-run.ts) but force temperature 0.
    const v1Decoding =
      v1.decodingParams && typeof v1.decodingParams === "object"
        ? (v1.decodingParams as Record<string, unknown>)
        : {};
    const decodingParams = { ...v1Decoding, temperature: 0 };

    const data = {
      name,
      family: v1.family,
      versionLabel: "rag-v2",
      kind: "rag" as const,
      language: v1.language,
      provider: v1.provider,
      baseModelId: v1.baseModelId,
      apiEndpoint: v1.apiEndpoint,
      ragEnabled: true,
      decodingParams,
      // Lineage: the v1 candidate is the parent, so the arena UI can show the
      // v2 row as a versioned descendant rather than an unrelated model.
      parentCandidateId: v1.id,
      color: v1.color,
      isPublic: v1.isPublic,
    };

    const existing = await prisma.candidateModel.findUnique({
      where: { slug },
    });
    await prisma.candidateModel.upsert({
      where: { slug },
      update: data,
      create: { ...data, slug },
    });
    console.log(
      `  ${existing ? "updated" : "CREATED"}  ${slug.padEnd(28)} ${name}  (from ${v1Slug})`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
