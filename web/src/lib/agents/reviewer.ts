import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

// ─── Types ──────────────────────────────────────────────────

export interface ReviewerInput {
  originalMessage: string;
  translatorOutput: string;
  language: string; // "igala" or "lebanese_arabic"
  ragContext: {
    id: string;
    content: string;
    chunkType: string;
    topic: string;
  }[];
}

export interface ReviewerOutput {
  passed: boolean;
  confidenceScore: number; // 0-100
  reasoning: string;
  gapCategory:
    | "missing_vocabulary"
    | "missing_cultural_context"
    | "missing_dialect_knowledge"
    | "missing_translation_pair"
    | null;
  issues: string[];
  latencyMs: number;
}

// ─── Language-specific system prompts ───────────────────────

const LANGUAGE_CONTEXT: Record<string, string> = {
  igala: `You are a linguistic and cultural reviewer specializing in the Igala language.

Igala is a West Benue-Congo language spoken primarily in Kogi State, Nigeria. It is a tonal language with limited digital resources and documentation. When reviewing translations or responses involving Igala:
- Pay close attention to tonal accuracy and how tone is represented
- Verify that vocabulary aligns with known Igala lexical resources
- Check for cultural appropriateness within Igala cultural norms and traditions
- Be alert to invented words or phrases that may not exist in Igala
- Note that Igala has very limited digital presence, so the model may hallucinate vocabulary`,

  lebanese_arabic: `You are a linguistic and cultural reviewer specializing in Lebanese Arabic.

Lebanese Arabic is a Levantine Arabic dialect spoken in Lebanon. It has non-standard orthography and differs significantly from Modern Standard Arabic (MSA). When reviewing translations or responses involving Lebanese Arabic:
- Distinguish carefully between Lebanese dialect features and MSA — using MSA where Lebanese should be used is a dialect mismatch
- Account for common code-switching norms (French and English borrowings are natural in Lebanese Arabic)
- Verify cultural references are appropriate to Lebanese culture, not generic Arab culture
- Check that informal/colloquial register is used appropriately rather than formal MSA
- Note that orthographic conventions may vary — focus on phonological and grammatical accuracy`,
};

// ─── Review function ────────────────────────────────────────

export async function review(input: ReviewerInput): Promise<ReviewerOutput> {
  const start = Date.now();

  const languageContext =
    LANGUAGE_CONTEXT[input.language] ??
    `You are a linguistic and cultural reviewer specializing in ${input.language}.`;

  const systemPrompt = `${languageContext}

Your task is to evaluate a translator agent's output for accuracy, cultural appropriateness, and linguistic authenticity. You will be given the learner's original message, the translator's response, and any RAG (retrieval-augmented generation) context that was available.

Evaluate the response and output a JSON object with exactly these fields:
- "passed": boolean — whether the response meets quality standards
- "confidence_score": number 0-100 — your confidence in the quality of the translation/response
- "reasoning": string — detailed explanation of your assessment
- "gap_category": string or null — one of "missing_vocabulary", "missing_cultural_context", "missing_dialect_knowledge", "missing_translation_pair", or null if no gap
- "issues": string[] — array of specific issues found, chosen from: "potential_hallucination", "dialect_mismatch", "cultural_insensitivity", "factual_error"

Respond ONLY with the JSON object, no additional text.`;

  const ragSection =
    input.ragContext.length > 0
      ? input.ragContext
          .map((r) => `[${r.chunkType}] Topic: ${r.topic}\n${r.content}`)
          .join("\n\n")
      : "No RAG context was available for this response.";

  const userMessage = `## Learner's original message
${input.originalMessage}

## Translator's response
${input.translatorOutput}

## RAG context used
${ragSection}

Please evaluate the translator's response and return your assessment as JSON.`;

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.3,
      maxOutputTokens: 1024,
    });

    const parsed = parseReviewJson(text);
    return applyScoring(parsed, input, Date.now() - start);
  } catch (error) {
    return {
      passed: false,
      confidenceScore: 0,
      reasoning: `Reviewer agent error: ${error instanceof Error ? error.message : String(error)}`,
      gapCategory: null,
      issues: ["reviewer_error"],
      latencyMs: Date.now() - start,
    };
  }
}

// ─── JSON parsing ───────────────────────────────────────────

interface RawReview {
  passed: boolean;
  confidence_score: number;
  reasoning: string;
  gap_category: string | null;
  issues: string[];
}

function parseReviewJson(text: string): RawReview | null {
  // Try direct parse first
  try {
    const obj = JSON.parse(text);
    if (isValidReview(obj)) return obj;
  } catch {
    // Try extracting JSON from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const obj = JSON.parse(match[1].trim());
        if (isValidReview(obj)) return obj;
      } catch {
        // fall through
      }
    }
  }
  return null;
}

function isValidReview(obj: unknown): obj is RawReview {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.passed === "boolean" &&
    typeof o.confidence_score === "number" &&
    typeof o.reasoning === "string" &&
    Array.isArray(o.issues)
  );
}

// ─── Scoring logic ──────────────────────────────────────────

const VALID_GAP_CATEGORIES = new Set([
  "missing_vocabulary",
  "missing_cultural_context",
  "missing_dialect_knowledge",
  "missing_translation_pair",
]);

function applyScoring(
  parsed: RawReview | null,
  input: ReviewerInput,
  latencyMs: number,
): ReviewerOutput {
  // Unparseable response — low confidence
  if (!parsed) {
    return {
      passed: false,
      confidenceScore: 30,
      reasoning: "Reviewer model returned unparseable output.",
      gapCategory: null,
      issues: ["unparseable_review"],
      latencyMs,
    };
  }

  let confidence = Math.max(0, Math.min(100, parsed.confidence_score));
  let passed = parsed.passed;

  // If any issue is "potential_hallucination" → reduce confidence by 20 and fail
  if (parsed.issues.includes("potential_hallucination")) {
    confidence = Math.max(0, confidence - 20);
    passed = false;
  }

  // If no RAG context was available → cap confidence at 60
  if (input.ragContext.length === 0) {
    confidence = Math.min(confidence, 60);
  }

  // Apply confidence thresholds
  if (confidence >= 70 && !parsed.issues.includes("potential_hallucination")) {
    // Check for critical issues
    const criticalIssues = parsed.issues.filter(
      (i) =>
        i === "potential_hallucination" ||
        i === "cultural_insensitivity" ||
        i === "factual_error",
    );
    passed = criticalIssues.length === 0;
  } else {
    passed = false;
  }

  // Determine gap category
  let gapCategory: ReviewerOutput["gapCategory"] = null;
  if (
    !passed &&
    parsed.gap_category &&
    VALID_GAP_CATEGORIES.has(parsed.gap_category)
  ) {
    gapCategory = parsed.gap_category as ReviewerOutput["gapCategory"];
  }

  return {
    passed,
    confidenceScore: confidence,
    reasoning: parsed.reasoning,
    gapCategory,
    issues: parsed.issues,
    latencyMs,
  };
}
