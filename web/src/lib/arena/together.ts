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
 * Upload a JSONL training file. Together responds to the POST with a 302 whose
 * Location is a presigned R2 URL and whose `x-together-file-id` header is the file
 * id; we then PUT the bytes directly to that URL. Returns the Together file id.
 */
export async function uploadTrainingFile(
  jsonl: string,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append("file_name", fileName);
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    fileName,
  );

  const res = await fetch(`${TOGETHER_API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
    redirect: "manual", // we need to read the 302 Location + file-id headers
  });

  const fileId = res.headers.get("x-together-file-id");
  const location = res.headers.get("location");
  if (!fileId || !location) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Together file upload did not return a presigned URL (status ${res.status}): ${text}`,
    );
  }

  const put = await fetch(location, { method: "PUT", body: jsonl });
  if (!put.ok) {
    throw new Error(`Together presigned upload failed: ${put.status}`);
  }
  return fileId;
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
  const body: Record<string, unknown> = {
    training_file: args.fileId,
    model: args.model,
    training_method: args.method,
    n_epochs: args.nEpochs ?? 3,
    learning_rate: args.learningRate ?? 1e-5,
  };
  if (args.method === "dpo" && args.dpoBeta != null)
    body.dpo_beta = args.dpoBeta;
  if (args.batchSize != null) body.batch_size = args.batchSize;

  const res = await fetch(`${TOGETHER_API}/fine-tunes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Together fine-tune start failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Together fine-tune start returned no job id");
  return data.id;
}

export interface TogetherPollResult {
  status: "running" | "succeeded" | "failed";
  outputModelId?: string;
  error?: string;
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
    error?: string;
  };
  const status = (data.status ?? "").toLowerCase();
  if (TERMINAL_OK.has(status)) {
    return { status: "succeeded", outputModelId: data.output_name };
  }
  if (TERMINAL_BAD.has(status)) {
    return {
      status: "failed",
      error: data.error ?? `Together reported status: ${status}`,
    };
  }
  return { status: "running" };
}
