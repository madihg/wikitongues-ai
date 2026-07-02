import { searchRag } from "@/lib/rag";
import {
  generateForCandidate,
  type CandidateLike,
  type RagChunk,
} from "@/lib/arena/providers";

// ─── Interfaces ─────────────────────────────────────────────

export interface TranslatorInput {
  learnerMessage: string;
  language: string; // "igala"
  conversationHistory?: { role: string; content: string }[];
  /** Optional candidate to drive generation. Defaults to DEFAULT_CANDIDATE — this is the model-swap seam. */
  candidate?: CandidateLike;
}

export interface TranslatorOutput {
  outputText: string;
  ragContextIds: string[];
  ragContextUsed: boolean;
  selfReportedConfidence: "high" | "medium" | "low";
  model: string;
  modelId: string;
  latencyMs: number;
}

// ─── Default learner-pipeline candidate ─────────────────────
// The learner chat used to be hard-coded to Claude. It now runs whichever
// candidate is passed in; this is the fallback when none is given.

const IGALA_SYSTEM = [
  "You are a cultural and linguistic expert in the Igala language.",
  "Igala is a West Benue-Congo (Yoruboid) language spoken primarily in Kogi State, Nigeria.",
  "It is a tonal language with a rich oral tradition encompassing proverbs, folk tales, and ceremonial speech.",
  "Pay close attention to tonal distinctions, honorifics, and idiomatic expressions unique to Igala.",
  "Do not confuse Igala with neighboring languages such as Idoma, Yoruba, or Igbo.",
  "",
  "Respond naturally and authentically in Igala. Provide cultural context where relevant.",
  "If you are uncertain about vocabulary, grammar, tone, or cultural context, explicitly say so rather than guessing.",
  "Do NOT hallucinate. If you don't know something, say \"I'm not sure about this\".",
].join("\n");

export const DEFAULT_CANDIDATE: CandidateLike = {
  // Most powerful model that is currently funded. To use Claude instead, switch to
  //   { name: "claude", provider: "anthropic", baseModelId: "claude-opus-4-8" }
  // once the Anthropic account has credit.
  name: "gpt-4.1",
  provider: "openai",
  baseModelId: "gpt-4.1",
  useSystemPrompt: true,
  systemPrompt: IGALA_SYSTEM,
  ragEnabled: true,
  decodingParams: { temperature: 0.7, maxTokens: 1024 },
};

// ─── Confidence heuristic ───────────────────────────────────

const UNCERTAINTY_MARKERS = [
  "i'm not sure",
  "i don't know",
  "uncertain",
  "i am not sure",
  "i am not certain",
  "not confident",
  "i cannot confirm",
  "i can't confirm",
];

function assessConfidence(
  outputText: string,
  ragContextUsed: boolean,
): "high" | "medium" | "low" {
  if (!ragContextUsed) return "low";
  const lower = outputText.toLowerCase();
  const hasUncertainty = UNCERTAINTY_MARKERS.some((m) => lower.includes(m));
  return hasUncertainty ? "medium" : "high";
}

// ─── Main entry point ───────────────────────────────────────

export async function translate(
  input: TranslatorInput,
): Promise<TranslatorOutput> {
  const candidate = input.candidate ?? DEFAULT_CANDIDATE;

  // 1. Query RAG (only used if the candidate has RAG enabled)
  const ragEntries = candidate.ragEnabled
    ? await searchRag(input.learnerMessage, input.language, 5)
    : [];
  const ragContext: RagChunk[] = ragEntries.map((e) => ({
    id: e.id,
    content: e.content,
    topic: e.topic,
    chunkType: e.chunkType,
  }));
  const ragContextUsed = ragContext.length > 0;

  // 2. Generate through the swappable provider layer
  const result = await generateForCandidate(candidate, {
    userMessage: input.learnerMessage,
    conversationHistory: input.conversationHistory,
    ragContext,
  });

  return {
    outputText: result.text,
    ragContextIds: result.ragContextIds,
    ragContextUsed,
    selfReportedConfidence: assessConfidence(result.text, ragContextUsed),
    model: candidate.name ?? candidate.provider,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
  };
}
