import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  eligibleSystems,
  planRounds,
  type PlannedRound,
  type RoundPair,
  type SystemRoundTrip,
} from "../../src/lib/speech/listen-rounds";
import {
  MAX_DURATION_MS,
  REJECTED_REVIEW_STATUSES,
} from "../../src/lib/speech/limits";
import { isAllowedAudioMime, recordingPath } from "../../src/lib/speech/storage";

/**
 * Register a model's synthetic clips as blind Listen rounds for named raters.
 *
 *   npx tsx --env-file=.env.local scripts/speech/publish-listen-candidates.ts
 *       --manifest FILE --clips-dir DIR --raters a@x.org,b@y.org [--dry-run | --apply]
 *
 * The default is a dry run: it reads, plans and prints, and writes nothing.
 * --apply is the only way to write, and it needs the speech_measures
 * migration (the SpeechListenRound table) and SPEECH_STORAGE.
 *
 * What it does, and why each rule is there:
 *  - The gate. Only a system whose round-trip CER is at most twice the CER of
 *    people's clips on the same sentences is published. If none passes, the
 *    script says so and stops: noise does not go in front of a rater.
 *  - Model against person. Each synthetic clip is paired with the person's
 *    clip of the same prompt, in the same language, and nothing else.
 *  - Blind. The side is randomised and balanced per rater, and the model ref
 *    stays in the database. The Listen routes send two clip ids and nothing
 *    more (listen/next/route-rounds.test.ts). A synthetic clip is stored
 *    under the same name pattern as a person's clip (clips/<id>.<ext>), so
 *    the address the browser is sent to tells nothing either; give the
 *    script WebM/Opus files and the file type matches too. No candidate row
 *    is written, so no admin page lists the system. The researcher
 *    Recordings list leaves round clips out.
 *  - Named raters only. A round belongs to one account. The synthetic clips
 *    never enter the open Listen queue. A rater is never given a round whose
 *    human clip is their own voice: they would know which side is the model.
 *  - Repeats. One round in ten comes back at the end with the sides swapped.
 *  - Only what a round needs. A synthetic clip is registered only if at
 *    least one planned round plays it, so no synthetic clip sits in the
 *    database without a rater.
 *  - A human clip that ran into the 30 second cap is left out: its text runs
 *    past its audio, so the model would be judged on words the person never
 *    reached.
 *  - Idempotent. A clip is one row per (model ref, prompt); a round is one
 *    row per (rater, clip, repeat). Running it twice changes nothing.
 *  - Reversible. scripts/speech/withdraw-listen-batch.ts takes a batch out of
 *    Listen again without deleting a row.
 *
 * The clips come from weights under CC BY-NC 4.0. syntheticClipRow is the one
 * place their row is shaped: sourceType derived, community_only, rights
 * restricted, no consent record, no speaker, no review verdict, the licence
 * and "internal prototype, not for release" in sourceLicense. Each of those
 * alone keeps the row out of every export and every training manifest
 * (export-paths.test.ts proves it on this exact shape).
 *
 * Output is ids and counts, never text or audio.
 */

export const PROTOTYPE_LICENCE =
  "CC BY-NC 4.0 (facebook/mms-tts-yor). Internal prototype, not for release.";

export interface ManifestClip {
  /** Prompt.id of the sentence. */
  promptId: string;
  /** The person's clip of that sentence the model is played against. */
  humanRecordingId: string;
  /** File name inside --clips-dir. */
  file: string;
  /** The file's type. WebM/Opus makes it look like any recorded clip. */
  mimeType: string;
  durationMs: number;
  sampleRate: number;
}

export interface PublishManifest {
  batch: string;
  /** Must say the clips are an internal prototype; the script checks. */
  notice: string;
  systems: Array<SystemRoundTrip & { clips: ManifestClip[] }>;
}

export interface HumanClip {
  id: string;
  durationMs: number;
  promptId: string;
  language: string;
  annotatorId: string | null;
  uploadedAt: Date | null;
  reviewStatus: string | null;
  isDemo: boolean;
  sourceType: string;
  prompt: { isHoldout: boolean; split: string };
}

export interface PublishPlan {
  batch: string;
  eligible: SystemRoundTrip[];
  refused: SystemRoundTrip[];
  /** Synthetic clips to register, one per (system, prompt). */
  clips: Array<ManifestClip & { systemRef: string; candidateKey: string }>;
  /** Clips left out, by reason. */
  skipped: Record<string, number>;
  rounds: PlannedRound[];
  skippedOwnVoice: number;
}

const strip = (s: SystemRoundTrip & { clips?: unknown }): SystemRoundTrip => ({
  systemRef: s.systemRef,
  systemCer: s.systemCer,
  humanCer: s.humanCer,
  nSentences: s.nSentences,
});

/** The pure core: what would be published, for whom. No database, no files. */
export function planPublish(
  manifest: PublishManifest,
  humans: HumanClip[],
  raterIds: string[],
): PublishPlan {
  if (!/internal prototype/i.test(manifest.notice ?? "")) {
    throw new Error('The manifest must carry the notice "internal prototype, not for release".');
  }
  const gate = eligibleSystems(manifest.systems.map(strip));
  const ok = new Set(gate.eligible.map((s) => s.systemRef));
  const byId = new Map(humans.map((h) => [h.id, h]));
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  const clips: PublishPlan["clips"] = [];
  const pairs: RoundPair[] = [];
  const seen = new Set<string>();

  for (const system of manifest.systems) {
    if (!ok.has(system.systemRef)) continue;
    for (const c of system.clips) {
      const candidateKey = `${system.systemRef}:${c.promptId}`;
      const h = byId.get(c.humanRecordingId);
      if (seen.has(candidateKey)) skip("duplicate_in_manifest");
      else if (!h) skip("human_clip_not_found");
      else if (h.promptId !== c.promptId) skip("human_clip_on_another_prompt");
      else if (h.sourceType === "derived") skip("human_clip_is_synthetic");
      else if (h.isDemo) skip("human_clip_is_demo");
      else if (h.uploadedAt === null) skip("human_clip_not_uploaded");
      else if (h.durationMs >= MAX_DURATION_MS) skip("human_clip_cut_at_the_cap");
      else if (h.reviewStatus && REJECTED_REVIEW_STATUSES.includes(h.reviewStatus)) {
        skip("human_clip_rejected_or_withdrawn");
      } else if (h.prompt.isHoldout || h.prompt.split === "test") skip("frozen_prompt");
      else {
        seen.add(candidateKey);
        clips.push({ ...c, systemRef: system.systemRef, candidateKey });
        pairs.push({
          promptId: c.promptId,
          language: h.language,
          humanRecordingId: h.id,
          humanSpeakerId: h.annotatorId,
          candidateKey,
          systemRef: system.systemRef,
        });
      }
    }
  }
  const plan = planRounds({ seed: manifest.batch, raterIds, pairs });
  const played = new Set(plan.rounds.map((r) => r.candidateKey));
  return {
    batch: manifest.batch,
    eligible: gate.eligible,
    refused: gate.refused,
    // Only the clips a planned round plays are registered.
    clips: clips.filter((c) => played.has(c.candidateKey)),
    skipped,
    rounds: plan.rounds,
    skippedOwnVoice: plan.skippedOwnVoice,
  };
}

/**
 * The SpeechRecording row of one synthetic clip. Every field that marks it as
 * not a person's recording is set here and nowhere else.
 */
export function syntheticClipRow(c: {
  id: string;
  promptId: string;
  systemRef: string;
  mimeType: string;
  durationMs: number;
  sampleRate: number;
  sizeBytes: number;
  checksumSha256: string;
}) {
  if (!isAllowedAudioMime(c.mimeType)) throw new Error(`Unsupported audio type: ${c.mimeType}`);
  // Named like any clip, so the address the browser plays tells nothing.
  const key = recordingPath(c.id, c.mimeType);
  return {
    id: c.id,
    promptId: c.promptId,
    storagePath: key,
    storageKey: key,
    language: "igala",
    mimeType: c.mimeType,
    durationMs: c.durationMs,
    sampleRate: c.sampleRate,
    sizeBytes: c.sizeBytes,
    checksumSha256: c.checksumSha256,
    // Set once the audio is in the bucket: until then nothing can play it.
    uploadedAt: null as Date | null,
    tier: "community_only" as const,
    sourceType: "derived" as const,
    sourceRef: c.systemRef,
    sourceLicense: PROTOTYPE_LICENCE,
    rightsStatus: "restricted" as const,
    voiceCloningOptIn: false,
    speakerIdOptIn: false,
    isTestSet: false,
    isDemo: false,
    // No speaker, no answer, no consent record, no review verdict: a
    // synthetic clip has none of them.
    annotatorId: null,
    coldAuthorAnswerId: null,
    consentId: null,
    reviewStatus: null,
  };
}

/** The lines the dry run prints. Ids and counts only. */
export function describePlan(plan: PublishPlan, raters: Array<{ id: string; email: string }>): string[] {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const out: string[] = [`batch ${plan.batch}`];
  for (const s of plan.eligible) {
    out.push(
      `PASSES the gate: ${s.systemRef} (round-trip CER ${pct(s.systemCer)}, people ${pct(s.humanCer)}, ${s.nSentences} sentences)`,
    );
  }
  for (const s of plan.refused) {
    out.push(
      `REFUSED by the gate: ${s.systemRef} (round-trip CER ${pct(s.systemCer)} is more than twice people's ${pct(s.humanCer)}, ${s.nSentences} sentences)`,
    );
  }
  if (plan.eligible.length === 0) {
    out.push("No system passed the gate. Nothing to publish.");
    return out;
  }
  out.push(`synthetic clips to register: ${plan.clips.length}`);
  for (const [reason, n] of Object.entries(plan.skipped)) out.push(`  left out, ${reason}: ${n}`);
  if (plan.skippedOwnVoice > 0) {
    out.push(`rounds left out because the human clip is the rater's own voice: ${plan.skippedOwnVoice}`);
  }
  for (const r of raters) {
    const mine = plan.rounds.filter((x) => x.raterId === r.id);
    const first = mine.filter((x) => !x.isRepeat);
    out.push(
      `rater ${r.email}: ${mine.length} rounds (${first.length} first, ${mine.length - first.length} repeats), ` +
        `model on A in ${first.filter((x) => x.candidateIsA).length} of ${first.length}`,
    );
  }
  return out;
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = arg(args, "--manifest");
  const clipsDir = arg(args, "--clips-dir");
  const emails = (arg(args, "--raters") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const apply = args.includes("--apply");
  if (apply && args.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  if (!manifestPath || !clipsDir || emails.length === 0) {
    throw new Error(
      "usage: publish-listen-candidates.ts --manifest FILE --clips-dir DIR --raters a@x,b@y [--dry-run | --apply]",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PublishManifest;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const missing = emails.filter((e) => !users.some((u) => u.email?.toLowerCase() === e));
    if (missing.length > 0) throw new Error(`No account for: ${missing.join(", ")}`);
    const raters = users.map((u) => ({ id: u.id, email: u.email ?? u.id }));

    const humanIds = [...new Set(manifest.systems.flatMap((s) => s.clips.map((c) => c.humanRecordingId)))];
    const humans = await prisma.speechRecording.findMany({
      where: { id: { in: humanIds } },
      select: {
        id: true,
        durationMs: true,
        promptId: true,
        language: true,
        annotatorId: true,
        uploadedAt: true,
        reviewStatus: true,
        isDemo: true,
        sourceType: true,
        prompt: { select: { isHoldout: true, split: true } },
      },
    });
    const plan = planPublish(manifest, humans, raters.map((r) => r.id));
    console.log((apply ? "APPLY" : "DRY RUN: nothing is written") + "\n" + describePlan(plan, raters).join("\n"));
    if (!apply || plan.eligible.length === 0) return;

    const { putClip, storageEnabled } = await import("../../src/lib/speech/storage-supabase");
    if (!storageEnabled()) throw new Error("SPEECH_STORAGE is off: a synthetic clip has no bytes column to fall back on.");

    // 1. One recording per (model ref, prompt). An existing row is reused. The
    // row comes first with no upload time, then the audio, then the upload
    // time: a run that dies in between leaves nothing playable, and the next
    // run finishes the job.
    const recordingOf = new Map<string, string>();
    let createdClips = 0;
    for (const c of plan.clips) {
      const data = new Uint8Array(readFileSync(join(clipsDir, c.file)));
      let row = await prisma.speechRecording.findFirst({
        where: { sourceType: "derived", sourceRef: c.systemRef, promptId: c.promptId },
        orderBy: { createdAt: "asc" },
        select: { id: true, storageKey: true, mimeType: true, uploadedAt: true },
      });
      if (!row) {
        row = await prisma.speechRecording.create({
          data: syntheticClipRow({
            id: randomUUID(),
            promptId: c.promptId,
            systemRef: c.systemRef,
            mimeType: c.mimeType,
            durationMs: c.durationMs,
            sampleRate: c.sampleRate,
            sizeBytes: data.length,
            checksumSha256: createHash("sha256").update(data).digest("hex"),
          }),
          select: { id: true, storageKey: true, mimeType: true, uploadedAt: true },
        });
        createdClips++;
      }
      if (row.uploadedAt === null && row.storageKey) {
        await putClip(row.storageKey, data, row.mimeType).catch((e: unknown) => {
          // A run that died after the upload: the object is already there.
          if (!(e instanceof Error) || !/exists|duplicate/i.test(e.message)) throw e;
        });
        await prisma.speechRecording.update({
          where: { id: row.id },
          data: { uploadedAt: new Date() },
          select: { id: true },
        });
      }
      recordingOf.set(c.candidateKey, row.id);
    }

    // 2. The rounds. The unique key (rater, clip, repeat) makes a second run a no-op.
    const created = await prisma.speechListenRound.createMany({
      data: plan.rounds.map((r) => ({
        batch: plan.batch,
        raterId: r.raterId,
        promptId: r.promptId,
        language: r.language,
        humanRecordingId: r.humanRecordingId,
        candidateRecordingId: recordingOf.get(r.candidateKey)!,
        systemRef: r.systemRef,
        candidateIsA: r.candidateIsA,
        isRepeat: r.isRepeat,
        position: r.position,
      })),
      skipDuplicates: true,
    });
    console.log(`wrote ${createdClips} clip(s) and ${created.count} round(s); the rest already existed`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("publish-listen-candidates.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
