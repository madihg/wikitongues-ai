import { generateText } from "ai";
import { resolveModel, type CandidateLike } from "./providers";

/**
 * LLM-as-judge — restricted to TRIAGE. A frontier model is not a reliable judge
 * of a language it is itself poor at (Igala), so this never produces a score of
 * record. Every judgment is run twice with positions swapped; only swap-consistent
 * verdicts are trustworthy, and the swap-agreement rate is reported as a
 * reliability metric.
 */

export interface JudgeVerdict {
  winner: "a" | "b" | "tie";
  rationale: string;
}

export interface SwapJudgeResult {
  /** Winner in terms of the caller's x / y, or tie if the swap disagreed. */
  winner: "x" | "y" | "tie";
  swapAgreement: boolean;
  rationale: string;
  raw: [JudgeVerdict, JudgeVerdict];
}

const JUDGE_SYSTEM =
  "You are a TRIAGE judge for Igala-language responses. You may be unreliable at Igala; " +
  "your verdict is used only for cheap screening between expensive human rounds, NEVER as a " +
  "score of record. Given a prompt and two candidate responses A and B, decide which is the " +
  'better Igala response, or "tie". Respond ONLY with JSON: {"winner":"a"|"b"|"tie","rationale":"..."}.';

export function inferJudgeProvider(modelId: string): CandidateLike["provider"] {
  const m = modelId.toLowerCase();
  if (
    m.startsWith("gpt") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  )
    return "openai";
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gemini") || m.startsWith("gemma")) return "google";
  return "openai-compatible";
}

function parseVerdict(text: string): JudgeVerdict {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : text);
    const winner =
      obj.winner === "a" || obj.winner === "b" ? obj.winner : "tie";
    return {
      winner,
      rationale: typeof obj.rationale === "string" ? obj.rationale : "",
    };
  } catch {
    return { winner: "tie", rationale: "unparseable judge output" };
  }
}

async function judgeOnce(
  judgeModelId: string,
  args: { promptText: string; a: string; b: string },
): Promise<JudgeVerdict> {
  const candidate: CandidateLike = {
    provider: inferJudgeProvider(judgeModelId),
    baseModelId: judgeModelId,
  };
  const result = await generateText({
    model: resolveModel(candidate),
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `PROMPT:\n${args.promptText}\n\nRESPONSE A:\n${args.a}\n\nRESPONSE B:\n${args.b}\n\nReturn JSON only.`,
      },
    ],
    temperature: 0,
    maxOutputTokens: 400,
  });
  return parseVerdict(result.text);
}

/** Judge x vs y twice with positions swapped; trustworthy only when swap-consistent. */
export async function judgeWithSwap(
  judgeModelId: string,
  args: { promptText: string; x: string; y: string },
): Promise<SwapJudgeResult> {
  // Pass 1: x=A, y=B. Pass 2: y=A, x=B.
  const v1 = await judgeOnce(judgeModelId, {
    promptText: args.promptText,
    a: args.x,
    b: args.y,
  });
  const v2 = await judgeOnce(judgeModelId, {
    promptText: args.promptText,
    a: args.y,
    b: args.x,
  });

  // Map verdicts to x/y.
  const w1: "x" | "y" | "tie" =
    v1.winner === "a" ? "x" : v1.winner === "b" ? "y" : "tie";
  const w2: "x" | "y" | "tie" =
    v2.winner === "a" ? "y" : v2.winner === "b" ? "x" : "tie";

  const swapAgreement = w1 === w2 && w1 !== "tie";
  return {
    winner: swapAgreement ? w1 : "tie",
    swapAgreement,
    rationale: v1.rationale || v2.rationale,
    raw: [v1, v2],
  };
}
