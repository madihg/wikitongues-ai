import { generateText, streamText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
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
 * which scaffolds the flywheel without changing this interface. Frontier
 * models can also be reached through an aggregator with the `openrouter`
 * provider, which is how the Claude arms are served: same wire format, its own
 * key, vendor-qualified model ids.
 */

export type CandidateProvider =
  "anthropic" | "openai" | "google" | "openai-compatible" | "openrouter";

/**
 * OpenRouter's OpenAI-compatible endpoint. Pinned here, exported so the cost
 * and registration scripts can name the exact host in their errors instead of
 * repeating a string literal that could drift.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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
  /** undefined = omit and let the provider default. See parseDecoding. */
  temperature?: number;
  topP?: number;
  maxTokens: number;
}

/**
 * OpenRouter request shim: turns EXTENDED THINKING OFF unless a candidate has
 * deliberately asked for it.
 *
 * Measured 2026-09-01 against anthropic/claude-opus-5 (OpenRouter routed it to
 * Amazon Bedrock): with the default settings a single 294-token-in request
 * came back with `content: null`, `finish_reason: "length"` and
 * `reasoning_tokens` equal to the ENTIRE completion budget - empty answers at
 * maxTokens 64, 300 and 512, and at the candidates' registered 4096 it spent
 * 4079 output tokens (~$0.10 and 61s for one answer) with the visible text
 * only just fitting before the cap.
 *
 * The direct Anthropic path this replaces did not think: the same arm's stored
 * outputs run a couple of hundred output tokens. Letting the transport swap
 * silently switch the model into a reasoning mode would (a) make new outputs
 * incomparable with the arm's own history, (b) multiply inference spend ~20x
 * against a metered budget, and (c) truncate answers whenever the trace eats
 * the budget first. A transport change must stay a transport change.
 *
 * `reasoning: { enabled: false }` is OpenRouter's unified switch; it is a
 * no-op for models that do not reason. Injected here rather than passed as a
 * decoding param because the AI SDK's OpenAI provider has no pass-through for
 * vendor-specific body fields, and an existing `reasoning` key is never
 * overwritten, so a future candidate can opt back in.
 */
export const openRouterFetch: typeof fetch = async (input, init) => {
  if (init && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.reasoning === undefined) {
        body.reasoning = { enabled: false };
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // Not JSON (should not happen on this path) - send it untouched rather
      // than failing the request over an optional flag.
    }
  }
  // Global lookup, not a captured reference: tests stub globalThis.fetch.
  return fetch(input, init);
};

export function resolveModel(candidate: CandidateLike): LanguageModel {
  const provider = candidate.provider as CandidateProvider;
  switch (provider) {
    case "anthropic": {
      // baseURL is pinned, never inherited. The SDK honours an ambient
      // ANTHROPIC_BASE_URL, and this machine's shell profile exports it
      // WITHOUT the /v1 path (some other tool wants the bare host) - the SDK
      // then requests /messages instead of /v1/messages and Anthropic answers
      // 404 "Not Found" regardless of key or model. That 404 spent days
      // masquerading as a dead API key. candidate.apiEndpoint still wins when
      // a row sets one explicitly, because that is a deliberate per-candidate
      // choice rather than ambient shell state.
      const provider = createAnthropic({
        baseURL: candidate.apiEndpoint ?? "https://api.anthropic.com/v1",
      });
      return provider(candidate.baseModelId);
    }
    case "openai":
      return openai(candidate.baseModelId);
    case "google":
      return google(candidate.baseModelId);
    case "openai-compatible": {
      // Self-hosted / open-weights served behind an OpenAI-compatible API.
      //
      // NEVER fall back to OPENAI_API_KEY here. "OpenAI-compatible" describes
      // the wire format, not the vendor: these candidates point at Together,
      // and handing Together an OpenAI key produces "Invalid API key provided.
      // You can find your API key at https://api.together.ai/settings/api-keys"
      // - an error that reads as "the Together key is wrong" when the truth is
      // that no Together key was ever set. That misdirection cost real time.
      //
      // TOGETHER_API_KEY is accepted as well as the generic name because the
      // scripts and the endpoint cost guard already use it, and requiring the
      // same secret under two names is how one of them ends up unset.
      const apiKey =
        process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.TOGETHER_API_KEY;
      if (!apiKey) {
        throw new Error(
          `No API key for openai-compatible host ${candidate.apiEndpoint ?? "(default)"}. ` +
            `Set OPENAI_COMPATIBLE_API_KEY (or TOGETHER_API_KEY) in this environment. ` +
            `An OpenAI key will NOT work against a third-party host.`,
        );
      }
      const client = createOpenAI({
        baseURL: candidate.apiEndpoint ?? undefined,
        // Strip stray quotes: a quoted value copied out of a .env file 401s in
        // a way that looks identical to a revoked key.
        apiKey: apiKey.trim().replace(/^["']|["']$/g, ""),
      });
      // .chat(), NOT client(...). The bare call resolves to OpenAI's RESPONSES
      // API, which only OpenAI itself implements - Together answers it with
      // "The requested model does not support the Responses api" and every
      // generation fails. Third-party OpenAI-compatible hosts implement
      // /v1/chat/completions, which is what .chat() targets.
      return client.chat(candidate.baseModelId);
    }
    case "openrouter": {
      // OpenRouter speaks the OpenAI wire format but is its own vendor with
      // its own key and its own vendor-qualified model ids
      // ("anthropic/claude-opus-5", not "claude-opus-5").
      //
      // NEVER fall back to ANTHROPIC_API_KEY, OPENAI_API_KEY or
      // TOGETHER_API_KEY here, for the same reason the openai-compatible case
      // above refuses OPENAI_API_KEY: a borrowed key produces a 401 that reads
      // as "the OpenRouter key is wrong" when the truth is that no OpenRouter
      // key was ever set. Routing Claude through OpenRouter exists precisely
      // because the direct Anthropic key is dead - quietly reaching for it
      // would resurrect the failure this path was built to escape.
      const apiKey = process.env.OPENROUTER_API_KEY;
      const host = candidate.apiEndpoint ?? OPENROUTER_BASE_URL;
      if (!apiKey) {
        throw new Error(
          `No API key for OpenRouter host ${host}. ` +
            `Set OPENROUTER_API_KEY in this environment. ` +
            `An Anthropic, OpenAI or Together key will NOT work against OpenRouter.`,
        );
      }
      const client = createOpenAI({
        baseURL: host,
        // Same stray-quote strip as the openai-compatible path: a quoted value
        // copied out of a .env file 401s indistinguishably from a revoked key.
        apiKey: apiKey.trim().replace(/^["']|["']$/g, ""),
        fetch: openRouterFetch,
      });
      // .chat() for the same reason as above: the bare call targets OpenAI's
      // Responses API, which OpenRouter does not implement. OpenRouter serves
      // /v1/chat/completions.
      //
      // Decoding note: candidates served here carry decodingParams
      // temperature null, the sanctioned opt-out for Claude Opus 5, which
      // REJECTS the temperature parameter ("`temperature` is deprecated for
      // this model") whether it is reached directly or through OpenRouter.
      // parseDecoding turns that null into undefined and generateText/
      // streamText then omit the field on the wire - nothing on this path may
      // substitute a default, which providers-openrouter.test.ts pins by
      // asserting the request body has no temperature key at all. (Thinking is
      // switched off by openRouterFetch above; see its header for why.)
      return client.chat(candidate.baseModelId);
    }
    default:
      // Unknown provider — fall back to Anthropic so the app never hard-crashes,
      // through the same pinned baseURL as the anthropic case above.
      return createAnthropic({ baseURL: "https://api.anthropic.com/v1" })(
        candidate.baseModelId || "claude-sonnet-4-5-20250929",
      );
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
    // null is the explicit opt-out: Claude Opus 5 REJECTS the temperature
    // parameter outright ("`temperature` is deprecated for this model"), so a
    // candidate whose decodingParams set temperature to null gets it omitted
    // entirely. Absence still defaults to 0.7 - changing that default would
    // silently alter every legacy candidate's sampling and break
    // comparability with their stored outputs.
    temperature: d.temperature === null ? undefined : num(d.temperature, 0.7),
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

/**
 * Everything a provider call needs, assembled once. Extracted from
 * generateForCandidate (2026-08-31) so the streaming path sends the
 * BYTE-IDENTICAL system prompt and message list as the buffered path - the
 * two must never drift, or a chat reviewer would be judging a different
 * composition than the eval harness measures.
 */
export function assembleGenerationRequest(
  candidate: CandidateLike,
  args: GenerateArgs,
): {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  decoding: Decoding;
  ragContextIds: string[];
} {
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
  // provider wired here (Anthropic, OpenAI, Google, OpenAI-compatible,
  // OpenRouter) takes
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

  return {
    system,
    messages,
    decoding,
    // Full retrieval provenance: RagEntry chunk ids plus the ColdAuthorAnswer
    // ids used as exemplars, prefixed so the two corpora stay distinguishable
    // when the row is read back months later.
    ragContextIds: [
      ...ragContext.map((c) => c.id),
      ...goldExamples.filter((g) => g.id).map((g) => `gold:${g.id}`),
    ],
  };
}

/** Generate one response for a candidate, fully described by its config. */
export async function generateForCandidate(
  candidate: CandidateLike,
  args: GenerateArgs,
): Promise<CandidateGeneration> {
  const start = Date.now();
  const { system, messages, decoding, ragContextIds } =
    assembleGenerationRequest(candidate, args);

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
    ragContextIds,
  };
}

/**
 * Streaming twin of generateForCandidate: identical request assembly (the
 * shared assembleGenerationRequest above), but tokens are surfaced through
 * onDelta as they arrive instead of buffering the full completion. The chat
 * route uses this so a reviewer starts reading after the first token, not
 * after the last - the perceived-latency complaint against rag-v3 was mostly
 * time-to-first-visible-character, and no retrieval change can fix that while
 * the route waits for the whole answer.
 *
 * The returned CandidateGeneration is the same shape as the buffered path, so
 * accounting (latency, tokens, provenance) stays identical downstream.
 * `modelForTest` lets unit tests inject a mock LanguageModel; production
 * callers omit it and get resolveModel(candidate).
 */
export async function streamForCandidate(
  candidate: CandidateLike,
  args: GenerateArgs,
  onDelta: (delta: string) => void,
  modelForTest?: LanguageModel,
): Promise<CandidateGeneration> {
  const start = Date.now();
  const { system, messages, decoding, ragContextIds } =
    assembleGenerationRequest(candidate, args);

  const result = streamText({
    model: modelForTest ?? resolveModel(candidate),
    system,
    messages,
    temperature: decoding.temperature,
    topP: decoding.topP,
    maxOutputTokens: decoding.maxTokens,
  });

  // fullStream, not textStream: the SDK routes provider failures through
  // `error` PARTS rather than throwing from the text iterator, so reading
  // textStream alone would turn a dead API key into a silent empty answer.
  // Surfacing the error part as a rejection keeps this path's error contract
  // identical to generateText's, which is what the chat route's per-model
  // catch depends on.
  let text = "";
  let streamError: unknown = null;
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      onDelta(part.text);
    } else if (part.type === "error") {
      streamError = part.error;
    }
  }
  if (streamError !== null) {
    throw streamError instanceof Error
      ? streamError
      : new Error(String(streamError));
  }
  const usage = await result.usage;

  return {
    text,
    modelId: candidate.baseModelId,
    latencyMs: Date.now() - start,
    tokensIn: usage?.inputTokens,
    tokensOut: usage?.outputTokens,
    ragContextIds,
  };
}
