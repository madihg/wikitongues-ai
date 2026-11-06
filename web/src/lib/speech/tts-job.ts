import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isFrozenPrompt } from "./guard";
import { loadStudioRows } from "./loop-rows";
import { buildTrainingManifest } from "./training-manifest";
import type { SpeechTrainProvider } from "./train-providers";

/**
 * The TTS track's two job launches (PRD US-009), as functions with their
 * database, signer and provider passed in so the routes stay thin and the
 * tests need no network.
 *
 *  - launchTtsJob: a manifest of KEPT studio clips (buildTrainingManifest,
 *    purpose "tts", scope internal: the worker is ours) and a train_tts job.
 *    The callback (src/lib/speech/job-callback.ts) registers the candidate.
 *  - launchSynthesis: up to 50 held-out-safe sentences for one candidate.
 *    Each sentence id is a Prompt id, which is what the callback needs to
 *    store the output as a SpeechRecording row (sourceType derived,
 *    community_only, the model ref in sourceRef).
 */

export const MAX_SYNTH_SENTENCES = 50;
export const TTS_BASE_MODEL = "everyvoice-fastspeech2";

export class TtsJobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TtsJobError";
  }
}

export interface TtsDeps {
  db: Pick<
    PrismaClient,
    "speechRecording" | "speechTrainJob" | "speechCandidate" | "prompt"
  >;
  /** Object key to a readable URL, called ahead of time for each clip. */
  sign: (key: string) => Promise<string>;
  provider: SpeechTrainProvider;
}

/** numSteps and lr are the only knobs the worker reads (worker/igala_speech/jobs.py). */
export function parseTtsHyperparameters(
  raw: unknown,
): { numSteps?: number; lr?: number } | undefined | "invalid" {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const out: { numSteps?: number; lr?: number } = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "numSteps") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1_000_000) return "invalid";
      out.numSteps = v;
    } else if (k === "lr") {
      if (typeof v !== "number" || !(v > 0) || v > 1) return "invalid";
      out.lr = v;
    } else {
      return "invalid";
    }
  }
  return out;
}

async function failJob(deps: TtsDeps, id: string, e: unknown): Promise<never> {
  // Status only: the provider's error text is never copied (it can carry text).
  const message = e instanceof Error ? e.message.slice(0, 200) : "Launch failed";
  await deps.db.speechTrainJob.update({
    where: { id },
    data: { status: "failed", error: message, completedAt: new Date() },
  });
  throw new TtsJobError("The speech worker did not accept the job.", 502);
}

export async function launchTtsJob(
  deps: TtsDeps,
  input: { studioSessionIds: string[]; hyperparameters?: Record<string, unknown>; userId: string },
): Promise<{ jobId: string; clips: number; hours: number; manifestVersion: string }> {
  const rows = await loadStudioRows(deps.db, input.studioSessionIds);

  // Sign ahead of time: the builder's callback is synchronous.
  const keys = [...new Set(rows.map((r) => r.storageKey ?? r.storagePath))];
  const urls = new Map<string, string>();
  await Promise.all(keys.map(async (k) => urls.set(k, await deps.sign(k))));

  const manifest = buildTrainingManifest(rows, {
    scope: "internal",
    purpose: "tts",
    signedUrl: (key) => urls.get(key) ?? "",
  });
  if (manifest.lines.length === 0) {
    throw new TtsJobError("No kept studio clips in those sessions.", 422);
  }

  const hyperparameters = input.hyperparameters;
  const job = await deps.db.speechTrainJob.create({
    data: {
      system: "tts",
      provider: deps.provider.name,
      baseModel: TTS_BASE_MODEL,
      manifestVersion: manifest.version,
      ...(hyperparameters ? { hyperparameters: hyperparameters as object } : {}),
      status: "queued",
      createdById: input.userId,
    },
    select: { id: true },
  });
  try {
    await deps.provider.launch(
      {
        id: job.id,
        kind: "train_tts",
        baseModel: TTS_BASE_MODEL,
        manifestVersion: manifest.version,
        hyperparameters,
      },
      { lines: manifest.lines },
    );
  } catch (e) {
    return failJob(deps, job.id, e);
  }
  await deps.db.speechTrainJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });
  return {
    jobId: job.id,
    clips: manifest.lines.length,
    hours: manifest.hours.total,
    manifestVersion: manifest.version,
  };
}

interface SynthPrompt {
  id: string;
  language: string;
  text: string;
  isHoldout: boolean;
  split: string;
  coldAuthorAnswers: Array<{ answerText: string }>;
}

/** What a model is asked to say for a prompt: the first usable answer, else an Igala prompt's own text. */
function sentenceFor(p: SynthPrompt): string | null {
  const answer = p.coldAuthorAnswers[0]?.answerText?.trim();
  if (answer) return answer.normalize("NFC");
  if (p.language === "igala" && p.text.trim()) return p.text.normalize("NFC").trim();
  return null;
}

export async function launchSynthesis(
  deps: TtsDeps,
  input: { candidateId: string; promptIds?: string[]; userId: string },
): Promise<{ jobId: string; sentences: number }> {
  const candidate = await deps.db.speechCandidate.findUnique({
    where: { id: input.candidateId },
    select: { modelRef: true, system: true },
  });
  if (!candidate || candidate.system !== "tts") {
    throw new TtsJobError("Candidate not found", 404);
  }
  if (input.promptIds && input.promptIds.length > MAX_SYNTH_SENTENCES) {
    throw new TtsJobError(`At most ${MAX_SYNTH_SENTENCES} sentences at a time.`, 400);
  }

  const select = {
    id: true,
    language: true,
    text: true,
    isHoldout: true,
    split: true,
    coldAuthorAnswers: {
      where: { isDemo: false, consentTraining: true },
      orderBy: { id: "asc" as const },
      take: 1,
      select: { answerText: true },
    },
  };
  let prompts: SynthPrompt[];
  if (input.promptIds && input.promptIds.length > 0) {
    prompts = await deps.db.prompt.findMany({
      where: { id: { in: input.promptIds } },
      select,
    });
    // A named frozen prompt is refused outright and without detail (FR-3),
    // whatever the query returned.
    if (prompts.some((p) => isFrozenPrompt(p))) throw new TtsJobError("Forbidden", 403);
    if (prompts.length !== new Set(input.promptIds).size) {
      throw new TtsJobError("Prompt not found", 404);
    }
  } else {
    prompts = await deps.db.prompt.findMany({
      where: {
        language: "igala",
        isHoldout: false,
        split: { not: "test" },
        coldAuthorAnswers: { some: { isDemo: false, consentTraining: true } },
      },
      orderBy: { id: "asc" },
      take: MAX_SYNTH_SENTENCES,
      select,
    });
  }

  const sentences = prompts
    .filter((p) => !isFrozenPrompt(p))
    .map((p) => ({ id: p.id, text: sentenceFor(p) }))
    .filter((s): s is { id: string; text: string } => s.text !== null)
    .slice(0, MAX_SYNTH_SENTENCES);
  if (sentences.length === 0) throw new TtsJobError("No sentences to synthesize.", 422);

  const manifestVersion = createHash("sha256")
    .update(`${candidate.modelRef}\n${sentences.map((s) => s.id).sort().join("\n")}`)
    .digest("hex");
  const job = await deps.db.speechTrainJob.create({
    data: {
      system: "tts",
      provider: deps.provider.name,
      baseModel: candidate.modelRef,
      manifestVersion,
      status: "queued",
      createdById: input.userId,
    },
    select: { id: true },
  });
  try {
    await deps.provider.launch(
      { id: job.id, kind: "synthesize", modelRef: candidate.modelRef, manifestVersion },
      { lines: [], sentences },
    );
  } catch (e) {
    return failJob(deps, job.id, e);
  }
  await deps.db.speechTrainJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });
  return { jobId: job.id, sentences: sentences.length };
}
