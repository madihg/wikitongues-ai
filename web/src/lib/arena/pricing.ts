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

// Together fine-tune training rates, USD per 1M training tokens (from singulars).
const FINETUNE_PRICE_PER_M: { match: string; rate: number }[] = [
  { match: "llama-3.3-70b", rate: 5 },
  { match: "qwen3-14b", rate: 1 },
  { match: "mistral-nemo", rate: 1 },
];
const DEFAULT_FINETUNE_PRICE_PER_M = 2;

// A coarse default for token count per training row (prompt + completion).
export const APPROX_TOKENS_PER_ROW = 350;

/** Estimate the USD cost of a fine-tune training run from row count + epochs. */
export function estimateFineTuneCostUsd(args: {
  baseModelId: string;
  nRows: number;
  nEpochs?: number;
  tokensPerRow?: number;
}): number {
  const id = (args.baseModelId || "").toLowerCase();
  const rate =
    FINETUNE_PRICE_PER_M.find((r) => id.includes(r.match))?.rate ??
    DEFAULT_FINETUNE_PRICE_PER_M;
  const tokens =
    args.nRows *
    (args.tokensPerRow ?? APPROX_TOKENS_PER_ROW) *
    (args.nEpochs ?? 3);
  return (tokens / 1_000_000) * rate;
}

/** Round a USD amount to cents. */
export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
