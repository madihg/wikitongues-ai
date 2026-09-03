/**
 * Derived tone-stripped arms (option d2 groundwork,
 * tasks/project-audit-2026-09-01.md finding 5: "the v4 to v4.1 gain is tone-
 * mark density, not grammar").
 *
 * For each of two parent candidates, this script mints a sibling
 * CandidateModel under provider "derived" whose every ModelOutput is
 * `stripToneMarks(parent output text)` - a cheap, deterministic, $0 control
 * for "how much of the parent's score is tone density?" that needs no model
 * call:
 *
 *   (a) "Gemini 3.1 Pro + Igala RAG v4 (tone-stripped)"
 *       slug gemini-3-1-pro-rag-v4-tonestrip, parent gemini-3-1-pro-rag-v4
 *   (b) "Gemini 3.1 Pro (tone-stripped)"
 *       slug gemini-3-1-pro-tonestrip, parent gemini-3-1-pro
 *
 * provider "derived" is the load-bearing fact here: nothing ever SERVES a
 * derived arm live (no API key, no baseModelId that resolves to a real
 * provider). It exists only to be scored. The chat picker's ranking source
 * and the chat route both exclude it (chat-picker.ts / api/arena/chat -
 * tested there), so a derived arm can never reach a reviewer or a chat
 * window - it can only reach the scoreboard.
 *
 * SCOPE: every ModelOutput the parent has, frozen (isHoldout) AND train
 * prompts alike - not filtered by split, so a derived sibling is complete for
 * whatever the parent has generated so far. Re-run after the parent gains
 * more outputs to backfill the new ones.
 *
 * COPIED, NOT RECOMPUTED: tokenCountIn/tokenCountOut are 0 (nothing was
 * generated), latencyMs is 0 (nothing was called), ragContextIds and
 * evalRunId are copied from the parent row untouched - a derived output
 * carries the same retrieval audit trail as the answer it was stripped from.
 *
 * IDEMPOTENT: skipped by (derived candidate, promptId) - a derived output
 * that already exists for a prompt is never re-created or overwritten, so a
 * second run only backfills prompts the parent has gained since the first.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/derive-tone-stripped-arms.ts
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripToneMarks } from "@/lib/eval/tone";

/** provider "derived": never resolves to a real API - see module doc. */
export const DERIVED_PROVIDER = "derived";

interface DerivedArmSpec {
  parentSlug: string;
  slug: string;
  name: string;
}

const ARMS: DerivedArmSpec[] = [
  {
    parentSlug: "gemini-3-1-pro-rag-v4",
    slug: "gemini-3-1-pro-rag-v4-tonestrip",
    name: "Gemini 3.1 Pro + Igala RAG v4 (tone-stripped)",
  },
  {
    parentSlug: "gemini-3-1-pro",
    slug: "gemini-3-1-pro-tonestrip",
    name: "Gemini 3.1 Pro (tone-stripped)",
  },
];

async function registerDerivedCandidate(
  parent: NonNullable<
    Awaited<ReturnType<typeof prisma.candidateModel.findUnique>>
  >,
  spec: DerivedArmSpec,
) {
  const data = {
    name: spec.name,
    family: parent.family,
    versionLabel: parent.versionLabel,
    kind: parent.kind,
    language: parent.language,
    // Never a real endpoint: provider "derived" + the parent's baseModelId
    // labelled for what it is, so nothing here can be mistaken for a live
    // route and nothing here can accidentally be called.
    provider: DERIVED_PROVIDER,
    baseModelId: `derived:${parent.baseModelId}`,
    apiEndpoint: null,
    ragEnabled: parent.ragEnabled,
    decodingParams: (parent.decodingParams ?? undefined) as
      Prisma.InputJsonValue | undefined,
    parentCandidateId: parent.id,
    color: parent.color,
    isPublic: false,
    // A derived arm is a measurement device, not a candidate for human
    // judgement - it never enters the pairing pool.
    inPairingPool: false,
  };

  return prisma.candidateModel.upsert({
    where: { slug: spec.slug },
    update: data,
    create: { ...data, slug: spec.slug },
  });
}

async function deriveArm(spec: DerivedArmSpec): Promise<number> {
  const parent = await prisma.candidateModel.findUnique({
    where: { slug: spec.parentSlug },
  });
  if (!parent) {
    throw new Error(
      `${spec.parentSlug} is not registered - cannot derive ${spec.slug}`,
    );
  }

  const derived = await registerDerivedCandidate(parent, spec);

  const parentOutputs = await prisma.modelOutput.findMany({
    where: { candidateModelId: parent.id, isDemo: false },
    select: {
      promptId: true,
      model: true,
      bucket: true,
      outputText: true,
      ragContextIds: true,
      evalRunId: true,
      epochId: true,
    },
  });

  const existing = await prisma.modelOutput.findMany({
    where: { candidateModelId: derived.id },
    select: { promptId: true },
  });
  const done = new Set(existing.map((e) => e.promptId));

  let created = 0;
  for (const out of parentOutputs) {
    if (done.has(out.promptId)) continue;
    await prisma.modelOutput.create({
      data: {
        promptId: out.promptId,
        model: out.model,
        modelId: derived.baseModelId,
        candidateModelId: derived.id,
        evalRunId: out.evalRunId,
        epochId: out.epochId,
        bucket: out.bucket,
        outputText: stripToneMarks(out.outputText),
        ragContextIds: out.ragContextIds,
        tokenCountIn: 0,
        tokenCountOut: 0,
        latencyMs: 0,
        isDemo: false,
      },
    });
    created++;
  }

  console.log(
    `  ${spec.slug.padEnd(34)} created=${created} existing=${done.size} (parent had ${parentOutputs.length})`,
  );
  return created;
}

async function main() {
  console.log("derive-tone-stripped-arms: minting derived ModelOutput rows");
  const counts: Record<string, number> = {};
  for (const spec of ARMS) {
    counts[spec.slug] = await deriveArm(spec);
  }
  console.log("\nSUMMARY (created per derived arm):");
  for (const [slug, n] of Object.entries(counts)) {
    console.log(`  ${slug.padEnd(34)} ${n}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
