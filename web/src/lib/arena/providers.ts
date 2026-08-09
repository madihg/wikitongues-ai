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

/**
 * A community gold (question, answer) pair to prepend as an in-context
 * demonstration. Produced by src/lib/arena/gold-retrieval.ts, which owns the
 * retrieval and the contamination guard; this module only formats and sends.
 */
export interface GoldExample {
  /** ColdAuthorAnswer.id, recorded on the output so retrieval is auditable. */
  id?: string;
  question: string;
  answer: string;
}

export interface GenerateArgs {
  userMessage: string;
  conversationHistory?: { role: string; content: string }[];
  ragContext?: RagChunk[];
  /**
   * Retrieved community gold, best match LAST. Only used when the candidate has
   * ragEnabled, exactly like ragContext, so a plain baseline can never
   * accidentally be handed exemplars and stop being a baseline.
   */
  goldExamples?: GoldExample[];
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
      // .chat(), NOT client(...). The bare call resolves to OpenAI's RESPONSES
      // API, which only OpenAI itself implements - Together answers it with
      // "The requested model does not support the Responses api" and every
      // generation fails. Third-party OpenAI-compatible hosts implement
      // /v1/chat/completions, which is what .chat() targets.
      return client.chat(candidate.baseModelId);
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

/**
 * Instruction attached when community gold exemplars are in the message list.
 * It has to say "match the FORM, do not reuse the CONTENT", because the failure
 * mode of demonstrations on a tiny corpus is a model that answers the exemplar
 * instead of the question in front of it.
 */
export const GOLD_EXAMPLE_INSTRUCTION =
  "The conversation begins with real question-and-answer pairs written by Igala speakers themselves. " +
  "Study them for FORM: the orthography and tone-marking they actually use, the register, and above all the LENGTH " +
  "(a one-word question gets a one-word answer, with no explanation attached). " +
  "Match that form in your own answer. Do NOT reuse their content, and do not answer their questions - answer only the final question asked of you.";

export function buildSystemPrompt(
  candidate: CandidateLike,
  ragContext?: RagChunk[],
  override?: string,
  goldExampleCount = 0,
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
  let base = custom
    ? `${IGALA_FORCING_INSTRUCTION}\n\n${custom}`
    : IGALA_FORCING_INSTRUCTION;

  if (candidate.ragEnabled && goldExampleCount > 0) {
    base = `${base}\n\n${GOLD_EXAMPLE_INSTRUCTION}`;
  }

  if (candidate.ragEnabled && ragContext && ragContext.length > 0) {
    const formatted = ragContext
      .map(
        (e, i) =>
          `[${i + 1}] (${e.chunkType ?? "note"} — ${e.topic ?? ""})\n${e.content}`,
      )
      .join("\n\n");
    // NOT "verified". Of the live Igala entries, none are community-verified:
    // they are externally sourced from Wikipedia, Wiktionary, an 1854 wordlist
    // and a machine-derived lexicon, and several carry written warnings in
    // their own body text. Telling the model this material is verified invites
    // it to state a machine-derived gloss as fact to a native speaker, and this
    // same string is what an annotator sees on the reference panel.
    return `${base}\n\nReference material of mixed reliability, from open sources. It is NOT community-verified: some entries are machine-derived, use non-standard transcription, or may be wrong. Prefer it over guessing, but do not treat it as authoritative, and do not copy a form you have reason to doubt:\n\n${formatted}`;
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
  // Retrieved community gold is gated on ragEnabled for the same reason
  // ragContext is: a candidate registered as a plain baseline must stay plain.
  const goldExamples = candidate.ragEnabled ? (args.goldExamples ?? []) : [];
  const system = buildSystemPrompt(
    candidate,
    ragContext,
    args.systemPromptOverride,
    goldExamples.length,
  );

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  // Few-shot exemplars (empty today - see generation-prompt.ts) go first, as
  // priming turns ahead of any real conversation history.
  messages.push(...buildFewShotTurns(args.userMessage));
  // Retrieved community gold next, modeled as real prior chat turns. Every
  // provider wired here (Anthropic, OpenAI, Google, OpenAI-compatible) takes
  // multi-turn messages through the AI SDK, so this one path is
  // provider-agnostic - no per-provider formatting fallback is needed.
  const current = args.userMessage.trim();
  for (const ex of goldExamples) {
    // Never echo the answer to the exact question being graded. The promptId
    // guard in gold-retrieval.ts is the real defence; this is belt and braces.
    if (ex.question.trim() === current) continue;
    messages.push({ role: "user", content: ex.question });
    messages.push({ role: "assistant", content: ex.answer });
  }
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
    // Full retrieval provenance: RagEntry chunk ids plus the ColdAuthorAnswer
    // ids used as exemplars, prefixed so the two corpora stay distinguishable
    // when the row is read back months later.
    ragContextIds: [
      ...ragContext.map((c) => c.id),
      ...goldExamples.filter((g) => g.id).map((g) => `gold:${g.id}`),
    ],
  };
}
