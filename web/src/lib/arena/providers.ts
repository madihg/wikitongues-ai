import { generateText, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import {
  IGALA_FORCING_INSTRUCTION,
  buildFewShotTurns,
} from "@/lib/generation-prompt";

/**
 * Model-swapping core. Resolves any registered candidate configuration to a
 * provider call, so "Claude baseline", "Gemini + RAG", and "Gemma + DPO" are
 * all just configs that flow through the same generation path.
 *
 * Open-weights / fine-tuned variants are served via an OpenAI-compatible
 * endpoint (Together / Fireworks / vLLM) — the `openai-compatible` provider —
 * which scaffolds the flywheel without changing this interface.
 */

export type CandidateProvider =
  "anthropic" | "openai" | "google" | "openai-compatible";

export interface CandidateLike {
  id?: string;
  name?: string;
  provider: string;
  baseModelId: string;
  apiEndpoint?: string | null;
  systemPrompt?: string | null;
  useSystemPrompt?: boolean;
  ragEnabled?: boolean;
  decodingParams?: unknown;
}

export interface RagChunk {
  id: string;
  content: string;
  topic?: string | null;
  chunkType?: string | null;
}

export interface GenerateArgs {
  userMessage: string;
  conversationHistory?: { role: string; content: string }[];
  ragContext?: RagChunk[];
  systemPromptOverride?: string;
}

export interface CandidateGeneration {
  text: string;
  modelId: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  ragContextIds: string[];
}

interface Decoding {
  temperature: number;
  topP?: number;
  maxTokens: number;
}

export function resolveModel(candidate: CandidateLike): LanguageModel {
  const provider = candidate.provider as CandidateProvider;
  switch (provider) {
    case "anthropic":
      return anthropic(candidate.baseModelId);
    case "openai":
      return openai(candidate.baseModelId);
    case "google":
      return google(candidate.baseModelId);
    case "openai-compatible": {
      // Self-hosted / open-weights served behind an OpenAI-compatible API.
      const client = createOpenAI({
        baseURL: candidate.apiEndpoint ?? undefined,
        apiKey:
          process.env.OPENAI_COMPATIBLE_API_KEY ??
          process.env.OPENAI_API_KEY ??
          "not-needed",
      });
      return client(candidate.baseModelId);
    }
    default:
      // Unknown provider — fall back to Anthropic default so the app never hard-crashes.
      return anthropic(candidate.baseModelId || "claude-sonnet-4-5-20250929");
  }
}

function parseDecoding(raw: unknown): Decoding {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    temperature: num(d.temperature, 0.7),
    topP: typeof d.topP === "number" ? d.topP : undefined,
    maxTokens: num(d.maxTokens, 1024),
  };
}

export function buildSystemPrompt(
  candidate: CandidateLike,
  ragContext?: RagChunk[],
  override?: string,
): string {
  const custom =
    override ??
    (candidate.useSystemPrompt && candidate.systemPrompt
      ? candidate.systemPrompt
      : undefined);

  // Always lead with the hard Igala-forcing instruction, whether or not a
  // candidate carries its own custom system prompt (e.g. the RAG variants'
  // seed-arena.ts config) or a caller passes systemPromptOverride. This is
  // what stops generation from drifting into English scaffolding or the
  // wrong language entirely - see src/lib/generation-prompt.ts.
  const base = custom
    ? `${IGALA_FORCING_INSTRUCTION}\n\n${custom}`
    : IGALA_FORCING_INSTRUCTION;

  if (candidate.ragEnabled && ragContext && ragContext.length > 0) {
    const formatted = ragContext
      .map(
        (e, i) =>
          `[${i + 1}] (${e.chunkType ?? "note"} — ${e.topic ?? ""})\n${e.content}`,
      )
      .join("\n\n");
    return `${base}\n\nUse the following verified Igala knowledge to ground your response:\n\n${formatted}`;
  }
  return base;
}

/** Generate one response for a candidate, fully described by its config. */
export async function generateForCandidate(
  candidate: CandidateLike,
  args: GenerateArgs,
): Promise<CandidateGeneration> {
  const start = Date.now();
  const decoding = parseDecoding(candidate.decodingParams);
  const ragContext = candidate.ragEnabled ? (args.ragContext ?? []) : [];
  const system = buildSystemPrompt(
    candidate,
    ragContext,
    args.systemPromptOverride,
  );

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  // Few-shot exemplars (empty today - see generation-prompt.ts) go first, as
  // priming turns ahead of any real conversation history.
  messages.push(...buildFewShotTurns(args.userMessage));
  if (args.conversationHistory) {
    for (const msg of args.conversationHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: "user", content: args.userMessage });

  const result = await generateText({
    model: resolveModel(candidate),
    system,
    messages,
    temperature: decoding.temperature,
    topP: decoding.topP,
    maxOutputTokens: decoding.maxTokens,
  });

  const usage = result.usage;

  return {
    text: result.text,
    modelId: candidate.baseModelId,
    latencyMs: Date.now() - start,
    tokensIn: usage?.inputTokens,
    tokensOut: usage?.outputTokens,
    ragContextIds: ragContext.map((c) => c.id),
  };
}
