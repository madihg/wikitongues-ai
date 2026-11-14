import { writeFileSync } from "node:fs";
import {
  buildFirstModelPlan,
  DEFAULT_HELD_TIERS,
  type FirstModelPlan,
} from "../../src/lib/speech/first-model-plan";
import { loadTrainableRows } from "../../src/lib/speech/loop-rows";
import type { LoopRow } from "../../src/lib/speech/training-manifest";
import { assertOutsideRepo } from "./export-manifest";

/**
 * Build the plan for the first internal voice model (the fine-tune stage of
 * worker/first_model.py), through the app's one training guard.
 *
 *   npx tsx --env-file=.env.local scripts/speech/first-model-plan.ts
 *       [--out FILE] [--voice spk_...] [--release-held-tier open]
 *       [--epochs 200] [--batch-size 8] [--run-id proto-...]
 *
 * Read-only. Without --out it prints counts and writes nothing: how many
 * clips are cleared for voice training, and why the others are not. With
 * --out it also writes the plan (signed URLs, valid for an hour, and the
 * locked transcripts), so --out refuses any path inside this repository.
 *
 * A clip is cleared only if canTrain says so for voice cloning: a Check
 * verdict of keep, consent, the clip's own voice-cloning opt-in. Clips on the
 * Open tier are held back unless --release-held-tier open is given, which is
 * for the day the speaker has confirmed that choice and not before.
 */

export interface PlanFile {
  runId: string;
  system: string;
  guard: FirstModelPlan["guard"];
  manifestVersion: string;
  voice: string | null;
  seed: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  train: Array<{ id: string; text: string; url: string }>;
  /** What the tuned model is asked to say: the held-out sentences. */
  sentences: Array<{ promptId: string; text: string; humanLufs: null }>;
}

/** The pure core: rows in, the plan file and the printed counts out. */
export function firstModelPlanFile(
  rows: LoopRow[],
  opts: {
    signedUrl: (key: string) => string;
    promptIdOf: (recordingId: string) => string | undefined;
    heldTiers?: readonly string[];
    voice?: string;
    runId: string;
    epochs: number;
    batchSize: number;
  },
): { file: PlanFile; counts: FirstModelPlan["counts"]; heldOut: number } {
  const plan = buildFirstModelPlan(rows, {
    signedUrl: opts.signedUrl,
    heldTiers: opts.heldTiers,
    voice: opts.voice,
  });
  return {
    counts: plan.counts,
    heldOut: plan.heldOut.length,
    file: {
      runId: opts.runId,
      system: "mms-tts-yor-igala-ft",
      guard: plan.guard,
      manifestVersion: plan.manifestVersion,
      voice: plan.voice,
      seed: 13,
      epochs: opts.epochs,
      batchSize: Math.max(1, Math.min(opts.batchSize, plan.train.length)),
      learningRate: 2e-5,
      train: plan.train.map((l) => ({ id: l.id, text: l.transcript, url: l.url })),
      sentences: plan.heldOut.flatMap((l) => {
        const promptId = opts.promptIdOf(l.id);
        return promptId ? [{ promptId, text: l.transcript, humanLufs: null }] : [];
      }),
    },
  };
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const out = arg(args, "--out");
  const target = out ? assertOutsideRepo(out) : null;
  const release = arg(args, "--release-held-tier");
  const heldTiers = DEFAULT_HELD_TIERS.filter((t) => t !== release);

  const { PrismaClient } = await import("@prisma/client");
  const { signedUrl } = await import("../../src/lib/speech/storage-supabase");
  const prisma = new PrismaClient();
  try {
    const [rows, all] = await Promise.all([
      loadTrainableRows(prisma),
      prisma.speechRecording.groupBy({
        by: ["language", "tier", "voiceCloningOptIn", "reviewStatus"],
        where: { isDemo: false, sourceType: "contributor" },
        _count: { _all: true },
      }),
    ]);
    console.error("Every contributor clip, by language, tier, cloning opt-in and Check verdict:");
    for (const g of all) {
      console.error(
        `  ${g.language} ${g.tier} cloning=${g.voiceCloningOptIn} check=${g.reviewStatus ?? "none"}: ${g._count._all}`,
      );
    }
    const keys = [...new Set(rows.map((r) => r.storageKey ?? r.storagePath))];
    const urls = new Map<string, string>();
    if (target) {
      await Promise.all(keys.map(async (k) => urls.set(k, await signedUrl(k))));
    }
    const prompts = await prisma.speechRecording.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, promptId: true },
    });
    const promptOf = new Map(prompts.map((p) => [p.id, p.promptId]));
    const { file, counts, heldOut } = firstModelPlanFile(rows, {
      signedUrl: (k) => urls.get(k) ?? "",
      promptIdOf: (id) => promptOf.get(id),
      heldTiers,
      voice: arg(args, "--voice"),
      runId: arg(args, "--run-id") ?? `proto-${new Date().toISOString().slice(0, 10)}`,
      epochs: Number(arg(args, "--epochs") ?? 200),
      batchSize: Number(arg(args, "--batch-size") ?? 8),
    });
    console.error(
      `Kept by Check and loaded: ${counts.rows}. Refused by the guard: ${JSON.stringify(counts.refused)}. ` +
        `Held tier (${heldTiers.join(", ") || "none"}): ${counts.heldTier}. Not Igala: ${counts.notIgala}. ` +
        `Other voices: ${counts.otherVoice}.`,
    );
    console.error(
      `Cleared for voice training: ${file.train.length} clip(s) to train, ${heldOut} held out, voice ${file.voice ?? "none"}.`,
    );
    if (file.train.length === 0) {
      console.error("Nothing to train on. No plan written.");
      return;
    }
    if (target) {
      writeFileSync(target, JSON.stringify(file), { mode: 0o600 });
      console.error(`Wrote ${target}. The signed URLs expire in an hour.`);
    } else {
      console.error("Dry run: pass --out FILE (outside the repository) to write the plan.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("first-model-plan.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
