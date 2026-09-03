/**
 * REPOINT: the six pre-existing Claude candidates still registered against
 * the dead direct Anthropic key (finding 16 of the 2026-09-01 audit). Every
 * generation on these rows has been failing at the key since it died; they
 * are dead weight in the registry until repointed the same way the two v4/
 * v4.1 arms below already are. Re-pointed IN PLACE (slug, id, lineage,
 * existing outputs all survive) - provider -> "openrouter", baseModelId ->
 * the vendor-qualified "anthropic/<model>" id, decodingParams.temperature ->
 * null (Claude Opus 5 rejects the parameter; harmless on Sonnet/Opus 4.8
 * too, since parseDecoding maps null to "omit" for every model).
 *
 * `claude-opus-5-rag` is ALSO taken OUT of the pairing pool
 * (inPairingPool: false) as part of this fix: it was the one dead-key arm
 * still live for pairwise episodes, silently serving failed generations to
 * annotators. See the summary this script prints for confirmation.
 */
const REPOINT_SLUGS = [
  "claude-sonnet-4-5-baseline",
  "claude-sonnet-4-5-rag",
  "claude-opus-5",
  "claude-opus-5-rag",
  "claude-opus-5-rag-v2",
  "claude-opus-5-rag-v3",
] as const;

/** The only repointed slug that must also leave the pairing pool. */
const REMOVE_FROM_POOL = "claude-opus-5-rag";

async function repointDeadKeyArms(provider: string) {
  const summary: string[] = [];
  for (const slug of REPOINT_SLUGS) {
    const row = await prisma.candidateModel.findUnique({ where: { slug } });
    if (!row) {
      console.log(`  SKIP (not found)                            ${slug}`);
      continue;
    }
    if (
      row.provider === provider &&
      row.baseModelId?.startsWith("anthropic/")
    ) {
      console.log(`  already repointed                           ${slug}`);
      continue;
    }
    const bareModelId = row.baseModelId?.startsWith("anthropic/")
      ? row.baseModelId.slice("anthropic/".length)
      : row.baseModelId;
    const qualifiedModelId = `anthropic/${bareModelId}`;
    const existingDecoding =
      row.decodingParams && typeof row.decodingParams === "object"
        ? (row.decodingParams as Record<string, unknown>)
        : {};
    const decodingParams = {
      ...existingDecoding,
      temperature: null,
      maxTokens:
        typeof existingDecoding.maxTokens === "number"
          ? existingDecoding.maxTokens
          : 4096,
    } as Prisma.InputJsonValue;

    const data: Prisma.CandidateModelUpdateInput = {
      provider,
      baseModelId: qualifiedModelId,
      decodingParams,
      apiEndpoint: null,
      ...(slug === REMOVE_FROM_POOL ? { inPairingPool: false } : {}),
    };
    const updated = await prisma.candidateModel.update({
      where: { slug },
      data,
    });

    // verify, do not trust
    const { decoding } = assembleGenerationRequest(
      {
        provider: updated.provider,
        baseModelId: updated.baseModelId,
        ragEnabled: updated.ragEnabled,
        decodingParams: updated.decodingParams,
      },
      { userMessage: "probe" },
    );
    if (updated.provider !== provider) {
      throw new Error(
        `${slug}: provider is ${updated.provider}, expected ${provider}`,
      );
    }
    if (updated.baseModelId !== qualifiedModelId) {
      throw new Error(
        `${slug}: baseModelId is ${updated.baseModelId}, expected ${qualifiedModelId}`,
      );
    }
    if (decoding.temperature !== undefined) {
      throw new Error(
        `${slug}: decoding resolves temperature to ${String(decoding.temperature)}, expected omitted`,
      );
    }
    if (slug === REMOVE_FROM_POOL && updated.inPairingPool) {
      throw new Error(`${slug}: inPairingPool is true, expected false`);
    }
    const line = `  repointed ${slug.padEnd(28)} -> provider=${provider} model=${qualifiedModelId} temperature=OMITTED${
      slug === REMOVE_FROM_POOL ? " inPairingPool=false" : ""
    }`;
    console.log(line);
    summary.push(line);
  }
  return summary;
}

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
  console.log("Repointing the six dead-key Claude arms to openrouter...");
  const repointSummary = await repointDeadKeyArms(PROVIDER);

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

  console.log("\nSummary:");
  if (repointSummary.length === 0) {
    console.log("  all six dead-key arms were already repointed.");
  } else {
    for (const line of repointSummary) console.log(line);
  }
  console.log(
    `  ${REMOVE_FROM_POOL} removed from the pairing pool (inPairingPool: false) - it was the one dead-key arm still serving pairwise episodes on the dead direct key.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
