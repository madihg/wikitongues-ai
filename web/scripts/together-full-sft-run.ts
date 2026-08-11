/**
 * Operational runner for the OPEN-WEIGHTS Igala experiment: a FULL (non-LoRA)
 * fine-tune of Llama-3.1-8B on Together, served on a v2 dedicated endpoint.
 *
 * Why this exists as a sibling of scripts/openai-sft-run.ts rather than a flag on
 * it: the OpenAI path ends when the job finishes, because a tuned OpenAI model is
 * servable immediately. The Together path has a whole second half - register the
 * checkpoint as a v2 model, deploy GPUs, prove it answers, generate, and tear the
 * GPUs down - and that half is where the money is. Every step below still calls
 * the same libraries the API routes call (loadSftSourceRows + buildSftExamples,
 * getFineTuneProvider, registerFineTuneOutput, generateForCandidate), so the run
 * is indistinguishable from one driven through the UI.
 *
 * COST DISCIPLINE. A v2 dedicated endpoint bills $5.49/GPU-hour from the moment
 * it provisions and has NO automatic idle shutdown (v1 had a 15-minute one; v2
 * dropped it). The `serve` step therefore does deploy, prove, generate and
 * TEARDOWN inside a single try/finally: if generation throws, if the endpoint
 * never becomes ready, if the process is interrupted, teardown still runs and
 * still verifies. Run scripts/together-endpoint-guard.sh alongside it as
 * independent insurance.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/together-full-sft-run.ts <step>
 * Steps:
 *   create    create the draft job and build the dataset (no spend)
 *   preview   contamination + format checks on the exact JSONL (no spend)
 *   estimate  upload the file (free) and ask Together to price the job (no spend)
 *   launch    start the FULL fine-tune (spends money)
 *   poll      poll to completion, verify it really was Full, register the candidate
 *   servable  confirm the checkpoint has a certified deploy config (no spend)
 *   serve     deploy -> prove -> generate 43 -> TEARDOWN (the only GPU spend)
 *   teardown  idempotent: scale to zero and delete, then verify nothing is live
 *   metrics   purity + reference-metric table and side-by-side samples
 *   arena     confirm blind tuned-vs-baseline pairs are assignable
 */

import { execFile } from "child_process";
import { promisify } from "util";
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
import { scoreAgainstReferences } from "@/lib/eval/reference";
import { roundUsd } from "@/lib/arena/pricing";
import { assignedPair } from "@/lib/pairing";
import {
  uploadTrainingFile,
  fetchModelLimits,
  fetchSupportedModels,
  selectDeployableFineTuneBases,
  estimateJobPrice,
  TOGETHER_DEDICATED_INFERENCE_API,
} from "@/lib/arena/together";
import type { FineTuneJob } from "@prisma/client";

const execFileAsync = promisify(execFile);

/**
 * The base to fine-tune. Default is the smallest base that is BOTH
 * full-fine-tunable and dedicated-servable in Together's v2 registry; override
 * with TOGETHER_BASE_MODEL to run the same pipeline on another one.
 *
 * The previous default, meta-llama/Meta-Llama-3.1-8B-Instruct-Reference, is NOT
 * usable: it trains (verified, $4.00, job ft-177f8a45-1335) and Together then
 * refuses to deploy the result, because the fine-tune output inherits the
 * training-only 8B model object, which owns no deployment config. The
 * production meta-llama/Llama-3.1-8B-Instruct object does own one, which is
 * what makes the trap convincing. stepLaunch below blocks that class of mistake
 * before any money moves.
 */
const BASE_MODEL = process.env.TOGETHER_BASE_MODEL ?? "Qwen/Qwen3.5-9B";
const GPU_USD_PER_HOUR = 5.49;

const ENDPOINT_NAME = process.env.TOGETHER_ENDPOINT_NAME ?? "igala-sft-open";
const CANDIDATE_NAME =
  process.env.TOGETHER_CANDIDATE_NAME ??
  `${BASE_MODEL.split("/").pop()} full SFT (Igala cold-gold)`;
const DECODING = { temperature: 0, maxTokens: 1024 };
/** Hard ceiling on how long the endpoint may exist, belt to the guard's braces. */
const MAX_ENDPOINT_MINUTES = 45;

function log(...args: unknown[]) {
  console.log(...args);
}

// ─── together CLI (the v2 endpoint surface has no REST client here) ──────

let cachedProjectId: string | null = null;

/**
 * The v2 CLI infers the project for READ-ONLY calls but refuses every mutating
 * one ("Project argument is required") unless TOGETHER_PROJECT_ID is set. That
 * includes teardown, so resolving it lazily here rather than relying on the
 * shell environment is what keeps the finally-block able to stop the billing.
 */
async function projectId(env: NodeJS.ProcessEnv): Promise<string> {
  if (cachedProjectId) return cachedProjectId;
  if (process.env.TOGETHER_PROJECT_ID) {
    cachedProjectId = process.env.TOGETHER_PROJECT_ID;
    return cachedProjectId;
  }
  const { stdout } = await execFileAsync("tg", ["whoami", "--json"], { env });
  cachedProjectId =
    (JSON.parse(stdout) as { project_id?: string }).project_id ?? "";
  return cachedProjectId;
}

async function tg(args: string[]): Promise<unknown> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
    // A quoted key in .env.local silently 401s the CLI.
    TOGETHER_API_KEY: (process.env.TOGETHER_API_KEY ?? "").replace(
      /^"|"$/g,
      "",
    ),
  };
  env.TOGETHER_PROJECT_ID = await projectId(env);
  const { stdout } = await execFileAsync("tg", [...args, "--json"], {
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

/** Every v2 deployment in the project, flattened, with its live replica bounds. */
interface DeploymentView {
  endpointId: string;
  endpointString?: string;
  deploymentId: string;
  state: string;
  minReplicas?: number;
  maxReplicas?: number;
}

async function listDeployments(): Promise<DeploymentView[]> {
  const list = (await tg(["beta", "endpoints", "ls"])) as {
    data?: { id?: string }[];
  };
  const out: DeploymentView[] = [];
  for (const ep of list.data ?? []) {
    if (!ep.id) continue;
    const detail = (await tg(["beta", "endpoints", "get", ep.id])) as {
      id?: string;
      endpointString?: string;
      name?: string;
      deployments?: Record<string, unknown>[];
    };
    for (const d of detail.deployments ?? []) {
      const auto = (d.autoscaling ?? {}) as Record<string, unknown>;
      out.push({
        endpointId: ep.id,
        endpointString: detail.endpointString ?? detail.name,
        deploymentId: String(d.id ?? ""),
        state: String(d.state ?? d.status ?? ""),
        minReplicas: Number(auto.minReplicas ?? auto.min_replicas ?? NaN),
        maxReplicas: Number(auto.maxReplicas ?? auto.max_replicas ?? NaN),
      });
    }
  }
  return out;
}

// ─── job helpers ─────────────────────────────────────────────────────────

/** The one open Together job for THIS experiment (older Qwen jobs are excluded). */
async function currentJob(): Promise<FineTuneJob | null> {
  return prisma.fineTuneJob.findFirst({
    where: { provider: "together", language: "igala", baseModelId: BASE_MODEL },
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

async function tunedCandidate() {
  const job = await currentJob();
  if (!job) throw new Error("no job");
  const candidate = await prisma.candidateModel.findFirst({
    where: { fineTuneJobId: job.id },
  });
  if (!candidate) throw new Error("job has no registered candidate yet");
  return candidate;
}

// ─── create ──────────────────────────────────────────────────────────────

async function stepCreate() {
  const existing = await currentJob();
  if (existing) {
    log(`job already exists: ${existing.id} (status ${existing.status})`);
    return;
  }

  const researcher = await prisma.user.findFirst({
    where: { role: "RESEARCHER" },
    select: { id: true },
  });
  const holdout = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true },
  });

  const job = await prisma.fineTuneJob.create({
    data: {
      method: "sft",
      provider: "together",
      baseModelId: BASE_MODEL,
      baseCandidateId: null,
      language: "igala",
      trainingFormat: "openai-chat",
      systemPrompt: IGALA_FORCING_INSTRUCTION,
      sourcePairwiseIds: [],
      sourceEditIds: [],
      holdoutPromptIds: holdout.map((p) => p.id),
      bucketFilter: [],
      // lora:false is the whole point. Without it Together trains a LoRA adapter
      // that only a dedicated endpoint can host AS AN ADAPTER - the exact wall the
      // Qwen3-14B run hit.
      hyperparameters: { nEpochs: 3, batchSize: 8, lora: false },
      status: "draft",
      triggeredById: researcher?.id ?? null,
    },
  });
  log(`created job ${job.id} base=${BASE_MODEL} holdout=${holdout.length}`);

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

// ─── preview ─────────────────────────────────────────────────────────────

async function stepPreview() {
  const job = await currentJob();
  if (!job) throw new Error("no job - run `create` first");

  const rows = await loadSftSourceRows(job);
  const examples = buildSftExamples(rows, {});
  const jsonl = await buildTrainingJsonl(job);
  const lines = jsonl.split("\n").filter(Boolean);

  const frozen = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, text: true },
  });
  const frozenTexts = new Set(frozen.map((p) => p.text.trim()));
  const frozenIds = new Set(frozen.map((p) => p.id));

  const heldOutSourceRows = rows.filter((r) => r.isHoldout).length;
  const leakedByPromptId = rows.filter(
    (r) => frozenIds.has(r.promptId) && !r.isHoldout,
  ).length;

  let leakedByText = 0;
  let missingSystem = 0;
  let chars = 0;
  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      messages: { role: string; content: string }[];
    };
    const system = parsed.messages.find((m) => m.role === "system");
    const user = parsed.messages.find((m) => m.role === "user");
    if (!system || system.content !== IGALA_FORCING_INSTRUCTION)
      missingSystem++;
    if (user && frozenTexts.has(user.content.trim())) leakedByText++;
    chars += line.length;
  }

  const nEpochs =
    (job.hyperparameters as Record<string, unknown> | null)?.nEpochs ?? 3;
  // Rough only. Together's own estimate (the `estimate` step) is the number that
  // decides anything; this is here so the order of magnitude is visible first.
  const approxTokens = Math.round(chars / 4);

  log("-- contamination + format checks --");
  log(`frozen/test prompts:                  ${frozen.length}`);
  log(`source rows loaded:                   ${rows.length}`);
  log(
    `  of which flagged isHoldout:         ${heldOutSourceRows} (all dropped)`,
  );
  log(`training examples after builder:      ${examples.length}`);
  log(`JSONL lines:                          ${lines.length}`);
  log(`frozen prompt ids leaked:             ${leakedByPromptId}`);
  log(`frozen prompt TEXTS leaked:           ${leakedByText}`);
  log(`lines missing the shared system turn: ${missingSystem}`);
  log(
    `JSONL bytes:                          ${Buffer.byteLength(jsonl, "utf8")}`,
  );
  log(`approx tokens/epoch (chars/4):        ${approxTokens}`);
  log(`epochs:                               ${nEpochs}`);
  log("-- first 2 rows --");
  for (const line of lines.slice(0, 2)) {
    const parsed = JSON.parse(line) as {
      messages: { role: string; content: string }[];
    };
    log(
      JSON.stringify({
        system: `${parsed.messages[0].content.slice(0, 40)}... (${parsed.messages[0].content.length} chars)`,
        user: parsed.messages[1].content,
        assistant: parsed.messages[2].content,
      }),
    );
  }
  if (leakedByPromptId > 0 || leakedByText > 0 || missingSystem > 0) {
    throw new Error("CONTAMINATION OR FORMAT CHECK FAILED - do not launch");
  }
  log("all checks passed");
}

// ─── estimate (free: uploads are not billed, only jobs are) ──────────────

async function stepEstimate() {
  const job = await currentJob();
  if (!job) throw new Error("no job - run `create` first");

  const limits = await fetchModelLimits(BASE_MODEL);
  log(`model limits for ${limits.modelName}:`);
  log(`  supports_full_training: ${limits.supportsFullTraining}`);
  log(`  full batch bounds:      ${JSON.stringify(limits.fullTraining)}`);
  log(`  max_seq_length_sft:     ${limits.maxSeqLengthSft}`);
  if (!limits.supportsFullTraining) {
    throw new Error(`${BASE_MODEL} does not support full fine-tuning - STOP`);
  }

  const jsonl = await buildTrainingJsonl(job);
  const fileName = `wikitongues-${job.method}-${job.id.slice(0, 8)}.jsonl`;
  // Together dedupes by sha256, so `launch` reuses this exact file rather than
  // uploading a second copy.
  const fileId = await uploadTrainingFile(jsonl, fileName);
  log(`uploaded (free) file ${fileId}`);

  const quote = await estimateJobPrice({
    fileId,
    model: BASE_MODEL,
    method: "sft",
    lora: false,
    nEpochs: 3,
    batchSize: 8,
  });
  log(`Together's own quote: ${JSON.stringify(quote)}`);
  if (quote.estimatedUsd != null) {
    log(
      `  -> $${roundUsd(quote.estimatedUsd)} for ${quote.estimatedTrainTokens} train tokens`,
    );
  }
  if (quote.allowedToProceed === false) {
    throw new Error("Together says the account is not allowed to proceed");
  }
}

// ─── launch ──────────────────────────────────────────────────────────────

/**
 * The gate that stands between this project and a third stranded checkpoint.
 *
 * Both halves have to hold, and neither implies the other: the base must accept
 * a FULL fine-tune (per /fine-tunes/models/limits), and its v2 registry entry
 * must carry PRODUCT_FINE_TUNING and PRODUCT_DEDICATED together with a certified
 * config, which is what makes the training object and the deployable object the
 * same object. Runs before the training file is even uploaded.
 */
async function assertServableAfterTraining(model: string): Promise<void> {
  const limits = await fetchModelLimits(model);
  if (!limits.supportsFullTraining) {
    throw new Error(`${model} does not support full fine-tuning - STOP`);
  }
  const deployable = selectDeployableFineTuneBases(
    await fetchSupportedModels(),
  );
  const match = deployable.find((m) => model.startsWith(m.name));
  if (!match) {
    throw new Error(
      `${model} trains but CANNOT BE SERVED: no v2 registry entry carries both ` +
        `PRODUCT_FINE_TUNING and PRODUCT_DEDICATED with a certified config. ` +
        `Servable bases today: ${deployable.map((m) => m.name).join(", ")}`,
    );
  }
  log(
    `servability gate PASSED: ${match.name} base=${match.baseModelId} configs=${match.certifiedConfigIds.join(",")}`,
  );
}

async function stepLaunch() {
  const job = await currentJob();
  if (!job) throw new Error("no job - run `create` first");
  if (job.providerJobId) {
    log(`already launched: ${job.providerJobId} (status ${job.status})`);
    return;
  }
  await assertServableAfterTraining(job.baseModelId);
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
    `launched: together job ${updated.providerJobId} file ${updated.providerFileId} rows ${updated.nTrainingRows}`,
  );
}

// ─── poll ────────────────────────────────────────────────────────────────

async function stepPoll() {
  const base = await currentJob();
  if (!base) throw new Error("no job - run `create` first");
  const provider = getFineTuneProvider(base.provider);

  const deadline = Date.now() + 180 * 60_000;
  for (;;) {
    const job = await jobWithRelations(base.id);
    const result = await provider.poll(job);
    if (result.status === "running") {
      if (Date.now() > deadline) throw new Error("poll timed out");
      log(`${new Date().toISOString()} still running...`);
      await new Promise((r) => setTimeout(r, 60_000));
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
    await prisma.candidateModel.update({
      where: { id: registered.candidateId },
      data: { decodingParams: DECODING },
    });
    log(
      `candidate ${registered.candidateId} (already=${registered.alreadyRegistered}) evalRun=${registered.evalRunId}`,
    );
    return;
  }
}

// ─── servable (no spend) ─────────────────────────────────────────────────

/** The v2 model record for the trained checkpoint, matched by name. */
async function findV2Model(outputModelId: string) {
  const list = (await tg(["beta", "models", "list"])) as
    { data?: Record<string, unknown>[] } | Record<string, unknown>[];
  const rows = Array.isArray(list) ? list : (list.data ?? []);
  // Together writes the fine-tune's model name with the project SLUG
  // ("madihalim-2eb2/...") while the fine-tunes API returns it with an
  // UNDERSCORE ("madihalim_2eb2/..."). Match on the part after the slash.
  const tail = outputModelId.split("/").pop();
  return rows.find(
    (m) =>
      String((m as { name?: string }).name ?? "")
        .split("/")
        .pop() === tail,
  ) as { id?: string; name?: string; baseModelId?: string } | undefined;
}

/**
 * The deployable configs the TRAINED CHECKPOINT itself owns. Asked of the
 * checkpoint, never of the base architecture: those are different objects, and
 * only the checkpoint's own answer predicts whether a deploy will be accepted.
 */
async function checkpointConfigs(
  modelId: string,
): Promise<{ id: string; selectors: Record<string, string> }[]> {
  const configs = (await tg(["beta", "models", "configs", modelId])) as {
    data?: Record<string, unknown>[];
  };
  return (configs.data ?? []).map((c) => ({
    id: String(c.id ?? ""),
    selectors: Object.fromEntries(
      ((c.selectors ?? []) as { key: string; value: string }[]).map((s) => [
        s.key,
        s.value,
      ]),
    ),
  }));
}

async function stepServable() {
  const candidate = await tunedCandidate();
  const model = await findV2Model(candidate.baseModelId);
  if (!model?.id) {
    throw new Error(
      `checkpoint ${candidate.baseModelId} is not registered as a v2 model - it cannot be deployed`,
    );
  }
  log(`v2 model: ${model.id} ${model.name} baseModelId=${model.baseModelId}`);
  const rows = await checkpointConfigs(model.id);
  log(`deployable configs on the CHECKPOINT: ${rows.length}`);
  for (const c of rows) log(`  ${c.id} ${JSON.stringify(c.selectors)}`);
  if (rows.length === 0) {
    throw new Error(
      `NO config on checkpoint ${model.id} (base ${model.baseModelId}) - it cannot be served. ` +
        `This is the fine-tunable-but-not-deployable trap; see selectDeployableFineTuneBases.`,
    );
  }
}

// ─── serve: deploy -> prove -> generate -> teardown (always) ─────────────

/** One raw chat completion straight at the endpoint. The servability proof. */
async function proveCompletion(
  modelParam: string,
  userMessage: string,
): Promise<{ ok: boolean; text: string; raw: string }> {
  const key = (process.env.TOGETHER_API_KEY ?? "").replace(/^"|"$/g, "");
  const res = await fetch(
    `${TOGETHER_DEDICATED_INFERENCE_API}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelParam,
        messages: [
          { role: "system", content: IGALA_FORCING_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        max_tokens: 256,
        temperature: 0,
      }),
    },
  );
  const raw = await res.text();
  if (!res.ok) return { ok: false, text: "", raw: `${res.status}: ${raw}` };
  const d = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  return { ok: true, text: d.choices?.[0]?.message?.content ?? "", raw };
}

async function teardown(endpointId: string | null): Promise<void> {
  log("\n-- TEARDOWN --");
  const live = await listDeployments();
  for (const d of live) {
    if (/STOPPED|DELET/i.test(d.state) && d.maxReplicas === 0) continue;
    log(`scaling ${d.deploymentId} to zero (state ${d.state})`);
    await tg([
      "beta",
      "endpoints",
      "update",
      d.deploymentId,
      "--min-replicas",
      "0",
      "--max-replicas",
      "0",
      "--non-interactive",
    ]).catch((e) => log(`  scale-to-zero failed: ${(e as Error).message}`));
  }
  const ids = new Set(live.map((d) => d.endpointId));
  if (endpointId) ids.add(endpointId);
  for (const id of ids) {
    log(`deleting endpoint ${id}`);
    await tg([
      "beta",
      "endpoints",
      "rm",
      id,
      "--force",
      "--non-interactive",
    ]).catch((e) => log(`  delete failed: ${(e as Error).message}`));
  }
  await verifyTornDown();
}

async function verifyTornDown(): Promise<void> {
  const v2 = await listDeployments();
  const v1 = (await tg(["endpoints", "list"])) as
    { state?: string; id?: string }[] | Record<string, unknown>;
  const v1Live = Array.isArray(v1)
    ? v1.filter((e) => /RUNNING|STARTING|PENDING/i.test(String(e.state)))
    : [];
  log(`VERIFY v2 deployments remaining: ${JSON.stringify(v2)}`);
  log(`VERIFY v1 endpoints RUNNING:     ${JSON.stringify(v1Live)}`);
  const v2Live = v2.filter((d) => !/STOPPED|DELET/i.test(d.state));
  if (v2Live.length > 0 || v1Live.length > 0) {
    log("!!! SOMETHING IS STILL LIVE - STOP IT BY HAND !!!");
  } else {
    log("verified: nothing is running, billing stopped");
  }
}

async function stepServe() {
  const candidate = await tunedCandidate();
  const model = await findV2Model(candidate.baseModelId);
  if (!model?.id) throw new Error("checkpoint has no v2 model record");

  // Resolve the config from the checkpoint rather than pinning one: a config id
  // belonging to a different model is rejected ("Config ... is not valid for
  // model ..."), and an empty list here means no GPU should ever be requested.
  const configs = await checkpointConfigs(model.id);
  if (configs.length === 0) {
    throw new Error(
      `checkpoint ${model.id} has no deployable config - refusing to request GPUs`,
    );
  }
  const configId = configs[0].id;

  let endpointId: string | null = null;
  const startedAt = Date.now();
  try {
    log(`deploying ${model.id} (${model.name}) config ${configId}`);
    const deployed = (await tg([
      "beta",
      "endpoints",
      "deploy",
      model.id,
      "--endpoint",
      ENDPOINT_NAME,
      "--config",
      configId,
      "--min-replicas",
      "1",
      "--max-replicas",
      "1",
      "--non-interactive",
    ])) as Record<string, unknown>;
    log(`deploy response: ${JSON.stringify(deployed).slice(0, 900)}`);

    const deployments = await listDeployments();
    endpointId = deployments[0]?.endpointId ?? null;
    const endpointString = deployments[0]?.endpointString ?? null;
    log(`endpoint ${endpointId} string=${endpointString}`);

    // Wait for READY, bounded. Provisioning an 8B is documented at 5-10 min.
    const readyDeadline = startedAt + MAX_ENDPOINT_MINUTES * 60_000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      const ds = await listDeployments();
      const d = ds[0];
      const mins = Math.round((Date.now() - startedAt) / 60_000);
      log(`  ${mins}m state=${d?.state}`);
      if (d && /READY/i.test(d.state)) {
        ready = true;
        break;
      }
      if (d && /FAILED|ERROR/i.test(d.state)) {
        throw new Error(`deployment entered ${d.state}`);
      }
      await new Promise((r) => setTimeout(r, 30_000));
    }
    if (!ready)
      throw new Error("deployment never became READY inside the window");

    // PROOF: one real completion before anything else. Try the checkpoint name
    // first, then the endpoint string, and keep whichever the endpoint answers.
    const probePrompt = "Kí ni orúkọ rẹ? Dá mi lóhùn ní èdè Igala.";
    let servingId = "";
    let proof = { ok: false, text: "", raw: "" };
    for (const attempt of [
      candidate.baseModelId,
      endpointString ?? "",
      `${ENDPOINT_NAME}`,
    ].filter(Boolean)) {
      log(`\nprobing model param "${attempt}"`);
      proof = await proveCompletion(attempt, probePrompt);
      log(
        `  -> ${proof.ok ? "OK" : "FAIL"} ${proof.ok ? proof.text : proof.raw.slice(0, 300)}`,
      );
      if (proof.ok) {
        servingId = attempt;
        break;
      }
    }
    if (!servingId) throw new Error("endpoint is READY but answers nothing");
    log(`\n*** SERVABILITY PROOF ***\nmodel: ${servingId}\n${proof.text}\n`);

    // Point the arena candidate at whatever actually serves.
    if (servingId !== candidate.baseModelId) {
      await prisma.candidateModel.update({
        where: { id: candidate.id },
        data: { baseModelId: servingId },
      });
      log(`candidate baseModelId -> ${servingId}`);
    }
    await prisma.candidateModel.update({
      where: { id: candidate.id },
      data: { apiEndpoint: TOGETHER_DEDICATED_INFERENCE_API },
    });

    await generateAll();
  } finally {
    const uptimeMin = (Date.now() - startedAt) / 60_000;
    await teardown(endpointId);
    log(
      `endpoint uptime: ${uptimeMin.toFixed(1)} min  ~$${roundUsd((uptimeMin / 60) * GPU_USD_PER_HOUR)} of GPU time`,
    );
  }
}

async function generateAll() {
  const candidate = await prisma.candidateModel.findFirstOrThrow({
    where: { id: (await tunedCandidate()).id },
  });
  const run = await prisma.evalRun.findFirst({
    where: { candidateModelId: candidate.id },
    orderBy: { createdAt: "desc" },
  });
  const prompts = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  log(`\ngenerating ${prompts.length} outputs with ${candidate.baseModelId}`);
  if (run) {
    await prisma.evalRun.update({
      where: { id: run.id },
      data: { status: "generating" },
    });
  }

  let generated = 0;
  let failed = 0;
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
      data: { status: generated > 0 ? "awaiting_human" : "failed" },
    });
  }
  // Inference on a dedicated endpoint is billed by the GPU-minute, not per
  // token, so there is deliberately no per-token cost accumulated here.
  log(`generated ${generated}/${prompts.length} (failed ${failed})`);
}

async function stepTeardown() {
  await teardown(null);
}

// ─── metrics ─────────────────────────────────────────────────────────────

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
  // consentBenchmark, enforced in the query. Today every answer whose author
  // declined benchmark use happens to sit on a train-split prompt, so none of
  // them would reach this frozen-43 read anyway - but accidental compliance is
  // not compliance, and the day a holdout prompt gets one it must not appear.
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: promptIds },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  const goldsBy = new Map<string, string[]>();
  for (const g of golds) {
    const list = goldsBy.get(g.promptId) ?? [];
    list.push(g.answerText);
    goldsBy.set(g.promptId, list);
  }

  const byModel = new Map<string, { promptId: string; text: string }[]>();
  for (const o of outputs) {
    const key =
      o.candidateModelId === candidate.id ? `TUNED ${o.modelId}` : o.modelId;
    const list = byModel.get(key) ?? [];
    list.push({ promptId: o.promptId, text: o.outputText });
    byModel.set(key, list);
  }

  log(
    "-- purity on the frozen 43 (lower English better; tone is descriptive) --",
  );
  const rows = [...byModel.entries()]
    .map(([model, items]) => {
      // Reference metrics come from src/lib/eval (owned by another agent, used
      // read-only here) so the open-weights model is scored on the same ruler.
      const scored = items
        .map((i) => ({
          hyp: i.text,
          refs: goldsBy.get(i.promptId) ?? [],
        }))
        .filter((x) => x.refs.length > 0)
        .map((x) => scoreAgainstReferences(x.hyp, x.refs));
      const mean = (f: (s: (typeof scored)[number]) => number) =>
        scored.length
          ? Math.round(
              (scored.reduce((a, s) => a + f(s), 0) / scored.length) * 1000,
            ) / 1000
          : 0;
      return {
        model,
        ...purityMetrics(items.map((i) => i.text)),
        chrfBest: mean((s) => s.best.chrf),
        toneInsMatch: mean((s) => s.best.toneInsensitiveMatch),
      };
    })
    .sort((a, b) => (a.model < b.model ? -1 : 1));
  rows.push({
    model: "REFERENCE community gold (held out)",
    ...purityMetrics(golds.map((g) => g.answerText)),
    chrfBest: 1,
    toneInsMatch: 1,
  });
  console.table(rows);

  const tunedBy = new Map<string, string>();
  const byModelId = new Map<string, Map<string, string>>();
  for (const o of outputs) {
    if (o.candidateModelId === candidate.id) {
      tunedBy.set(o.promptId, o.outputText);
    } else {
      const m = byModelId.get(o.modelId) ?? new Map<string, string>();
      if (!m.has(o.promptId)) m.set(o.promptId, o.outputText);
      byModelId.set(o.modelId, m);
    }
  }
  const openaiFt = [...byModelId.keys()].find((k) => k.startsWith("ft:"));
  const gpt41 = [...byModelId.keys()].find((k) => k === "gpt-4.1");

  log("\n-- 6 side-by-side samples --");
  const seen = new Set<string>();
  const withTuned = prompts.filter((p) => tunedBy.has(p.id));
  const spread = withTuned.filter((p) => {
    const b = p.bucket ?? "none";
    if (seen.has(b)) return false;
    seen.add(b);
    return true;
  });
  const sample = [
    ...spread,
    ...withTuned.filter((p) => !spread.includes(p)),
  ].slice(0, 6);
  for (const p of sample) {
    const one = (s?: string) =>
      (s ?? "(none)").replace(/\n/g, " ").slice(0, 220);
    log(`\n[${p.promptId} / ${p.bucket}]`);
    log(`  prompt:      ${p.text}`);
    log(`  gold:        ${one(goldsBy.get(p.id)?.[0])}`);
    log(`  llama-8b ft: ${one(tunedBy.get(p.id))}`);
    log(
      `  openai ft:   ${one(openaiFt ? byModelId.get(openaiFt)?.get(p.id) : undefined)}`,
    );
    log(
      `  gpt-4.1:     ${one(gpt41 ? byModelId.get(gpt41)?.get(p.id) : undefined)}`,
    );
  }
}

// ─── arena readiness ─────────────────────────────────────────────────────

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
    select: { id: true, promptId: true, candidateModelId: true },
  });
  const byPrompt = new Map<string, typeof outs>();
  for (const o of outs) {
    const list = byPrompt.get(o.promptId) ?? [];
    list.push(o);
    byPrompt.set(o.promptId, list);
  }
  const annotators = await prisma.user.findMany({
    where: { role: "ANNOTATOR" },
    select: { id: true },
  });

  const counts: Record<number, number> = {};
  let withTuned = 0;
  let assignmentsWithTuned = 0;
  let assignmentsTotal = 0;
  for (const p of prompts) {
    const list = byPrompt.get(p.id) ?? [];
    counts[list.length] = (counts[list.length] ?? 0) + 1;
    if (list.some((o) => o.candidateModelId === candidate.id)) withTuned++;
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
  log(`annotators: ${annotators.length}`);
  log(`outputs-per-frozen-prompt distribution: ${JSON.stringify(counts)}`);
  log(
    `frozen prompts carrying the open-weights output: ${withTuned}/${prompts.length}`,
  );
  log(
    `annotator x prompt assignments involving it: ${assignmentsWithTuned}/${assignmentsTotal} (${assignmentsTotal ? Math.round((100 * assignmentsWithTuned) / assignmentsTotal) : 0}%)`,
  );
}

const STEPS: Record<string, () => Promise<void>> = {
  create: stepCreate,
  preview: stepPreview,
  estimate: stepEstimate,
  launch: stepLaunch,
  poll: stepPoll,
  servable: stepServable,
  serve: stepServe,
  teardown: stepTeardown,
  metrics: stepMetrics,
  arena: stepArena,
};

async function main() {
  const step = process.argv[2];
  const fn = STEPS[step];
  if (!fn) {
    log(`usage: together-full-sft-run.ts <${Object.keys(STEPS).join("|")}>`);
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
