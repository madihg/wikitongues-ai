/**
 * Together AI fine-tune client (the real adapter).
 *
 * Mirrors the proven pattern from Halim's `singulars` poetry arena: a two-step
 * file upload (POST returns a 302 to a presigned R2 URL; PUT the bytes there),
 * then start a fine-tune, then poll. This is wired and correct but OFF by default
 * for the Igala pilot — nothing here runs unless TOGETHER_API_KEY is set, and the
 * arena's default provider stays the offline mock. Flip it on post-pilot.
 *
 * Env: TOGETHER_API_KEY.
 */

import { createHash } from "crypto";

const TOGETHER_API = "https://api.together.xyz/v1";

/**
 * Inference base URL for DEDICATED endpoints, which is a DIFFERENT host from the
 * training/serverless API above. A fine-tuned checkpoint is never reachable on
 * api.together.xyz: Together has no serverless inference for tuned models, so
 * the only way to call one is a dedicated endpoint, and dedicated endpoints are
 * served from api-inference.together.ai with the ENDPOINT STRING
 * ("<project-slug>/<endpoint-name>") as the `model` parameter.
 */
export const TOGETHER_DEDICATED_INFERENCE_API =
  "https://api-inference.together.ai/v1";

/**
 * Base models this project may fine-tune on Together AND still serve afterwards.
 *
 * Deliberately short. Together's docs warn that "some models can be fine-tuned
 * but cannot be deployed as dedicated endpoints", and this project has now paid
 * for that lesson twice: Qwen3-14B (LoRA, $4.00) and
 * Meta-Llama-3.1-8B-Instruct-Reference (full, $4.00) both trained successfully
 * and were then refused deployment. The surviving entries are the ones whose v2
 * registry row carries BOTH PRODUCT_FINE_TUNING and PRODUCT_DEDICATED with a
 * certified config - see selectDeployableFineTuneBases for why that, and not
 * "the architecture has a config", is the test that predicts servability.
 *
 * Verify with selectDeployableFineTuneBases(await fetchSupportedModels())
 * before trusting this list; Together's catalogue moves.
 */
export const TOGETHER_BASE_MODELS = [
  // 1x H100, full fine-tuning supported, certified config cr_Cd35Fpam3FrMdwHdmroZD.
  "Qwen/Qwen3.5-9B",
  // 4x H100. Proven end to end on this account by an earlier project's job.
  "meta-llama/Llama-3.3-70B-Instruct",
];

/**
 * Bases that train fine and then cannot be served, kept by name so nobody
 * rediscovers them the expensive way. Not a config option: a documented graveyard.
 */
export const TOGETHER_UNSERVABLE_BASE_MODELS = [
  "Qwen/Qwen3-14B",
  "mistralai/Mistral-Nemo-Instruct-2407",
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Reference",
];

export function togetherConfigured(): boolean {
  return !!process.env.TOGETHER_API_KEY;
}

function apiKey(): string {
  const k = process.env.TOGETHER_API_KEY;
  if (!k) {
    throw new Error(
      "Together not configured — set TOGETHER_API_KEY to fine-tune on Together",
    );
  }
  return k;
}

/**
 * Upload a JSONL training file, matching Together's current 3-step flow (as the
 * official SDK does it):
 *   1. POST /files with {purpose, file_name, file_type, sha256 checksum}; Together
 *      302s to a presigned R2 URL and returns the file id in `x-together-file-id`.
 *   2. PUT the raw bytes to that presigned URL.
 *   3. POST /files/{id}/preprocess to FINALIZE — without this the file stays at
 *      bytes=0 / PENDING and the fine-tune start rejects it with
 *      "Training file upload did not finish".
 * Returns the Together file id.
 */
export async function uploadTrainingFile(
  jsonl: string,
  fileName: string,
): Promise<string> {
  const bytes = Buffer.from(jsonl, "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");

  // 1. Request a presigned upload URL. The POST carries only metadata (no file
  //    part); the checksum + file_type are required by the current endpoint.
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append("file_name", fileName);
  form.append("file_type", "jsonl");
  form.append("checksum", checksum);

  const res = await fetch(`${TOGETHER_API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
    redirect: "manual", // we need to read the 302 Location + file-id headers
  });

  // Together dedupes by checksum: an identical dataset returns 409 with the id of
  // the already-uploaded file. Reuse it (it is already stored) rather than failing.
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { file_id?: string };
    if (body.file_id) {
      await waitForFileProcessed(body.file_id);
      return body.file_id;
    }
  }

  const fileId = res.headers.get("x-together-file-id");
  const location = res.headers.get("location");
  if (!fileId || !location) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Together file upload did not return a presigned URL (status ${res.status}): ${text}`,
    );
  }

  // 2. PUT the raw bytes to the presigned URL.
  const put = await fetch(location, { method: "PUT", body: bytes });
  if (!put.ok) {
    throw new Error(`Together presigned upload failed: ${put.status}`);
  }

  // 3. Finalize so Together ingests the R2 object.
  const pre = await fetch(`${TOGETHER_API}/files/${fileId}/preprocess`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!pre.ok) {
    const text = await pre.text().catch(() => "");
    throw new Error(
      `Together file preprocess/finalize failed (${pre.status}): ${text}`,
    );
  }

  // 4. Wait for Together to finish line-counting the file. Processing goes
  //    PENDING -> QUEUED -> RUNNING -> COMPLETED, and LineCount is only known at
  //    COMPLETED. Starting a fine-tune before then fails with "batch size is zero".
  await waitForFileProcessed(fileId);

  return fileId;
}

/** Poll a file until Together has processed it (COMPLETED with a line count). */
async function waitForFileProcessed(fileId: string): Promise<void> {
  const deadline = Date.now() + 300_000; // 5 min ceiling; training files are small
  let last = "";
  while (Date.now() < deadline) {
    const res = await fetch(`${TOGETHER_API}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (res.ok) {
      const d = (await res.json()) as {
        processing_status?: string;
        LineCount?: number;
      };
      last = d.processing_status ?? "";
      if (last === "COMPLETED" && (d.LineCount ?? 0) > 0) return;
      if (last === "FAILED" || last === "ERROR") {
        throw new Error(`Together file processing failed (status ${last})`);
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Together file not processed in time (last status: ${last})`);
}

export interface TogetherStartArgs {
  fileId: string;
  model: string;
  method: "sft" | "dpo";
  nEpochs?: number;
  learningRate?: number;
  dpoBeta?: number;
  batchSize?: number;
  /**
   * false = FULL fine-tune (every weight updated, output is a standalone model).
   * true  = LoRA adapter.
   * undefined = let Together decide, which today means LoRA.
   *
   * This matters far beyond training quality: a LoRA output can only be served
   * by attaching the adapter to a dedicated endpoint, while a full fine-tune's
   * output is a complete set of weights that deploys as an ordinary model. Left
   * unset, every job this project ever ran silently took the LoRA default.
   */
  lora?: boolean;
}

/**
 * Build the request body for a fine-tune. Exported for tests: the exact shape of
 * `training_type` is the difference between a servable full fine-tune and an
 * un-servable LoRA adapter, so it is worth asserting without a network call.
 */
export function buildFineTuneRequest(
  args: TogetherStartArgs,
): Record<string, unknown> {
  // Together's current API expects `training_method` as an OBJECT ({ method: ... })
  // and defaults `training_type` to LoRA when omitted. Sending the bare string form
  // 400s with "Could not create the FineTune object (Binding)".
  const trainingMethod: Record<string, unknown> =
    args.method === "dpo"
      ? {
          method: "dpo",
          ...(args.dpoBeta != null ? { dpo_beta: args.dpoBeta } : {}),
        }
      : { method: "sft" };
  return {
    training_file: args.fileId,
    model: args.model,
    training_method: trainingMethod,
    // `training_type` is a tagged object, not a boolean, on the wire: the SDK's
    // `lora=False` serializes to {"type": "Full"}. Omit it entirely when the
    // caller did not choose, so the backend default (LoRA) is unchanged for
    // every existing caller.
    ...(args.lora === false
      ? { training_type: { type: "Full" } }
      : args.lora === true
        ? { training_type: { type: "Lora" } }
        : {}),
    n_epochs: args.nEpochs ?? 3,
    learning_rate: args.learningRate ?? 1e-5,
    // The raw REST API does NOT resolve batch_size:"max" (the SDK computes that
    // client-side from model limits); omitting it or sending "max" fails with
    // "batch size is zero". Send a concrete integer. Likewise the API applies no
    // client-side defaults, so send the scalars it validates (checkpoints/evals).
    batch_size: args.batchSize ?? 8,
    n_checkpoints: 1,
    n_evals: 0,
  };
}

/** Start a fine-tune job. Returns Together's job id (used for polling). */
export async function startFineTune(args: TogetherStartArgs): Promise<string> {
  const body = buildFineTuneRequest(args);

  // The uploaded training file is validated asynchronously by Together; starting
  // the job too soon 400s with "Training file upload did not finish". Retry that
  // one transient case with backoff (a 400 creates no job, so retrying is safe).
  const MAX_ATTEMPTS = 8;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${TOGETHER_API}/fine-tunes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      if (!data.id)
        throw new Error("Together fine-tune start returned no job id");
      return data.id;
    }
    const text = await res.text().catch(() => "");
    lastErr = `Together fine-tune start failed (${res.status}): ${text}`;
    const transient = res.status === 400 && /upload did not finish/i.test(text);
    if (!transient || attempt === MAX_ATTEMPTS) break;
    await new Promise((r) => setTimeout(r, 5000)); // let file validation settle
  }
  throw new Error(lastErr);
}

export interface TogetherModelLimits {
  modelName: string;
  supportsFullTraining: boolean;
  /** Full fine-tuning batch bounds; absent when the model is LoRA-only. */
  fullTraining?: { minBatchSize: number; maxBatchSize: number };
  maxSeqLengthSft?: number;
}

/**
 * Ask Together what a base model actually supports, BEFORE uploading anything.
 *
 * The published docs table and the live account are not always the same thing,
 * and a full fine-tune requested against a LoRA-only base fails after the file
 * upload rather than before it. This is the cheap pre-spend gate.
 */
export async function fetchModelLimits(
  model: string,
): Promise<TogetherModelLimits> {
  const url = `${TOGETHER_API}/fine-tunes/models/limits?model_name=${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Together model limits failed (${res.status}): ${text}`);
  }
  const d = (await res.json()) as {
    model_name?: string;
    supports_full_training?: boolean;
    full_training?: { min_batch_size?: number; max_batch_size?: number } | null;
    max_seq_length_sft?: number;
  };
  return {
    modelName: d.model_name ?? model,
    supportsFullTraining: d.supports_full_training === true,
    fullTraining: d.full_training
      ? {
          minBatchSize: d.full_training.min_batch_size ?? 0,
          maxBatchSize: d.full_training.max_batch_size ?? 0,
        }
      : undefined,
    maxSeqLengthSft: d.max_seq_length_sft,
  };
}

/** Together's v2 registry, which is where deployability is decided. */
const TOGETHER_V2_API = "https://api.together.ai/v2";

/** One row of Together's v2 supported-models registry, trimmed to what matters. */
export interface TogetherSupportedModel {
  name: string;
  archId: string;
  baseModelId: string;
  products: string[];
  certifiedConfigIds: string[];
}

interface RawSupportedModel {
  id?: string;
  name?: string;
  baseModelId?: string;
  products?: string[];
  deploymentProfiles?: { certifiedConfigRevisionId?: string }[];
}

export function parseSupportedModels(
  rows: RawSupportedModel[],
): TogetherSupportedModel[] {
  return rows.map((m) => ({
    name: m.name ?? "",
    archId: m.id ?? "",
    baseModelId: m.baseModelId ?? "",
    products: m.products ?? [],
    certifiedConfigIds: (m.deploymentProfiles ?? [])
      .map((p) => p.certifiedConfigRevisionId ?? "")
      .filter(Boolean),
  }));
}

/**
 * Bases whose fine-tune output can actually be DEPLOYED afterwards.
 *
 * The predictor is that ONE registry entry carries BOTH products. That sounds
 * like a technicality and is not: a fine-tune's output model inherits the
 * `baseModelId` of the object it was trained from, and only that object's
 * certified configs are valid for it. When one entry holds both products, the
 * training base and the deployable base are the SAME object, so the output is
 * deployable (proven on this account by the Llama-3.3-70B fine-tune).
 *
 * When they are split across two objects the fine-tune lands on the
 * training-only one, which has no config, and the checkpoint is stranded. That
 * is not hypothetical: a full fine-tune of
 * meta-llama/Meta-Llama-3.1-8B-Instruct-Reference landed on the
 * training-only 8B object and Together refused to deploy it
 * ("No configs found for model ..."), even though the PRODUCTION
 * meta-llama/Llama-3.1-8B-Instruct object does carry a certified 1x H100
 * config. Checking the production twin's config is therefore the WRONG test -
 * it passes for a base that cannot work.
 */
export function selectDeployableFineTuneBases(
  models: TogetherSupportedModel[],
): TogetherSupportedModel[] {
  return models.filter(
    (m) =>
      m.products.includes("PRODUCT_FINE_TUNING") &&
      m.products.includes("PRODUCT_DEDICATED") &&
      m.certifiedConfigIds.length > 0,
  );
}

/** Fetch the v2 supported-models registry. */
export async function fetchSupportedModels(): Promise<
  TogetherSupportedModel[]
> {
  const res = await fetch(`${TOGETHER_V2_API}/supported-models?limit=200`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Together supported-models failed (${res.status}): ${text}`,
    );
  }
  const d = (await res.json()) as { data?: RawSupportedModel[] };
  return parseSupportedModels(d.data ?? []);
}

export interface TogetherPriceEstimate {
  /**
   * Plain USD. Note the unit mismatch with the job object, which reports
   * `total_price` in nano-USD: the estimator quotes dollars directly, so a
   * shared converter would be wrong on one side or the other.
   */
  estimatedUsd?: number;
  estimatedTrainTokens?: number;
  allowedToProceed?: boolean;
}

/**
 * Together's own price estimate for a job it has not run yet. Takes the
 * already-uploaded training file, so it prices the real dataset rather than a
 * row-count guess, and it is the last free checkpoint before money moves.
 */
export async function estimateJobPrice(
  args: TogetherStartArgs,
): Promise<TogetherPriceEstimate> {
  const body = buildFineTuneRequest(args);
  // The estimator takes the descriptive fields only; the knobs that shape a real
  // run (batch size, checkpoints, learning rate) are not part of the quote.
  delete body.batch_size;
  delete body.n_checkpoints;
  delete body.learning_rate;
  const res = await fetch(`${TOGETHER_API}/fine-tunes/estimate-price`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return {};
  const d = (await res.json()) as {
    estimated_total_price?: number;
    estimated_train_token_count?: number;
    allowed_to_proceed?: boolean;
  };
  return {
    estimatedUsd: d.estimated_total_price,
    estimatedTrainTokens: d.estimated_train_token_count,
    allowedToProceed: d.allowed_to_proceed,
  };
}

export interface TogetherPollResult {
  status: "running" | "succeeded" | "failed";
  outputModelId?: string;
  error?: string;
  /** Real billed cost in USD, when Together reports one. Beats our estimate. */
  costUsd?: number;
  /** "Full" or "Lora", straight from Together, so a silent LoRA cannot hide. */
  trainingType?: string;
  /** Set only for LoRA jobs. Its presence means the output needs an adapter target. */
  adapterModelId?: string;
  /** Tokens Together actually processed, for the cost-per-token record. */
  trainedTokens?: number;
}

const TERMINAL_OK = new Set(["completed"]);
const TERMINAL_BAD = new Set(["failed", "cancelled", "error"]);

/** Poll a Together fine-tune. Normalizes to running | succeeded | failed. */
export async function pollFineTune(jobId: string): Promise<TogetherPollResult> {
  const res = await fetch(`${TOGETHER_API}/fine-tunes/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Together poll failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    status?: string;
    output_name?: string;
    model_output_name?: string;
    adapter_output_name?: string;
    error?: string;
    total_price?: number;
    training_type?: { type?: string } | string | null;
    token_count?: number;
    total_tokens_processed?: number;
  };
  const status = (data.status ?? "").toLowerCase();
  const trainingType =
    typeof data.training_type === "string"
      ? data.training_type
      : (data.training_type?.type ?? undefined);
  if (TERMINAL_OK.has(status)) {
    return {
      status: "succeeded",
      trainingType,
      adapterModelId: data.adapter_output_name,
      trainedTokens: data.total_tokens_processed ?? data.token_count,
      // The servable model id comes back as `model_output_name` (e.g.
      // "acct/Qwen3-14B-92ef7bd3"); `output_name` is not returned by the current
      // API. Falling through to undefined here makes the caller register a
      // synthetic id that no inference endpoint can serve, so read all spellings.
      outputModelId:
        data.model_output_name ?? data.output_name ?? data.adapter_output_name,
      // Together bills total_price in nano-USD (1e-9 USD): a $4.00 run comes
      // back as 4000000000. Convert here so callers only ever see dollars.
      costUsd:
        typeof data.total_price === "number"
          ? data.total_price / 1_000_000_000
          : undefined,
    };
  }
  if (TERMINAL_BAD.has(status)) {
    return {
      status: "failed",
      error: data.error ?? `Together reported status: ${status}`,
    };
  }
  return { status: "running" };
}
