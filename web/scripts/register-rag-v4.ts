/**
 * Register the rag-v4 candidates - the serving-v4 variants of the three
 * rag-v3 arms (GPT-4.1, Claude Opus 5, Gemini 3.1 Pro).
 *
 * Same registration philosophy as scripts/register-rag-v3.ts: each v4
 * candidate is a NEW CandidateModel row, never a mutation of its v3 sibling,
 * so the v3 rows keep their outputs and stay comparable. versionLabel
 * 'rag-v4' is what the chat route, the eval-run generate route and
 * frontier-fill branch on to swap in IGALA_SYSTEM_V4 AND buildRetrievalV4
 * (meaning-first METHOD, corrections block, register-guarded
 * source-diversified pairs); unlike the v2->v3 step, v4 moves the retrieval
 * composition too, so a v3/v4 delta measures the serving-v4 package as a
 * whole - the five documented changes in generation-prompt-v4.ts, nothing
 * else, because provider, model id, endpoint, decoding and color are COPIED
 * from the live v3 rows.
 *
 * Decoding therefore carries temperature 0 for GPT-4.1 and Gemini and
 * temperature null for Claude Opus 5 - null is the sanctioned opt-out because
 * that model REJECTS the temperature parameter outright ("`temperature` is
 * deprecated for this model"); providers.ts omits the field when it is null,
 * and frontier-fill's trust-but-verify gate accepts exactly 0 or null. An
 * assertion below keeps that invariant from silently regressing if the v3
 * row ever changes.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v4.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAIRS: { v3Slug: string; slug: string }[] = [
  { v3Slug: "gpt-4-1-rag-v3", slug: "gpt-4-1-rag-v4" },
  { v3Slug: "claude-opus-5-rag-v3", slug: "claude-opus-5-rag-v4" },
  { v3Slug: "gemini-3-1-pro-rag-v3", slug: "gemini-3-1-pro-rag-v4" },
];

async function main() {
  for (const { v3Slug, slug } of PAIRS) {
    const v3 = await prisma.candidateModel.findUnique({
      where: { slug: v3Slug },
    });
    if (!v3) {
      // Fail the whole run rather than registering a partial trio: a v4
      // candidate with no v3 sibling has no baseline to isolate the serving
      // changes against.
      throw new Error(
        `v3 sibling ${v3Slug} is not registered - run scripts/register-rag-v3.ts first`,
      );
    }

    // "<base> + Igala RAG v4", with <base> taken from the v3 name so display
    // names stay consistent.
    const baseName = v3.name.replace(/\s*\+\s*Igala RAG v3$/i, "");
    const name = `${baseName} + Igala RAG v4`;

    // Copy the v3 decoding verbatim - including Claude's temperature null.
    const v3Decoding =
      v3.decodingParams && typeof v3.decodingParams === "object"
        ? (v3.decodingParams as Record<string, unknown>)
        : {};
    if (v3.provider === "anthropic") {
      if (v3Decoding.temperature !== null) {
        throw new Error(
          `${v3Slug} carries temperature ${String(v3Decoding.temperature)}; Claude Opus 5 rows must opt out with temperature null - fix the v3 row first`,
        );
      }
    } else if (v3Decoding.temperature !== 0) {
      throw new Error(
        `${v3Slug} carries temperature ${String(v3Decoding.temperature)}, expected 0 - fix the v3 row first`,
      );
    }
    // Verbatim copy of the v3 row's JSON (validated just above); the cast is
    // the standard Prisma JSON-input shim, same value in and out.
    const decodingParams = { ...v3Decoding } as Prisma.InputJsonValue;

    const data = {
      name,
      family: v3.family,
      versionLabel: "rag-v4",
      kind: "rag" as const,
      language: v3.language,
      provider: v3.provider,
      baseModelId: v3.baseModelId,
      apiEndpoint: v3.apiEndpoint,
      ragEnabled: true,
      decodingParams,
      // Lineage: the v3 candidate is the parent, so the arena UI shows v4 as
      // a versioned descendant (v1 -> v2 -> v3 -> v4), same convention as
      // register-rag-v3.ts.
      parentCandidateId: v3.id,
      color: v3.color,
      isPublic: v3.isPublic,
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
      `  ${existing ? "updated" : "CREATED"}  ${slug.padEnd(28)} ${name}  (from ${v3Slug})`,
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
