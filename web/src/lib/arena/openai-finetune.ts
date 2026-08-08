/**
 * OpenAI fine-tuning client (the real adapter).
 *
 * Why this exists alongside together.ts: a Together LoRA over open weights
 * (Qwen3-14B) trains fine but cannot be SERVED without a dedicated GPU endpoint,
 * and endpoint creation is disabled on this account - so the trained checkpoint
 * could never enter the blind arena. An OpenAI-tuned model is servable the
 * instant the job finishes, on the same /v1/chat|responses path every baseline
 * already uses, with no infrastructure at all. That is what unblocks the
 * tuned-vs-baseline evaluation.
 *
 * Flow: upload JSONL to /v1/files (purpose fine-tune) -> create a supervised job
 * on /v1/fine_tuning/jobs -> poll until the job reports `fine_tuned_model`.
 *
 * Env: OPENAI_API_KEY.
 */

import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";

const OPENAI_API = "https://api.openai.com/v1";

/**
 * Base snapshots we are willing to fine-tune, most preferred first. Only exact
 * dated snapshot ids belong here: the floating aliases (gpt-4.1-mini) are not
 * accepted as fine-tune bases and would make a run unreproducible anyway.
 */
export const OPENAI_FINE_TUNE_BASE_MODELS = [
  "gpt-4.1-mini-2025-04-14",
  "gpt-4o-mini-2024-07-18",
  "gpt-4.1-nano-2025-04-14",
  "gpt-4.1-2025-04-14",
];

export function openAiFineTuneConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) {
    throw new Error(
      "OpenAI not configured - set OPENAI_API_KEY to fine-tune on OpenAI",
    );
  }
  return k;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}` };
}

// ─── Training-row construction ───────────────────────────────

export type OpenAiChatRole = "system" | "user" | "assistant";

export interface OpenAiChatMessage {
  role: OpenAiChatRole;
  content: string;
}

/** One line of an OpenAI supervised fine-tuning JSONL file. */
export interface OpenAiChatRow {
  messages: OpenAiChatMessage[];
}

/**
 * Build one supervised training row in OpenAI chat format.
 *
 * Two invariants this function exists to hold:
 *   1. The system turn is ALWAYS present, and defaults to the exact same
 *      IGALA_FORCING_INSTRUCTION used at serving time (providers.ts
 *      #buildSystemPrompt). Training under a different system prompt than the
 *      one the model is served with is a silent train/serve mismatch.
 *   2. The assistant turn is the community's Igala gold and NOTHING else. The
 *      English gloss / instruction-in-Igala / edit rationale that sit next to
 *      that gold in the database are training METADATA; if they leaked into a
 *      completion the model would learn to answer in English about Igala
 *      instead of answering in Igala. The caller passes only the gold text
 *      (see sft-source.ts, which never reads the gloss columns) and this
 *      builder concatenates nothing onto it.
 */
export function buildOpenAiChatRow(args: {
  systemPrompt?: string | null;
  prompt: string;
  completion: string;
}): OpenAiChatRow {
  const system = args.systemPrompt?.trim();
  const prompt = args.prompt?.trim() ?? "";
  const completion = args.completion?.trim() ?? "";
  if (!prompt) throw new Error("training row has an empty user turn");
  if (!completion) throw new Error("training row has an empty assistant turn");
  return {
    messages: [
      { role: "system", content: system || IGALA_FORCING_INSTRUCTION },
      { role: "user", content: prompt },
      { role: "assistant", content: completion },
    ],
  };
}

// ─── Base-model resolution ───────────────────────────────────

/** The account's visible model ids. Used to verify a base snapshot exists. */
export async function listModelIds(): Promise<string[]> {
  const res = await fetch(`${OPENAI_API}/models`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI model list failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string");
}

/**
 * Resolve the base snapshot to train from: the preferred id when this account
 * can see it, otherwise the first of OPENAI_FINE_TUNE_BASE_MODELS that it can.
 * Visibility in /v1/models is the only pre-flight signal the API offers; a model
 * that is visible but not tunable still fails loudly at job-create time, which
 * costs nothing.
 */
export async function resolveBaseModel(preferred: string): Promise<string> {
  const available = new Set(await listModelIds());
  if (preferred && available.has(preferred)) return preferred;
  for (const candidate of OPENAI_FINE_TUNE_BASE_MODELS) {
    if (available.has(candidate)) return candidate;
  }
  throw new Error(
    `No fine-tunable OpenAI base model available on this account (wanted ${preferred || "any"})`,
  );
}

// ─── Files ───────────────────────────────────────────────────

/**
 * Upload a JSONL training file. OpenAI takes a single multipart POST (no
 * presigned-URL dance, unlike Together) and returns the file id immediately.
 */
export async function uploadTrainingFile(
  jsonl: string,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    fileName,
  );

  const res = await fetch(`${OPENAI_API}/files`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI file upload failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("OpenAI file upload returned no file id");
  return data.id;
}

// ─── Jobs ────────────────────────────────────────────────────

export interface OpenAiStartArgs {
  fileId: string;
  model: string;
  /** Appears in the resulting model id; <= 18 chars, [a-zA-Z0-9-_]. */
  suffix?: string;
  nEpochs?: number;
  learningRateMultiplier?: number;
  batchSize?: number;
}

/** Start a supervised fine-tune. Returns OpenAI's job id (used for polling). */
export async function startFineTune(args: OpenAiStartArgs): Promise<string> {
  // Omitted hyperparameters are chosen by OpenAI from the dataset size, which is
  // the right default for a few-hundred-row set; we only send what the caller set.
  const hyperparameters: Record<string, unknown> = {};
  if (args.nEpochs != null) hyperparameters.n_epochs = args.nEpochs;
  if (args.batchSize != null) hyperparameters.batch_size = args.batchSize;
  if (args.learningRateMultiplier != null) {
    hyperparameters.learning_rate_multiplier = args.learningRateMultiplier;
  }

  const body: Record<string, unknown> = {
    training_file: args.fileId,
    model: args.model,
    // The current API nests hyperparameters under `method`; the flat top-level
    // `hyperparameters` field is deprecated.
    method: {
      type: "supervised",
      supervised:
        Object.keys(hyperparameters).length > 0 ? { hyperparameters } : {},
    },
    ...(args.suffix ? { suffix: args.suffix } : {}),
  };

  const res = await fetch(`${OPENAI_API}/fine_tuning/jobs`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI fine-tune start failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("OpenAI fine-tune start returned no job id");
  return data.id;
}

export interface OpenAiPollResult {
  status: "running" | "succeeded" | "failed";
  /** The servable model id, e.g. ft:gpt-4.1-mini-2025-04-14:org:suffix:abc123. */
  outputModelId?: string;
  error?: string;
  /** Tokens actually billed for training (epochs already folded in). */
  trainedTokens?: number;
  /** Raw provider status, for logs. */
  rawStatus?: string;
}

const TERMINAL_OK = new Set(["succeeded"]);
const TERMINAL_BAD = new Set(["failed", "cancelled"]);

/** Poll an OpenAI fine-tune. Normalizes to running | succeeded | failed. */
export async function pollFineTune(jobId: string): Promise<OpenAiPollResult> {
  const res = await fetch(`${OPENAI_API}/fine_tuning/jobs/${jobId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI poll failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    status?: string;
    fine_tuned_model?: string | null;
    trained_tokens?: number | null;
    error?: { message?: string | null; code?: string | null } | null;
  };
  const status = (data.status ?? "").toLowerCase();
  const trainedTokens =
    typeof data.trained_tokens === "number" ? data.trained_tokens : undefined;

  if (TERMINAL_OK.has(status)) {
    return {
      status: "succeeded",
      outputModelId: data.fine_tuned_model ?? undefined,
      trainedTokens,
      rawStatus: status,
    };
  }
  if (TERMINAL_BAD.has(status)) {
    return {
      status: "failed",
      error:
        data.error?.message ?? `OpenAI reported status: ${status || "unknown"}`,
      rawStatus: status,
    };
  }
  // validating_files | queued | running -> still in flight.
  return { status: "running", trainedTokens, rawStatus: status };
}
