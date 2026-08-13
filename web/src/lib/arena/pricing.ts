/**
 * Cost estimation for the holistic ledger.
 *
 * Providers do not return per-call cost in their responses, so we estimate from
 * token counts against a published-rate table (mirrors singulars' eval-cost.ts).
 * Estimates are clearly flagged as such on every CostEntry. Rates are USD per 1M
 * tokens and are approximate — update as provider pricing changes.
 */

export interface TokenPrice {
  input: number; // USD / 1M input tokens
  output: number; // USD / 1M output tokens
}

// Matched by substring against the model id (lowercased), most specific first.
const INFERENCE_PRICE: { match: string; price: TokenPrice }[] = [
  { match: "claude-sonnet-4-5", price: { input: 3, output: 15 } },
  // Opus 5 is priced at Opus 4.8's rate ($5/$25), NOT the older claude-opus
  // $15/$75 row below - this entry must stay above that substring match.
  { match: "claude-opus-5", price: { input: 5, output: 25 } },
  { match: "claude-3-5-sonnet", price: { input: 3, output: 15 } },
  { match: "claude-3-5-haiku", price: { input: 0.8, output: 4 } },
  { match: "claude-opus", price: { input: 15, output: 75 } },
  { match: "gpt-4o-mini", price: { input: 0.15, output: 0.6 } },
  { match: "gpt-4o", price: { input: 2.5, output: 10 } },
  { match: "gpt-4.1", price: { input: 2, output: 8 } },
  { match: "gemini-2.0-flash", price: { input: 0.1, output: 0.4 } },
  { match: "gemini-1.5-flash", price: { input: 0.075, output: 0.3 } },
  { match: "gemini-1.5-pro", price: { input: 1.25, output: 5 } },
  { match: "llama-3.3-70b", price: { input: 0.88, output: 0.88 } },
  { match: "qwen3-14b", price: { input: 0.3, output: 0.3 } },
  { match: "mistral-nemo", price: { input: 0.3, output: 0.3 } },
];

const DEFAULT_INFERENCE_PRICE: TokenPrice = { input: 1, output: 3 };

export function priceForModel(modelId: string): TokenPrice {
  const id = (modelId || "").toLowerCase();
  for (const { match, price } of INFERENCE_PRICE) {
    if (id.includes(match)) return price;
  }
  return DEFAULT_INFERENCE_PRICE;
}

/** Estimate the USD cost of a single generation / judge call from its token counts. */
export function estimateGenerationCostUsd(args: {
  modelId: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
}): number {
  const p = priceForModel(args.modelId);
  const tin = args.tokensIn ?? 0;
  const tout = args.tokensOut ?? 0;
  return (tin / 1_000_000) * p.input + (tout / 1_000_000) * p.output;
}

// Fine-tune TRAINING rates, USD per 1M training tokens. Together rates come from
// singulars; OpenAI rates are the published fine-tuning training prices. Matched
// by substring, most specific first (gpt-4.1-mini must precede gpt-4.1).
const FINETUNE_PRICE_PER_M: { match: string; rate: number }[] = [
  { match: "llama-3.3-70b", rate: 5 },
  { match: "qwen3-14b", rate: 1 },
  { match: "mistral-nemo", rate: 1 },
  { match: "gpt-4.1-mini", rate: 5 },
  { match: "gpt-4.1-nano", rate: 1.5 },
  { match: "gpt-4.1", rate: 25 },
  { match: "gpt-4o-mini", rate: 3 },
  { match: "gpt-4o", rate: 25 },
];
const DEFAULT_FINETUNE_PRICE_PER_M = 2;

// A coarse default for token count per training row (prompt + completion).
export const APPROX_TOKENS_PER_ROW = 350;

/** USD per 1M training tokens for a base model. */
export function fineTuneRatePerMTokens(baseModelId: string): number {
  const id = (baseModelId || "").toLowerCase();
  return (
    FINETUNE_PRICE_PER_M.find((r) => id.includes(r.match))?.rate ??
    DEFAULT_FINETUNE_PRICE_PER_M
  );
}

/** Estimate the USD cost of a fine-tune training run from row count + epochs. */
export function estimateFineTuneCostUsd(args: {
  baseModelId: string;
  nRows: number;
  nEpochs?: number;
  tokensPerRow?: number;
}): number {
  const tokens =
    args.nRows *
    (args.tokensPerRow ?? APPROX_TOKENS_PER_ROW) *
    (args.nEpochs ?? 3);
  return (tokens / 1_000_000) * fineTuneRatePerMTokens(args.baseModelId);
}

/**
 * Cost of a fine-tune from the provider's REPORTED trained-token count. Beats
 * estimateFineTuneCostUsd whenever the provider reports tokens (OpenAI does, as
 * `trained_tokens`, with epochs already folded in) but not a billed amount.
 */
export function fineTuneCostFromTokensUsd(args: {
  baseModelId: string;
  trainedTokens: number;
}): number {
  return (
    (args.trainedTokens / 1_000_000) * fineTuneRatePerMTokens(args.baseModelId)
  );
}

/** Round a USD amount to cents. */
export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
