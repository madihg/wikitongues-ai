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

/** Open-weights base models Together can fine-tune (SFT + DPO). */
export const TOGETHER_BASE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "Qwen/Qwen3-14B",
  "mistralai/Mistral-Nemo-Instruct-2407",
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
}

/** Start a fine-tune job. Returns Together's job id (used for polling). */
export async function startFineTune(args: TogetherStartArgs): Promise<string> {
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
  const body: Record<string, unknown> = {
    training_file: args.fileId,
    model: args.model,
    training_method: trainingMethod,
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

export interface TogetherPollResult {
  status: "running" | "succeeded" | "failed";
  outputModelId?: string;
  error?: string;
  /** Real billed cost in USD, when Together reports one. Beats our estimate. */
  costUsd?: number;
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
  };
  const status = (data.status ?? "").toLowerCase();
  if (TERMINAL_OK.has(status)) {
    return {
      status: "succeeded",
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
