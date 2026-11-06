/**
 * Model ids for the speech programme's LLM steps, all served by OpenRouter
 * through src/lib/llm/openrouter.ts. One place to change a model.
 *
 * "google/gemini-3.1-pro-preview" was checked against OpenRouter's public
 * model list on 2026-11-05 ($2 in / $12 out per 1M tokens).
 *
 * `judge` is null by default: the triage judge keeps its existing providers
 * until someone sets this or passes a judge model id starting "openrouter/".
 */
export const LLM_CONFIG: {
  toneRestore: string;
  asrCorrect: string;
  judge: string | null;
} = {
  toneRestore: "google/gemini-3.1-pro-preview",
  asrCorrect: "google/gemini-3.1-pro-preview",
  judge: null,
};
