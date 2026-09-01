/**
 * Register the two Claude Opus 5 arms served through OPENROUTER.
 *
 * WHY OPENROUTER: the direct Anthropic key is dead. Every Claude row in the
 * registry still points at provider "anthropic" and model id "claude-opus-5",
 * so every Claude generation fails at the key. OpenRouter serves the same
 * model under a vendor-qualified id ("anthropic/claude-opus-5") behind an
 * OpenAI-compatible endpoint, with its own funded key - see the `openrouter`
 * case in src/lib/arena/providers.ts.
 *
 * WHY provider "openrouter" AND NOT "openai-compatible": the costs route
 * (src/app/api/arena/costs/route.ts) attributes inference spend by
 * CandidateModel.provider first and only sniffs the model id when the row has
 * none. Registering these arms as "openrouter" is precisely what makes the
 * OpenRouter burn-down line up against the OpenRouter credit purchases instead
 * of being silently booked to Anthropic or to Together.
 *
 * DECODING - temperature OMITTED: Claude Opus 5 REJECTS the temperature
 * parameter ("`temperature` is deprecated for this model"), through OpenRouter
 * exactly as directly. decodingParams temperature null is the sanctioned
 * opt-out: parseDecoding maps null to undefined and the AI SDK then leaves the
 * field off the wire. The rows are read back and run through the REAL request
 * assembly below to prove the omission, rather than trusting the JSON to mean
 * what it says (providers-openrouter.test.ts pins the same invariant at the
 * wire level).
 *
 * TWO ARMS:
 *   claude-opus-5-rag-v4    rag-v4    "Claude Opus 5 + Igala RAG v4"
 *   claude-opus-5-rag-v4-1  rag-v4-1  "Claude Opus 5 + Igala RAG v4.1"
 * The v4 row already exists from an earlier registration against the dead
 * Anthropic key; it is UPDATED in place (provider + model id) rather than
 * duplicated, so its existing outputs and lineage survive. The script prints
 * CREATED or updated per row so which one happened is never a guess.
 *
 * inPairingPool FALSE on both, explicitly: these arms enter as measured
 * candidates: pairwise episodes keep drawing from the existing pool until the
 * flag is flipped as a data edit (house rule: pool membership is a DB flag,
 * never a hardcoded slug list).
 *
 * Idempotent: upsert by slug, safe to re-run.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/register-claude-openrouter.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assembleGenerationRequest } from "@/lib/arena/providers";

const PROVIDER = "openrouter";
/** Vendor-qualified, as OpenRouter requires. */
const MODEL_ID = "anthropic/claude-opus-5";
/** null = OMIT. See the header. */
const DECODING = { temperature: null, maxTokens: 4096 };

const V3_SLUG = "claude-opus-5-rag-v3";

const ARMS = [
  {
    slug: "claude-opus-5-rag-v4",
    name: "Claude Opus 5 + Igala RAG v4",
    versionLabel: "rag-v4",
    /** Lineage parent slug: v4 descends from v3, v4.1 from v4. */
    parentSlug: V3_SLUG,
  },
  {
    slug: "claude-opus-5-rag-v4-1",
    name: "Claude Opus 5 + Igala RAG v4.1",
    versionLabel: "rag-v4-1",
    parentSlug: "claude-opus-5-rag-v4",
  },
] as const;

/** Colour of the Claude RAG lineage, kept consistent across v2/v3/v4. */
const COLOR = "#e09a58";

async function main() {
  const idBySlug = new Map<string, string>();

  // v4 is upserted before v4.1, so v4.1 can resolve its parent id from the
  // row this same run just wrote (list order is load-bearing).
  for (const arm of ARMS) {
    const parent = arm.parentSlug
      ? await prisma.candidateModel.findUnique({
          where: { slug: arm.parentSlug },
          select: { id: true },
        })
      : null;
    const parentCandidateId =
      parent?.id ?? idBySlug.get(arm.parentSlug) ?? null;

    const data = {
      name: arm.name,
      family: "claude",
      versionLabel: arm.versionLabel,
      kind: "rag" as const,
      language: "igala",
      provider: PROVIDER,
      baseModelId: MODEL_ID,
      // null = use the base URL pinned in providers.ts. Not repeated here, so
      // the host lives in exactly one place.
      apiEndpoint: null,
      ragEnabled: true,
      decodingParams: DECODING as Prisma.InputJsonValue,
      parentCandidateId,
      color: COLOR,
      isPublic: true,
      inPairingPool: false,
      archived: false,
    };

    const existing = await prisma.candidateModel.findUnique({
      where: { slug: arm.slug },
      select: { id: true, provider: true, baseModelId: true },
    });
    const row = await prisma.candidateModel.upsert({
      where: { slug: arm.slug },
      update: data,
      create: { ...data, slug: arm.slug },
    });
    idBySlug.set(arm.slug, row.id);

    const verb = existing
      ? `updated (was ${existing.provider} / ${existing.baseModelId})`
      : "CREATED";
    console.log(`  ${verb.padEnd(46)} ${arm.slug.padEnd(24)} ${arm.name}`);
  }

  // ─── verify, do not trust ────────────────────────────────────────────────
  for (const arm of ARMS) {
    const row = await prisma.candidateModel.findUniqueOrThrow({
      where: { slug: arm.slug },
    });
    if (row.provider !== PROVIDER) {
      throw new Error(
        `${arm.slug}: provider is ${row.provider}, expected ${PROVIDER}`,
      );
    }
    if (row.baseModelId !== MODEL_ID) {
      throw new Error(
        `${arm.slug}: baseModelId is ${row.baseModelId}, expected the vendor-qualified ${MODEL_ID}`,
      );
    }
    if (row.inPairingPool) {
      throw new Error(`${arm.slug}: inPairingPool is true, expected false`);
    }
    if (row.versionLabel !== arm.versionLabel) {
      throw new Error(
        `${arm.slug}: versionLabel is ${String(row.versionLabel)}, expected ${arm.versionLabel}`,
      );
    }
    // The invariant that matters at request time: the stored decoding must
    // resolve to NO temperature at all through the real assembly path, not
    // merely to a null in the JSON.
    const { decoding } = assembleGenerationRequest(
      {
        provider: row.provider,
        baseModelId: row.baseModelId,
        ragEnabled: row.ragEnabled,
        decodingParams: row.decodingParams,
      },
      { userMessage: "probe" },
    );
    if (decoding.temperature !== undefined) {
      throw new Error(
        `${arm.slug}: decoding resolves temperature to ${String(decoding.temperature)}; ` +
          `Claude Opus 5 rejects the parameter, so decodingParams.temperature must be null`,
      );
    }
    console.log(
      `  ok  ${arm.slug.padEnd(24)} provider=${row.provider} model=${row.baseModelId} temperature=OMITTED inPairingPool=false`,
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
