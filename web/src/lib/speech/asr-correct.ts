import { chat } from "@/lib/llm/openrouter";
import { LLM_CONFIG } from "./llm-config";

/**
 * ASR transcript correction (PRD US-024), used by the Check panel.
 *
 * CONTRACT: never call this in a request path that has not already shown the
 * reviewer the speaker's own text. The model's transcript must appear only
 * after the speaker's text is locked and the reviewer has given a first
 * verdict, and it is never saved as the transcript. This file does not
 * enforce that; PR G's route does.
 *
 * No Igala forcing instruction is added: the prompt is exactly the one below.
 */

export const ASR_CORRECT_SYSTEM =
  "You correct a speech-recognition transcript of Igala. You are given one or " +
  "more candidate transcripts of the same recording, best first, and " +
  "optionally an English gloss of what was said. Return the single most " +
  "likely correct transcript. Fix recognition errors only; keep the speaker's " +
  "words, spelling conventions and tone marks. If the first candidate looks " +
  "right, return it unchanged. Reply with the transcript only.";

export interface CorrectArgs {
  candidates: string[];
  glossEnglish?: string;
  refType?: string;
  refId?: string;
}

export async function correctTranscript(
  args: CorrectArgs,
): Promise<{ corrected: string; changed: boolean }> {
  if (args.candidates.length === 0) {
    throw new Error("correctTranscript needs at least one candidate.");
  }
  const lines = args.candidates.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const gloss = args.glossEnglish ? `\n\nEnglish gloss: ${args.glossEnglish}` : "";
  const res = await chat(
    [
      { role: "system", content: ASR_CORRECT_SYSTEM },
      { role: "user", content: `Candidates:\n${lines}${gloss}` },
    ],
    {
      model: LLM_CONFIG.asrCorrect,
      maxTokens: 2048, // headroom for a reasoning model
      temperature: 0,
      refType: args.refType,
      refId: args.refId,
      label: "asr correct",
    },
  );
  const corrected = res.text.trim();
  return { corrected, changed: corrected !== args.candidates[0].trim() };
}
