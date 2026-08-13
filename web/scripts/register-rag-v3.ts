/**
 * Register the rag-v3 candidates - the enshrined-grammar variants of three
 * rag-v2 arms (GPT-4.1, Claude Opus 5, Gemini 3.1 Pro).
 *
 * Same registration philosophy as scripts/register-rag-v2.ts: each v3
 * candidate is a NEW CandidateModel row, never a mutation of its v2 sibling,
 * so the v2 rows keep their outputs and stay comparable. versionLabel
 * 'rag-v3' is what the chat route, the eval-run generate route and
 * frontier-fill branch on to swap in IGALA_SYSTEM_V3; retrieval and user-turn
 * assembly are byte-identical to v2, so a v2/v3 delta isolates the grammar
 * section of the system prompt and nothing else.
 *
 * Provider, model id, endpoint, decoding and color are COPIED from the live
 * v2 rows (not restated here) for exactly that isolation. Decoding therefore
 * carries temperature 0 for GPT-4.1 and Gemini and temperature null for
 * Claude Opus 5 - null is the sanctioned opt-out because that model REJECTS
 * the temperature parameter outright ("`temperature` is deprecated for this
 * model"); providers.ts omits the field when it is null, and frontier-fill's
 * trust-but-verify gate accepts exactly 0 or null. An assertion below keeps
 * that invariant from silently regressing if the v2 row ever changes.
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-rag-v3.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAIRS: { v2Slug: string; slug: string }[] = [
  { v2Slug: "gpt-4-1-rag-v2", slug: "gpt-4-1-rag-v3" },
  { v2Slug: "claude-opus-5-rag-v2", slug: "claude-opus-5-rag-v3" },
  { v2Slug: "gemini-3-1-pro-rag-v2", slug: "gemini-3-1-pro-rag-v3" },
];

async function main() {
  for (const { v2Slug, slug } of PAIRS) {
    const v2 = await prisma.candidateModel.findUnique({
      where: { slug: v2Slug },
    });
    if (!v2) {
      // Fail the whole run rather than registering a partial trio: a v3
      // candidate with no v2 sibling has no baseline to isolate the grammar
      // against.
      throw new Error(
        `v2 sibling ${v2Slug} is not registered - run scripts/register-rag-v2.ts / frontier-fill.ts register first`,
      );
    }

    // "<base> + Igala RAG v3", with <base> taken from the v2 name so display
    // names stay consistent.
    const baseName = v2.name.replace(/\s*\+\s*Igala RAG v2$/i, "");
    const name = `${baseName} + Igala RAG v3`;

    // Copy the v2 decoding verbatim - including Claude's temperature null.
    const v2Decoding =
      v2.decodingParams && typeof v2.decodingParams === "object"
        ? (v2.decodingParams as Record<string, unknown>)
        : {};
    if (v2.provider === "anthropic") {
      if (v2Decoding.temperature !== null) {
        throw new Error(
          `${v2Slug} carries temperature ${String(v2Decoding.temperature)}; Claude Opus 5 rows must opt out with temperature null - fix the v2 row first`,
        );
      }
    } else if (v2Decoding.temperature !== 0) {
      throw new Error(
        `${v2Slug} carries temperature ${String(v2Decoding.temperature)}, expected 0 - fix the v2 row first`,
      );
    }
    // Verbatim copy of the v2 row's JSON (validated just above); the cast is
    // the standard Prisma JSON-input shim, same value in and out.
    const decodingParams = { ...v2Decoding } as Prisma.InputJsonValue;

    const data = {
      name,
      family: v2.family,
      versionLabel: "rag-v3",
      kind: "rag" as const,
      language: v2.language,
      provider: v2.provider,
      baseModelId: v2.baseModelId,
      apiEndpoint: v2.apiEndpoint,
      ragEnabled: true,
      decodingParams,
      // Lineage: the v2 candidate is the parent, so the arena UI shows v3 as
      // a versioned descendant (v1 -> v2 -> v3), same convention as
      // register-rag-v2.ts.
      parentCandidateId: v2.id,
      color: v2.color,
      isPublic: v2.isPublic,
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
      `  ${existing ? "updated" : "CREATED"}  ${slug.padEnd(28)} ${name}  (from ${v2Slug})`,
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
