import { prisma } from "@/lib/prisma";
import { OPENROUTER_BASE_URL } from "@/lib/arena/providers";
import { estimateGenerationCostUsd } from "@/lib/arena/pricing";

/**
 * The one OpenRouter client for the speech programme's LLM steps. Plain
 * fetch, not the Vercel AI SDK: we need the response's cost field and a hard
 * timeout, and every call writes a CostEntry row.
 *
 * - 60 s timeout per attempt (AbortController).
 * - Up to 3 retries with exponential backoff and jitter on 429, 5xx, network
 *   errors and timeouts. Never on any other 4xx.
 * - Cost: the response's usage.cost when OpenRouter sends it (estimated
 *   false), otherwise tokens times the pricing table (estimated true).
 * - The label is written to the ledger as given. Callers must keep Igala text
 *   out of it; refType and refId are for ids only.
 * - No Igala forcing instruction is added here. What is sent is what the
 *   caller passed.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  refType?: string;
  refId?: string;
  label: string;
  createdById?: string;
  /** Per-attempt timeout. Default 60 000. Tests shorten it. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 3. */
  maxRetries?: number;
  /** First backoff step in ms, doubled each retry. Default 500. */
  backoffMs?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** True when costUsd came from the price table, false when OpenRouter reported it. */
  estimated: boolean;
}

export class OpenRouterError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryable(err: OpenRouterError): boolean {
  if (err.status === undefined) return true; // network error or timeout
  return err.status === 429 || err.status >= 500;
}

async function attempt(
  url: string,
  key: string,
  body: string,
  timeoutMs: number,
): Promise<CompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      // Status only: the response body can echo the prompt.
      throw new OpenRouterError(`OpenRouter returned ${res.status}`, res.status);
    }
    return (await res.json()) as CompletionResponse;
  } catch (e) {
    if (e instanceof OpenRouterError) throw e;
    if (controller.signal.aborted) {
      throw new OpenRouterError(`OpenRouter call timed out after ${timeoutMs} ms`);
    }
    throw new OpenRouterError(
      `OpenRouter network error: ${e instanceof Error ? e.message : "unknown"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set. Add it to this environment to use the speech LLM steps.",
    );
  }
  const base = (process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const body = JSON.stringify({
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    usage: { include: true },
  });
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 3;
  const backoffMs = opts.backoffMs ?? 500;

  let json: CompletionResponse | undefined;
  for (let n = 0; ; n++) {
    try {
      json = await attempt(url, key, body, timeoutMs);
      break;
    } catch (e) {
      const err = e as OpenRouterError;
      if (n >= maxRetries || !retryable(err)) throw err;
      await sleep(backoffMs * 2 ** n * (0.5 + Math.random()));
    }
  }

  const text: string = json?.choices?.[0]?.message?.content ?? "";
  const usage = json?.usage ?? {};
  const tokensIn: number = usage.prompt_tokens ?? 0;
  const tokensOut: number = usage.completion_tokens ?? 0;
  const reported = typeof usage.cost === "number" ? usage.cost : null;
  const estimated = reported === null;
  const costUsd =
    reported ??
    estimateGenerationCostUsd({ modelId: opts.model, tokensIn, tokensOut });

  try {
    await prisma.costEntry.create({
      data: {
        category: "inference",
        provider: "openrouter",
        label: opts.label,
        amountUsd: costUsd,
        estimated,
        refType: opts.refType,
        refId: opts.refId,
        createdById: opts.createdById,
      },
    });
  } catch (e) {
    // The answer was paid for; losing the ledger row must not lose the answer.
    console.error(
      `[openrouter] cost row not written (${costUsd} USD, ${opts.model}): ${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  return { text, model: opts.model, tokensIn, tokensOut, costUsd, estimated };
}
