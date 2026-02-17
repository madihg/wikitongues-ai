import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { searchRag } from "@/lib/rag";
import type { RagEntry } from "@prisma/client";

// ─── Interfaces ─────────────────────────────────────────────

export interface TranslatorInput {
  learnerMessage: string;
  language: string; // "igala" or "lebanese_arabic"
  conversationHistory?: { role: string; content: string }[];
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

// ─── Constants ──────────────────────────────────────────────

const MODEL_ALIAS = "claude";
const MODEL_ID = "claude-sonnet-4-5-20250929";

const LANGUAGE_CONTEXT: Record<string, string> = {
  igala: [
    "You are a cultural and linguistic expert in the Igala language.",
    "Igala is a West Benue-Congo language spoken primarily in Kogi State, Nigeria.",
    "It is a tonal language with a rich oral tradition encompassing proverbs, folk tales, and ceremonial speech.",
    "Pay close attention to tonal distinctions, noun class agreements, and idiomatic expressions unique to Igala.",
  ].join(" "),
  lebanese_arabic: [
    "You are a cultural and linguistic expert in Lebanese Arabic.",
    "Lebanese Arabic is a Levantine Arabic dialect spoken in Lebanon.",
    "It has no standard orthography and differs significantly from Modern Standard Arabic (MSA) in phonology, vocabulary, and grammar.",
    "Distinguish clearly between Lebanese dialect forms and MSA when relevant.",
    "Be sensitive to regional variations within Lebanon and the influence of French and English loanwords.",
  ].join(" "),
};

// ─── System prompt builder ──────────────────────────────────

function buildSystemPrompt(language: string, ragEntries: RagEntry[]): string {
  const languageIntro =
    LANGUAGE_CONTEXT[language] ??
    `You are a cultural and linguistic expert in the language "${language}".`;

  const coreInstructions = [
    "Respond naturally and authentically in the target language.",
    "Provide cultural context where it is relevant to the learner's question.",
    "If you are uncertain about vocabulary, grammar, or cultural context, explicitly say so rather than guessing.",
    "Do NOT hallucinate. If you don't know something, say \"I'm not sure about this\".",
  ].join("\n");

  let ragBlock: string;
  if (ragEntries.length > 0) {
    const formattedEntries = ragEntries
      .map((e, i) => `[${i + 1}] (${e.chunkType} — ${e.topic})\n${e.content}`)
      .join("\n\n");
    ragBlock = `Use the following verified knowledge to ground your response:\n\n${formattedEntries}`;
  } else {
    ragBlock =
      "No verified knowledge base entries were found for this query. Be extra cautious and flag any uncertainty.";
  }

  return `${languageIntro}\n\n${coreInstructions}\n\n${ragBlock}`;
}

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
  const hasUncertainty = UNCERTAINTY_MARKERS.some((marker) =>
    lower.includes(marker),
  );

  return hasUncertainty ? "medium" : "high";
}

// ─── Main entry point ───────────────────────────────────────

export async function translate(
  input: TranslatorInput,
): Promise<TranslatorOutput> {
  const start = Date.now();

  // 1. Query RAG
  const ragEntries = await searchRag(input.learnerMessage, input.language, 5);
  const ragContextUsed = ragEntries.length > 0;
  const ragContextIds = ragEntries.map((e) => e.id);

  // 2. Build system prompt
  const systemPrompt = buildSystemPrompt(input.language, ragEntries);

  // 3. Build message list from conversation history
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (input.conversationHistory) {
    for (const msg of input.conversationHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: "user", content: input.learnerMessage });

  // 4. Call model
  const result = await generateText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages,
    temperature: 0.7,
    maxOutputTokens: 1024,
  });

  const outputText = result.text;
  const latencyMs = Date.now() - start;

  // 5. Assess confidence
  const selfReportedConfidence = assessConfidence(outputText, ragContextUsed);

  return {
    outputText,
    ragContextIds,
    ragContextUsed,
    selfReportedConfidence,
    model: MODEL_ALIAS,
    modelId: MODEL_ID,
    latencyMs,
  };
}
