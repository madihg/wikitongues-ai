/**
 * Operational runner for the OpenAI SFT experiment (Rung C, second attempt).
 *
 * Why a script and not just the API routes: the routes require an authenticated
 * researcher session and a running server, and a fine-tune is a long-lived,
 * resumable operation. Every step below calls exactly the same library code the
 * routes call - loadSftSourceRows + buildSftExamples for the dataset,
 * getFineTuneProvider() for launch/poll, registerFineTuneOutput() for the
 * flywheel close, generateForCandidate() for generation - so a run driven from
 * here is indistinguishable from one driven through the UI.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/openai-sft-run.ts <step>
 * Steps:
 *   create    create the draft job and build the dataset (no spend)
 *   preview   print the JSONL that WOULD be uploaded, plus contamination checks
 *   launch    upload + start the fine-tune (spends money)
 *   poll      poll to completion, then auto-register the candidate
 *   generate  generate the tuned model's answers on the frozen bank
 *   metrics   purity table + side-by-side samples
 *   arena     confirm blind tuned-vs-baseline pairs are now assignable
 */

import { prisma } from "@/lib/prisma";
import { loadSftSourceRows } from "@/lib/arena/sft-source";
import { buildSftExamples } from "@/lib/arena/training-export";
import {
  buildTrainingJsonl,
  getFineTuneProvider,
} from "@/lib/arena/fine-tune-providers";
import { registerFineTuneOutput } from "@/lib/arena/register-fine-tune";
import { generateForCandidate } from "@/lib/arena/providers";
import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";
import { purityMetrics } from "@/lib/arena/purity";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";
import { assignedPair } from "@/lib/pairing";
import type { FineTuneJob } from "@prisma/client";

const BASE_MODEL = "gpt-4.1-mini-2025-04-14";
const BASE_CANDIDATE_SLUG_HINT = "gpt-4.1-mini";
const CANDIDATE_NAME = "GPT-4.1 mini SFT (Igala cold-gold)";
// Deterministic decoding, matching the Rung A probe so the numbers compare.
const DECODING = { temperature: 0, maxTokens: 1024 };

function log(...args: unknown[]) {
  console.log(...args);
}

/** The one open OpenAI job for this experiment, newest first. */
async function currentJob(): Promise<FineTuneJob | null> {
  return prisma.fineTuneJob.findFirst({
    where: { provider: "openai", language: "igala" },
    orderBy: { createdAt: "desc" },
  });
}

async function jobWithRelations(id: string) {
  return prisma.fineTuneJob.findUniqueOrThrow({
    where: { id },
    include: {
      baseCandidate: {
        select: {
          id: true,
          name: true,
          provider: true,
          family: true,
          decodingParams: true,
        },
      },
      outputCandidate: { select: { id: true } },
    },
  });
}

// ─── create ──────────────────────────────────────────────────

async function stepCreate() {
  const existing = await currentJob();
  if (existing) {
    log(`job already exists: ${existing.id} (status ${existing.status})`);
    return;
  }

  const baseCandidate = await prisma.candidateModel.findFirst({
    where: {
      language: "igala",
      provider: "openai",
      baseModelId: { contains: BASE_CANDIDATE_SLUG_HINT },
      archived: false,
    },
    select: { id: true, name: true },
  });

  const researcher = await prisma.user.findFirst({
    where: { role: "RESEARCHER" },
    select: { id: true, email: true },
  });

  // Freeze the held-out bank exactly as POST /api/arena/jobs does.
  const holdout = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true },
  });

  const job = await prisma.fineTuneJob.create({
    data: {
      method: "sft",
      provider: "openai",
      baseModelId: BASE_MODEL,
      baseCandidateId: baseCandidate?.id ?? null,
      language: "igala",
      trainingFormat: "openai-chat",
      systemPrompt: IGALA_FORCING_INSTRUCTION,
      sourcePairwiseIds: [],
      sourceEditIds: [],
      holdoutPromptIds: holdout.map((p) => p.id),
      bucketFilter: [],
      hyperparameters: { nEpochs: 3 },
      status: "draft",
      triggeredById: researcher?.id ?? null,
    },
  });
  log(
    `created job ${job.id} base=${BASE_MODEL} baseCandidate=${baseCandidate?.name ?? "none"} holdout=${holdout.length}`,
  );

  // Build the dataset through the same path the build route uses.
  await prisma.fineTuneJob.update({
    where: { id: job.id },
    data: { status: "building_dataset" },
  });
  const rows = await loadSftSourceRows(job);
  const examples = buildSftExamples(rows, {});
  await prisma.fineTuneJob.update({
    where: { id: job.id },
    data: {
      nTrainingRows: examples.length,
      datasetUri: `mem://job/${job.id}.jsonl`,
      status: "queued",
    },
  });
  log(
    `dataset built: ${rows.length} source rows -> ${examples.length} training examples`,
  );
}

// ─── preview / contamination checks ──────────────────────────

async function stepPreview() {
  const job = await currentJob();
  if (!job) throw new Error("no job - run `create` first");

  const rows = await loadSftSourceRows(job);
  const examples = buildSftExamples(rows, {});
  const jsonl = await buildTrainingJsonl(job);
  const lines = jsonl.split("\n").filter(Boolean);

  const frozen = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, promptId: true, text: true, isHoldout: true },
  });
  const frozenTexts = new Set(frozen.map((p) => p.text.trim()));
  const frozenIds = new Set(frozen.map((p) => p.id));

  // 1. No source row that survived the builder points at a frozen prompt.
  const heldOutSourceRows = rows.filter((r) => r.isHoldout).length;
  const leakedByPromptId = rows.filter(
    (r) => frozenIds.has(r.promptId) && !r.isHoldout,
  ).length;

  // 2. No training line's user turn is a frozen prompt's text.
  let leakedByText = 0;
  let missingSystem = 0;
  let englishInTarget = 0;
  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      messages: { role: string; content: string }[];
    };
    const system = parsed.messages.find((m) => m.role === "system");
    const user = parsed.messages.find((m) => m.role === "user");
    const assistant = parsed.messages.find((m) => m.role === "assistant");
    if (!system || system.content !== IGALA_FORCING_INSTRUCTION)
      missingSystem++;
    if (user && frozenTexts.has(user.content.trim())) leakedByText++;
    if (
      assistant &&
      /\b(english|gloss|means|translation)\b/i.test(assistant.content)
    ) {
      englishInTarget++;
    }
  }

  log("── contamination + format checks ──");
  log(`frozen/test prompts:                 ${frozen.length}`);
  log(`source rows loaded:                  ${rows.length}`);
  log(
    `  of which flagged isHoldout:        ${heldOutSourceRows} (all dropped)`,
  );
  log(`training examples after builder:     ${examples.length}`);
  log(`JSONL lines:                         ${lines.length}`);
  log(`frozen prompt ids leaked:            ${leakedByPromptId}`);
  log(`frozen prompt TEXTS leaked:          ${leakedByText}`);
  log(`lines missing the shared system turn:${missingSystem}`);
  log(`targets with English meta-words:     ${englishInTarget}`);
  log(
    `JSONL bytes:                         ${Buffer.byteLength(jsonl, "utf8")}`,
  );
  log("── first 3 rows ──");
  for (const line of lines.slice(0, 3)) {
    const parsed = JSON.parse(line) as {
      messages: { role: string; content: string }[];
    };
    log(
      JSON.stringify(
        {
          system: `${parsed.messages[0].content.slice(0, 40)}... (${parsed.messages[0].content.length} chars)`,
          user: parsed.messages[1].content,
          assistant: parsed.messages[2].content,
        },
        null,
        1,
      ),
    );
  }
  if (leakedByPromptId > 0 || leakedByText > 0 || missingSystem > 0) {
    throw new Error("CONTAMINATION OR FORMAT CHECK FAILED - do not launch");
  }
  log("all checks passed");
}

// ─── launch ──────────────────────────────────────────────────

async function stepLaunch() {
  const job = await currentJob();
  if (!job) throw new Error("no job - run `create` first");
  if (job.providerJobId) {
    log(`already launched: ${job.providerJobId} (status ${job.status})`);
    return;
  }
  const provider = getFineTuneProvider(job.provider);
  const result = await provider.launch(job);
  const updated = await prisma.fineTuneJob.update({
    where: { id: job.id },
    data: {
      providerJobId: result.providerJobId,
      providerFileId: result.providerFileId ?? null,
      status: "running",
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  log(
    `launched: openai job ${updated.providerJobId} file ${updated.providerFileId} rows ${updated.nTrainingRows}`,
  );
}

// ─── poll ────────────────────────────────────────────────────

async function stepPoll() {
  const base = await currentJob();
  if (!base) throw new Error("no job - run `create` first");
  const provider = getFineTuneProvider(base.provider);

  const deadline = Date.now() + 90 * 60_000; // fine-tunes of this size finish well inside 90 min
  for (;;) {
    const job = await jobWithRelations(base.id);
    const result = await provider.poll(job);
    if (result.status === "running") {
      if (Date.now() > deadline) throw new Error("poll timed out");
      log(`${new Date().toISOString()} still running...`);
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (result.status === "failed") {
      await prisma.fineTuneJob.update({
        where: { id: job.id },
        data: { status: "failed", errorMessage: result.error ?? "failed" },
      });
      throw new Error(`fine-tune failed: ${result.error}`);
    }
    const outputModelId = result.outputModelId;
    if (!outputModelId) throw new Error("succeeded without a model id");
    log(`succeeded: ${outputModelId} cost $${result.costUsd}`);

    const registered = await registerFineTuneOutput({
      job,
      outputModelId,
      costUsd: result.costUsd,
      userId: job.triggeredById,
      name: CANDIDATE_NAME,
    });
    log(
      `candidate ${registered.candidateId} (already=${registered.alreadyRegistered}) evalRun=${registered.evalRunId}`,
    );

    // Deterministic decoding for the frozen-bank run. The baseline candidates
    // carry no decodingParams (provider default 0.7); this run must be
    // reproducible, so pin it on the candidate rather than at the call site.
    await prisma.candidateModel.update({
      where: { id: registered.candidateId },
      data: { decodingParams: DECODING },
    });

    const candidate = await prisma.candidateModel.findUniqueOrThrow({
      where: { id: registered.candidateId },
    });
    log(JSON.stringify(candidate, null, 1));
    return;
  }
}

// ─── generate ────────────────────────────────────────────────

async function tunedCandidate() {
  const job = await currentJob();
  if (!job) throw new Error("no job");
  const candidate = await prisma.candidateModel.findFirst({
    where: { fineTuneJobId: job.id },
  });
  if (!candidate) throw new Error("job has no registered candidate yet");
  return candidate;
}

async function stepGenerate() {
  const candidate = await tunedCandidate();
  const run = await prisma.evalRun.findFirst({
    where: { candidateModelId: candidate.id },
    orderBy: { createdAt: "desc" },
  });
  const prompts = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  log(`generating ${prompts.length} outputs with ${candidate.baseModelId}`);

  if (run) {
    await prisma.evalRun.update({
      where: { id: run.id },
      data: { status: "generating" },
    });
  }

  let generated = 0;
  let failed = 0;
  let costUsd = 0;
  for (const prompt of prompts) {
    const already = await prisma.modelOutput.findFirst({
      where: { promptId: prompt.id, candidateModelId: candidate.id },
      select: { id: true },
    });
    if (already) {
      generated++;
      continue;
    }
    try {
      const result = await generateForCandidate(candidate, {
        userMessage: prompt.text,
      });
      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: candidate.family,
          modelId: result.modelId,
          candidateModelId: candidate.id,
          evalRunId: run?.id ?? null,
          bucket: prompt.bucket,
          outputText: result.text,
          ragContextIds: result.ragContextIds,
          tokenCountIn: result.tokensIn ?? null,
          tokenCountOut: result.tokensOut ?? null,
          latencyMs: result.latencyMs,
        },
      });
      costUsd += estimateGenerationCostUsd({
        modelId: result.modelId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      generated++;
      log(
        `  ${prompt.promptId}: ${result.text.replace(/\n/g, " ").slice(0, 70)}`,
      );
    } catch (e) {
      failed++;
      log(`  ${prompt.promptId}: FAILED ${(e as Error).message}`);
    }
  }
  if (run) {
    await prisma.evalRun.update({
      where: { id: run.id },
      data: {
        status: generated > 0 ? "awaiting_human" : "failed",
        costUsd: roundUsd(costUsd),
      },
    });
  }
  log(
    `generated ${generated}/${prompts.length} (failed ${failed}) inference cost ~$${roundUsd(costUsd)}`,
  );
}

// ─── metrics ─────────────────────────────────────────────────

async function stepMetrics() {
  const candidate = await tunedCandidate();
  const prompts = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  const promptIds = prompts.map((p) => p.id);

  const outputs = await prisma.modelOutput.findMany({
    where: { promptId: { in: promptIds }, isDemo: false },
    select: {
      promptId: true,
      modelId: true,
      outputText: true,
      candidateModelId: true,
    },
  });

  const byModel = new Map<string, string[]>();
  for (const o of outputs) {
    const key =
      o.candidateModelId === candidate.id ? `TUNED ${o.modelId}` : o.modelId;
    const list = byModel.get(key) ?? [];
    list.push(o.outputText);
    byModel.set(key, list);
  }

  // The community's own gold on the SAME 43 prompts is the reference row. It is
  // excluded from training (that is the point of the freeze) but it is the only
  // honest anchor for what these proxies look like on real Igala: native writing
  // is routinely less tone-marked than a frontier model's output, so a tuned
  // model moving TOWARD the gold reads as a "regression" on toneShare.
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: { promptId: { in: promptIds }, isDemo: false },
    select: { promptId: true, answerText: true },
  });
  const goldBy = new Map<string, string>();
  for (const g of golds)
    if (!goldBy.has(g.promptId)) goldBy.set(g.promptId, g.answerText);

  log(
    "── purity on the frozen 43 (lower English share better, higher tone better) ──",
  );
  const rows = [...byModel.entries()]
    .map(([model, texts]) => ({ model, ...purityMetrics(texts) }))
    .sort((a, b) => (a.model < b.model ? -1 : 1));
  rows.push({
    model: "REFERENCE community gold (held out)",
    ...purityMetrics(golds.map((g) => g.answerText)),
  });
  console.table(rows);

  const tunedBy = new Map<string, string>();
  const baseBy = new Map<string, string>();
  for (const o of outputs) {
    if (o.candidateModelId === candidate.id)
      tunedBy.set(o.promptId, o.outputText);
    else if (!baseBy.has(o.promptId))
      baseBy.set(o.promptId, `${o.modelId}: ${o.outputText}`);
  }

  // One sample per bucket first, so the 8 shown span the benchmark rather than
  // eight near-identical grammar translations.
  log("\n── 8 side-by-side samples ──");
  const seenBucket = new Set<string>();
  const withTuned = prompts.filter((p) => tunedBy.has(p.id));
  const spread = withTuned.filter((p) => {
    const b = p.bucket ?? "none";
    if (seenBucket.has(b)) return false;
    seenBucket.add(b);
    return true;
  });
  const sample = [
    ...spread,
    ...withTuned.filter((p) => !spread.includes(p)),
  ].slice(0, 8);
  for (const p of sample) {
    log(`\n[${p.promptId} / ${p.bucket}]`);
    log(`  prompt:   ${p.text}`);
    log(`  gold:     ${goldBy.get(p.id) ?? "(none)"}`);
    log(`  tuned:    ${(tunedBy.get(p.id) ?? "").replace(/\n/g, " ")}`);
    log(`  baseline: ${(baseBy.get(p.id) ?? "").replace(/\n/g, " ")}`);
  }
}

// ─── arena readiness ─────────────────────────────────────────

async function stepArena() {
  const candidate = await tunedCandidate();
  const prompts = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, promptId: true },
    orderBy: { promptId: "asc" },
  });
  const outs = await prisma.modelOutput.findMany({
    where: { promptId: { in: prompts.map((p) => p.id) }, isDemo: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, promptId: true, candidateModelId: true, modelId: true },
  });
  const byPrompt = new Map<string, typeof outs>();
  for (const o of outs) {
    const list = byPrompt.get(o.promptId) ?? [];
    list.push(o);
    byPrompt.set(o.promptId, list);
  }

  const annotators = await prisma.user.findMany({
    where: { role: "ANNOTATOR" },
    select: { id: true, email: true },
  });
  log(`annotators: ${annotators.length}`);

  const counts: Record<number, number> = {};
  let promptsWithTunedPairPossible = 0;
  let assignmentsWithTuned = 0;
  let assignmentsTotal = 0;
  for (const p of prompts) {
    const list = byPrompt.get(p.id) ?? [];
    counts[list.length] = (counts[list.length] ?? 0) + 1;
    if (list.some((o) => o.candidateModelId === candidate.id)) {
      promptsWithTunedPairPossible++;
    }
    for (const a of annotators) {
      const pair = assignedPair(a.id, p.promptId, list.length);
      if (!pair) continue;
      assignmentsTotal++;
      const [i, j] = pair;
      if (
        list[i].candidateModelId === candidate.id ||
        list[j].candidateModelId === candidate.id
      ) {
        assignmentsWithTuned++;
      }
    }
  }
  log(`outputs-per-frozen-prompt distribution: ${JSON.stringify(counts)}`);
  log(
    `frozen prompts carrying a tuned output: ${promptsWithTunedPairPossible}/${prompts.length}`,
  );
  log(
    `annotator x prompt assignments that are tuned-vs-baseline: ${assignmentsWithTuned}/${assignmentsTotal} (${assignmentsTotal ? Math.round((100 * assignmentsWithTuned) / assignmentsTotal) : 0}%)`,
  );
}

const STEPS: Record<string, () => Promise<void>> = {
  create: stepCreate,
  preview: stepPreview,
  launch: stepLaunch,
  poll: stepPoll,
  generate: stepGenerate,
  metrics: stepMetrics,
  arena: stepArena,
};

async function main() {
  const step = process.argv[2];
  const fn = STEPS[step];
  if (!fn) {
    log(`usage: openai-sft-run.ts <${Object.keys(STEPS).join("|")}>`);
    process.exitCode = 1;
    return;
  }
  await fn();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
